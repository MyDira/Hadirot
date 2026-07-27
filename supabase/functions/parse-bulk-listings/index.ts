// parse-bulk-listings
//
// Admin AI Intake (pasted text): receives raw listing text, parses it with
// Claude into structured listing data, geocodes the cross streets, and upserts
// into scraped_listings via the shared intake pipeline (source =
// 'admin_intake'). Cross-source dedup means a pasted listing that also appears
// in a pamphlet/scrape collapses onto one row.
//
// Client-driven in three actions — same shape as parse-pamphlet — so no single
// request has to outlive the edge-function wall clock. A big paste used to run
// every Claude call plus a serial geocode-per-listing loop inside ONE request;
// past ~30 rows that request was killed by the gateway, the caller saw a bare
// "parsing failed", and the scrape_runs row was orphaned in status 'running'.
//
//   action "start"    — admin auth + create the scrape_runs row. Returns { run_id }.
//   action "unit"     — parse ONE unit of text, geocode + upsert its listings.
//                       Returns per-unit counts. Retryable on its own.
//   action "finalize" — stamp the run completed/failed with the totals.
//
// The client (src/services/aiIntake.ts) splits blocks into units, drives the
// unit calls with bounded concurrency, and retries a failed unit individually —
// so a transient hiccup costs one unit's tokens, never the whole paste's.
//
// Admin-only: the caller's JWT must carry app_metadata.is_admin = true.
// Required secrets: ANTHROPIC_API_KEY

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { corsHeaders } from '../_shared/cors.ts';
import {
  DEFAULT_MODEL,
  parseContent,
  geocodeListing,
  upsertScrapedListing,
} from '../_shared/intake.ts';

interface IntakeImage {
  filePath: string;
  publicUrl: string;
  is_featured: boolean;
}

/** One unit of Claude work. The client plans these; see splitBlocksIntoUnits. */
interface IntakeUnit {
  text: string;
  /** Index of the pasted block this unit came from — used for error labels. */
  block_index?: number;
  type_hint?: 'auto' | 'rental' | 'sale';
  assigned_user_id?: string | null;
  admin_custom_agency_name?: string | null;
  admin_listing_type_display?: 'agent' | 'owner' | null;
  image_paths?: IntakeImage[];
  /** true when the unit was cut out of a run-on paste with no blank-line breaks. */
  partial?: boolean;
}

// A unit is capped client-side at ~25 rows; this is the backstop that keeps a
// single Claude call inside its 64k output budget (a 49-listing call measured
// 51.5k output tokens).
const MAX_UNIT_CHARS = 40000;
// Geocoding is a network round-trip per listing to geocode-cross-streets and
// was the single biggest avoidable slice of wall clock — one serial call per
// listing. It is a pure read, so running it in a pool is safe.
//
// The upserts stay SERIAL on purpose: upsertScrapedListing is a SELECT on
// dedup_key followed by an INSERT, so two concurrent listings that collapse
// onto the same key would both miss and both insert. It is fast (local DB) and
// not what was blowing the wall clock.
const GEOCODE_CONCURRENCY = 5;

/** Map fn over items with a bounded pool, preserving order. fn must not reject. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
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
      console.error(`[parse-bulk-listings:${requestId}] ANTHROPIC_API_KEY not configured`);
      return json({ error: 'AI parsing is not configured (missing API key).' }, 500);
    }

    const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey);

    // --- Admin auth (every action is its own request) -----------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentication required' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Invalid authentication' }, 401);
    if (user.app_metadata?.is_admin !== true) {
      console.error(`[parse-bulk-listings:${requestId}] Not admin:`, user.id);
      return json({ error: 'Admin privileges required' }, 403);
    }

    const body = await req.json();
    const action: string = body?.action || '';
    const today = new Date().toISOString().slice(0, 10);

    // =======================================================================
    // action: start — create the run
    // =======================================================================
    if (action === 'start') {
      const { data: run, error: runError } = await supabase
        .from('scrape_runs')
        .insert({
          source: 'admin_intake',
          pdf_date: today,
          status: 'running',
          created_by: user.id,
        })
        .select('id')
        .single();
      if (runError || !run) {
        console.error(`[parse-bulk-listings:${requestId}] Failed to create run:`, runError);
        return json({ error: 'Failed to create parse batch' }, 500);
      }
      console.log(`[parse-bulk-listings:${requestId}] Admin ${user.id} started run ${run.id}`);
      return json({ run_id: run.id });
    }

    // =======================================================================
    // action: unit — parse one unit of text, geocode + upsert its listings
    // =======================================================================
    if (action === 'unit') {
      const runId: string | null = typeof body?.run_id === 'string' ? body.run_id : null;
      if (!runId) return json({ error: 'run_id is required' }, 400);

      const unit: IntakeUnit | null =
        body?.unit && typeof body.unit === 'object' ? body.unit : null;
      const text = typeof unit?.text === 'string' ? unit.text.trim() : '';
      if (!unit || !text) return json({ error: 'unit text is required' }, 400);
      if (text.length > MAX_UNIT_CHARS) {
        return json({ error: `unit text is too large (max ${MAX_UNIT_CHARS} chars)` }, 400);
      }

      const blockIndex = Number.isFinite(unit.block_index) ? Number(unit.block_index) : 0;

      // Kept deliberately short — this rides along on every unit call, and the
      // cached system prompt already carries the extraction rulebook.
      const extraContext = unit.partial
        ? 'This is an excerpt from a longer pasted list. If a listing at the very start or end is cut off mid-text, skip it unless its contact or location is visible.'
        : undefined;

      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const listings = await parseContent(
        anthropic,
        model,
        text,
        unit.type_hint || 'auto',
        extraContext,
        'Too many listings in one block — split the pasted text into smaller blocks and retry.',
      );

      let inserted = 0;
      let updated = 0;
      let geocoded = 0;
      const errors: Array<{ error: string }> = [];
      const images = Array.isArray(unit.image_paths) ? unit.image_paths : [];

      const geos = await mapPool(listings, GEOCODE_CONCURRENCY, (listing) =>
        geocodeListing(supabaseUrl, anonKey, listing),
      );

      for (const [i, listing] of listings.entries()) {
        const geo = geos[i];
        if (geo.status === 'success') geocoded++;
        try {
          const outcome = await upsertScrapedListing(supabase, listing, geo, {
            source: 'admin_intake',
            runId,
            blockIndex,
            pdfDate: today,
            images,
            assignedUserId: unit.assigned_user_id || null,
            adminCustomAgencyName: unit.admin_custom_agency_name || null,
            adminListingTypeDisplay: unit.admin_listing_type_display || null,
          });
          if (outcome === 'inserted') inserted++;
          else updated++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[parse-bulk-listings:${requestId}] Upsert failed:`, message);
          errors.push({ error: message });
        }
      }

      console.log(
        `[parse-bulk-listings:${requestId}] unit (block ${blockIndex}): ${listings.length} parsed, ${inserted} new, ${updated} merged, ${errors.length} error(s)`,
      );
      return json({ parsed: listings.length, inserted, updated, geocoded, errors });
    }

    // =======================================================================
    // action: finalize — stamp the run with totals
    // =======================================================================
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
        `[parse-bulk-listings:${requestId}] finalize ${runId}: ${parsed} parsed, ${inserted} new, ${updated} merged, ${errors.length} error(s)`,
      );
      return json({ ok: true });
    }

    return json(
      {
        error: `Unknown action: ${action || '(none)'} — reload the admin page to pick up the current intake client.`,
      },
      400,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[parse-bulk-listings:${requestId}] Fatal:`, message);
    return json({ error: message }, 500);
  }
});
