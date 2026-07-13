// parse-pamphlet
//
// Admin listing intake from an uploaded community pamphlet — a Luach HaTsibbur
// / Kol Berama / Heimish Agent booklet (PDF or scanned photos). The client
// uploads the file(s) to storage and passes their paths here; this function
// hands the document/images to Claude (vision + OCR), extracts every listing
// via the shared intake pipeline, and upserts them into scraped_listings under
// the chosen publication source. Cross-source dedup collapses re-runs and
// listings that also appear in another feed onto one row.
//
// Admin-only: the caller's JWT must carry app_metadata.is_admin = true.
// Required secrets: ANTHROPIC_API_KEY

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { Buffer } from 'node:buffer';
import { corsHeaders } from '../_shared/cors.ts';
import {
  DEFAULT_MODEL,
  parseContent,
  geocodeListing,
  upsertScrapedListing,
} from '../_shared/intake.ts';

const SOURCE_LABELS: Record<string, string> = {
  luach_hatsibbur: 'Luach HaTsibbur',
  kol_berama: 'Kol Berama',
  heimish_agent: 'Heimish Agent booklet',
  other_pamphlet: 'community pamphlet',
};

const STORAGE_BUCKET = 'listing-images';
const MAX_FILES = 12;

interface UploadedFile {
  path: string; // storage path within STORAGE_BUCKET
  mime: string; // 'application/pdf' | 'image/jpeg' | 'image/png' | ...
  name?: string;
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID().substring(0, 8);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    const model = Deno.env.get('ANTHROPIC_MODEL') || DEFAULT_MODEL;

    if (!anthropicKey) {
      return json({ error: 'AI parsing is not configured (missing API key).' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // --- Admin auth ---------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentication required' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Invalid authentication' }, 401);
    if (user.app_metadata?.is_admin !== true) {
      return json({ error: 'Admin privileges required' }, 403);
    }

    // --- Validate input -----------------------------------------------------
    const body = await req.json();
    const source: string = typeof body?.source === 'string' ? body.source : 'other_pamphlet';
    if (!SOURCE_LABELS[source]) return json({ error: `Unknown source: ${source}` }, 400);
    const typeHint: string = ['auto', 'rental', 'sale'].includes(body?.type_hint)
      ? body.type_hint
      : 'auto';
    const files: UploadedFile[] = Array.isArray(body?.files) ? body.files : [];
    const validFiles = files.filter((f) => f && typeof f.path === 'string' && f.path.length > 0);
    if (validFiles.length === 0) return json({ error: 'No files provided' }, 400);
    if (validFiles.length > MAX_FILES) {
      return json({ error: `Too many files (max ${MAX_FILES} per run)` }, 400);
    }

    console.log(
      `[parse-pamphlet:${requestId}] Admin ${user.id}: source=${source}, ${validFiles.length} file(s), model ${model}`,
    );

    // --- Download the uploaded files and build Claude content units ---------
    // A "unit" is one Claude call: each PDF is its own unit; all photos are
    // combined into one unit (they are pages of a single booklet).
    const pdfUnits: Anthropic.ContentBlockParam[][] = [];
    const imageBlocks: Anthropic.ContentBlockParam[] = [];

    for (const file of validFiles) {
      const { data: blob, error: dlError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(file.path);
      if (dlError || !blob) {
        console.error(`[parse-pamphlet:${requestId}] download failed:`, file.path, dlError);
        return json({ error: `Could not read uploaded file: ${file.name || file.path}` }, 400);
      }
      const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
      const mime = file.mime || blob.type || 'application/octet-stream';

      if (mime === 'application/pdf') {
        pdfUnits.push([
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        ]);
      } else if (mime.startsWith('image/')) {
        imageBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: mime as never, data: b64 },
        });
      } else {
        return json({ error: `Unsupported file type: ${mime} (${file.name || file.path})` }, 400);
      }
    }

    const units: Anthropic.ContentBlockParam[][] = [...pdfUnits];
    if (imageBlocks.length > 0) units.push(imageBlocks);

    const label = SOURCE_LABELS[source];
    const extraContext = `This content is a "${label}" — a Brooklyn Orthodox-Jewish community classifieds pamphlet. Read every page, including scanned images, and extract each real estate rental or sale listing.`;

    // --- Create run row -----------------------------------------------------
    const today = new Date().toISOString().slice(0, 10);
    const fileNames = validFiles.map((f) => f.name || f.path.split('/').pop()).join(', ');
    const { data: run, error: runError } = await supabase
      .from('scrape_runs')
      .insert({
        source,
        pdf_date: today,
        pdf_filename: fileNames,
        total_pages: null,
        status: 'running',
        created_by: user.id,
      })
      .select('id')
      .single();
    if (runError || !run) {
      return json({ error: 'Failed to create intake run' }, 500);
    }

    // --- Parse each unit with Claude (in parallel) --------------------------
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const errors: Array<{ unit: number; error: string }> = [];

    const unitResults = await Promise.all(
      units.map(async (blocks, unitIndex) => {
        try {
          const listings = await parseContent(anthropic, model, blocks, typeHint, extraContext);
          console.log(
            `[parse-pamphlet:${requestId}] Unit ${unitIndex}: ${listings.length} listing(s)`,
          );
          return listings;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[parse-pamphlet:${requestId}] Unit ${unitIndex} failed:`, message);
          errors.push({ unit: unitIndex, error: message });
          return [];
        }
      }),
    );

    // --- Geocode + upsert (collapse dupes) ----------------------------------
    let inserted = 0;
    let updated = 0;
    let geocoded = 0;
    let totalParsed = 0;

    for (const listings of unitResults) {
      totalParsed += listings.length;
      for (const listing of listings) {
        const geo = await geocodeListing(supabaseUrl, anonKey, listing);
        if (geo.status === 'success') geocoded++;
        try {
          const outcome = await upsertScrapedListing(supabase, listing, geo, {
            source,
            runId: run.id,
            pdfDate: today,
          });
          if (outcome === 'inserted') inserted++;
          else updated++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[parse-pamphlet:${requestId}] Upsert failed:`, message);
          errors.push({ unit: -1, error: message });
        }
      }
    }

    await supabase
      .from('scrape_runs')
      .update({
        listings_parsed: totalParsed,
        listings_geocoded: geocoded,
        listings_inserted: inserted,
        listings_updated: updated,
        errors,
        status: errors.length > 0 && inserted === 0 && updated === 0 ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    console.log(
      `[parse-pamphlet:${requestId}] Done: ${totalParsed} parsed, ${inserted} new, ${updated} merged, ${geocoded} geocoded, ${errors.length} error(s)`,
    );

    return json({ run_id: run.id, source, parsed: totalParsed, inserted, updated, geocoded, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[parse-pamphlet:${requestId}] Fatal:`, message);
    return json({ error: message }, 500);
  }
});
