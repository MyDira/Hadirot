// parse-pamphlet
//
// Admin listing intake from an uploaded community pamphlet — a Luach HaTsibbur
// / Kol Berama / Heimish Agent booklet (PDF or scanned photos). Booklets run up
// to 50+ pages and a full parse takes minutes, so the work is split into
// page-range chunks the CLIENT drives (each call stays well inside edge-function
// wall-clock limits, failures are retryable per chunk, and the admin sees
// progress):
//
//   action "start"    — inspect the uploaded files, plan the chunks, create the
//                       scrape_runs row. Returns { run_id, chunks }.
//   action "chunk"    — extract one page range (pdf-lib) or image group, parse
//                       it with Claude (vision), geocode, and upsert into
//                       scraped_listings. Returns per-chunk counts.
//   action "finalize" — stamp the run completed/failed with the totals.
//
// Chunks overlap by one page so a listing that spans a page boundary is never
// lost; the shared upsert's same-run guard keeps the overlap from double
// counting sightings.
//
// Admin-only: the caller's JWT must carry app_metadata.is_admin = true.
// Required secrets: ANTHROPIC_API_KEY

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';
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
const PAGES_PER_CHUNK = 5; // pages of new content per Claude call
const CHUNK_OVERLAP = 1; // shared page between consecutive chunks
const IMAGES_PER_CHUNK = 4;

interface UploadedFile {
  path: string;
  mime: string;
  name?: string;
}

/** One unit of Claude work the client will request via action "chunk". */
interface ChunkPlan {
  file: UploadedFile;
  kind: 'pdf' | 'images';
  page_from?: number; // 1-based inclusive (pdf only)
  page_to?: number; // 1-based inclusive (pdf only)
  /** For image chunks: all files in the group (page photos). */
  files?: UploadedFile[];
}

