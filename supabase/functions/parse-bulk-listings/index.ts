// parse-bulk-listings
//
// Admin AI Intake: receives blocks of raw listing text (each block may contain
// one or many listings), parses them with Claude into structured listing data,
// geocodes the cross streets, and upserts them into scraped_listings via the
// shared intake pipeline (source = 'admin_intake'). Cross-source dedup means a
// pasted listing that also appears in a pamphlet/scrape collapses onto one row.
//
// Admin-only: the caller's JWT must carry app_metadata.is_admin = true.
// Required secrets: ANTHROPIC_API_KEY

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { corsHeaders } from '../_shared/cors.ts';
import {
  DEFAULT_MODEL,
  parseContent,
  geocodeListing,
  upsertScrapedListing,
  type ParsedListing,
} from '../_shared/intake.ts';

interface IntakeImage {
  filePath: string;
  publicUrl: string;
  is_featured: boolean;
}

interface IntakeBlock {
  text: string;
  type_hint?: 'auto' | 'rental' | 'sale';
  assigned_user_id?: string | null;
  admin_custom_agency_name?: string | null;
  admin_listing_type_display?: 'agent' | 'owner' | null;
  image_paths?: IntakeImage[];
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
      console.error(`[parse-bulk-listings:${requestId}] Not admin:`, user.id);
      return json({ error: 'Admin privileges required' }, 403);
    }

    // --- Validate input -----------------------------------------------------
    const body = await req.json();
    const blocks: IntakeBlock[] = Array.isArray(body?.blocks) ? body.blocks : [];
    const validBlocks = blocks.filter(
      (b) => typeof b.text === 'string' && b.text.trim().length > 0,
    );
    if (validBlocks.length === 0) return json({ error: 'No text blocks provided' }, 400);
    if (validBlocks.length > 20) return json({ error: 'Too many blocks (max 20 per run)' }, 400);

    console.log(
      `[parse-bulk-listings:${requestId}] Admin ${user.id}: ${validBlocks.length} block(s), model ${model}`,
    );

    // --- Create batch (scrape_runs) row ------------------------------------
    const today = new Date().toISOString().slice(0, 10);
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

    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const errors: Array<{ block: number; error: string }> = [];

    // --- Parse all blocks in parallel ---------------------------------------
    const blockResults = await Promise.all(
      validBlocks.map(async (block, blockIndex) => {
        try {
          const listings = await parseContent(
            anthropic,
            model,
            block.text,
            block.type_hint || 'auto',
          );
          console.log(
            `[parse-bulk-listings:${requestId}] Block ${blockIndex}: ${listings.length} listing(s)`,
          );
          return { blockIndex, block, listings };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[parse-bulk-listings:${requestId}] Block ${blockIndex} failed:`, message);
          errors.push({ block: blockIndex, error: message });
          return { blockIndex, block, listings: [] as ParsedListing[] };
        }
      }),
    );

    // --- Geocode + upsert (collapse dupes) ----------------------------------
    let inserted = 0;
    let updated = 0;
    let geocoded = 0;
    let totalParsed = 0;

    for (const { blockIndex, block, listings } of blockResults) {
      totalParsed += listings.length;
      for (const listing of listings) {
        const geo = await geocodeListing(supabaseUrl, anonKey, listing);
        if (geo.status === 'success') geocoded++;
        try {
          const outcome = await upsertScrapedListing(supabase, listing, geo, {
            source: 'admin_intake',
            runId: run.id,
            blockIndex,
            pdfDate: today,
            images: Array.isArray(block.image_paths) ? block.image_paths : [],
            assignedUserId: block.assigned_user_id || null,
            adminCustomAgencyName: block.admin_custom_agency_name || null,
            adminListingTypeDisplay: block.admin_listing_type_display || null,
          });
          if (outcome === 'inserted') inserted++;
          else updated++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[parse-bulk-listings:${requestId}] Upsert failed:`, message);
          errors.push({ block: blockIndex, error: message });
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
      `[parse-bulk-listings:${requestId}] Done: ${totalParsed} parsed, ${inserted} new, ${updated} merged, ${geocoded} geocoded, ${errors.length} error(s)`,
    );

    return json({ run_id: run.id, parsed: totalParsed, inserted, updated, geocoded, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[parse-bulk-listings:${requestId}] Fatal:`, message);
    return json({ error: message }, 500);
  }
});