async function downloadFile(
  supabase: SupabaseClient,
  path: string,
): Promise<Uint8Array> {
  const { data: blob, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
  if (error || !blob) throw new Error(`Could not read uploaded file: ${path}`);
  return new Uint8Array(await blob.arrayBuffer());
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

    const body = await req.json();
    const action: string = body?.action || 'start';
    const source: string = typeof body?.source === 'string' ? body.source : 'other_pamphlet';
    if (!SOURCE_LABELS[source]) return json({ error: `Unknown source: ${source}` }, 400);

    // =========================================================================
    // action: start — plan chunks + create the run row
    // =========================================================================
    if (action === 'start') {
      const files: UploadedFile[] = Array.isArray(body?.files) ? body.files : [];
      const validFiles = files.filter((f) => f && typeof f.path === 'string' && f.path.length > 0);
      if (validFiles.length === 0) return json({ error: 'No files provided' }, 400);
      if (validFiles.length > MAX_FILES) {
        return json({ error: `Too many files (max ${MAX_FILES} per run)` }, 400);
      }

      const chunks: ChunkPlan[] = [];
      const imageFiles: UploadedFile[] = [];
      let totalPages = 0;

      for (const file of validFiles) {
        if (file.mime === 'application/pdf') {
          const bytes = await downloadFile(supabase, file.path);
          const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const pageCount = doc.getPageCount();
          totalPages += pageCount;
          // Chunks advance by (PAGES_PER_CHUNK - CHUNK_OVERLAP) so consecutive
          // chunks share one page: 1-5, 5-9, 9-13, ...
          const step = PAGES_PER_CHUNK - CHUNK_OVERLAP;
          for (let from = 1; from <= pageCount; from += step) {
            const to = Math.min(from + PAGES_PER_CHUNK - 1, pageCount);
            chunks.push({ file, kind: 'pdf', page_from: from, page_to: to });
            if (to >= pageCount) break;
          }
        } else if (file.mime.startsWith('image/')) {
          imageFiles.push(file);
        } else {
          return json({ error: `Unsupported file type: ${file.mime} (${file.name || file.path})` }, 400);
        }
      }
      for (let i = 0; i < imageFiles.length; i += IMAGES_PER_CHUNK) {
        const group = imageFiles.slice(i, i + IMAGES_PER_CHUNK);
        totalPages += group.length;
        chunks.push({ file: group[0], kind: 'images', files: group });
      }

      const today = new Date().toISOString().slice(0, 10);
      const fileNames = validFiles.map((f) => f.name || f.path.split('/').pop()).join(', ');
      const { data: run, error: runError } = await supabase
        .from('scrape_runs')
        .insert({
          source,
          pdf_date: today,
          pdf_filename: fileNames,
          total_pages: totalPages,
          status: 'running',
          created_by: user.id,
        })
        .select('id')
        .single();
      if (runError || !run) return json({ error: 'Failed to create intake run' }, 500);

      console.log(
        `[parse-pamphlet:${requestId}] start: admin ${user.id}, source=${source}, ${validFiles.length} file(s), ${totalPages} pages, ${chunks.length} chunk(s)`,
      );
      return json({ run_id: run.id, chunks, total_pages: totalPages });
    }

    // =========================================================================
    // action: chunk — parse one page range / image group
    // =========================================================================
    if (action === 'chunk') {
      const runId: string | null = typeof body?.run_id === 'string' ? body.run_id : null;
      if (!runId) return json({ error: 'run_id is required' }, 400);
      const typeHint: string = ['auto', 'rental', 'sale'].includes(body?.type_hint)
        ? body.type_hint
        : 'auto';
      const chunk: ChunkPlan | null = body?.chunk && typeof body.chunk === 'object' ? body.chunk : null;
      if (!chunk?.file?.path) return json({ error: 'chunk descriptor is required' }, 400);

      const content: Anthropic.ContentBlockParam[] = [];
      let pageNote = '';

      if (chunk.kind === 'pdf') {
        const from = Math.max(1, Number(chunk.page_from) || 1);
        const to = Math.max(from, Number(chunk.page_to) || from);
        const bytes = await downloadFile(supabase, chunk.file.path);
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const out = await PDFDocument.create();
        const indices = [];
        for (let p = from; p <= Math.min(to, src.getPageCount()); p++) indices.push(p - 1);
        const pages = await out.copyPages(src, indices);
        pages.forEach((pg) => out.addPage(pg));
        const partBytes = await out.save();
        content.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: Buffer.from(partBytes).toString('base64'),
          },
        });
        pageNote = ` (pages ${from}-${to})`;
      } else {
        const group = Array.isArray(chunk.files) && chunk.files.length > 0 ? chunk.files : [chunk.file];
        for (const f of group) {
          const bytes = await downloadFile(supabase, f.path);
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: (f.mime || 'image/jpeg') as never,
              data: Buffer.from(bytes).toString('base64'),
            },
          });
        }
        pageNote = ` (${content.length} photo(s))`;
      }

      const label = SOURCE_LABELS[source];
      const extraContext = `This content is part of a "${label}" — a Brooklyn Orthodox-Jewish community classifieds pamphlet${pageNote}. Read every page, including scanned images, and extract each real estate rental or sale listing. If a listing at the very start or end of the excerpt is cut off mid-text, skip it unless its key details (contact or location) are visible.`;

      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const listings = await parseContent(anthropic, model, content, typeHint, extraContext);

      const today = new Date().toISOString().slice(0, 10);
      let inserted = 0;
      let updated = 0;
      let geocoded = 0;
      const errors: Array<{ error: string }> = [];

      for (const listing of listings) {
        const geo = await geocodeListing(supabaseUrl, anonKey, listing);
        if (geo.status === 'success') geocoded++;
        try {
          const outcome = await upsertScrapedListing(supabase, listing, geo, {
            source,
            runId,
            pdfDate: today,
          });
          if (outcome === 'inserted') inserted++;
          else updated++;
        } catch (err) {
          errors.push({ error: err instanceof Error ? err.message : String(err) });
        }
      }

      console.log(
        `[parse-pamphlet:${requestId}] chunk${pageNote}: ${listings.length} parsed, ${inserted} new, ${updated} merged, ${errors.length} error(s)`,
      );
      return json({ parsed: listings.length, inserted, updated, geocoded, errors });
    }

    // =========================================================================
    // action: finalize — stamp the run with totals
    // =========================================================================
    if (action === 'finalize') {
      const runId: string | null = typeof body?.run_id === 'string' ? body.run_id : null;
      if (!runId) return json({ error: 'run_id is required' }, 400);
      const totals = body?.totals || {};
      const errors = Array.isArray(body?.errors) ? body.errors : [];
      const parsed = Number(totals.parsed) || 0;
      const inserted = Number(totals.inserted) || 0;
      const updated = Number(totals.updated) || 0;

      await supabase
        .from('scrape_runs')
        .update({
          listings_parsed: parsed,
          listings_geocoded: Number(totals.geocoded) || 0,
          listings_inserted: inserted,
          listings_updated: updated,
          errors,
          status: errors.length > 0 && inserted === 0 && updated === 0 ? 'failed' : 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);

      console.log(
        `[parse-pamphlet:${requestId}] finalize ${runId}: ${parsed} parsed, ${inserted} new, ${updated} merged, ${errors.length} error(s)`,
      );
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[parse-pamphlet:${requestId}] Fatal:`, message);
    return json({ error: message }, 500);
  }
});
