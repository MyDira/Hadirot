// scrape-luach-com
//
// Admin, button-triggered scrape of the luach.com real-estate section. Fetches
// the server-rendered /apartments index + each detail page, routes every
// listing's text through the SAME Claude parser the pamphlet/text feeds use
// (accuracy first), and upserts into scraped_listings with source = 'luach_com'
// and the per-listing source_url. Cross-source dedup collapses re-scrapes and
// listings that also appear in a pamphlet onto one row.
//
// Admin-only: the caller's JWT must carry app_metadata.is_admin = true.
// Required secrets: ANTHROPIC_API_KEY

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { DOMParser, type Element } from 'jsr:@b-fuze/deno-dom';
import { corsHeaders } from '../_shared/cors.ts';
import {
  DEFAULT_MODEL,
  parseContent,
  geocodeListing,
  upsertScrapedListing,
} from '../_shared/intake.ts';

const BASE = 'https://luach.com';
const INDEX_PATH = '/apartments';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) HadirotLeadBot/1.0 (+contact: aharonpanigel@gmail.com)';
const FETCH_DELAY_MS = 600; // polite gap between detail-page fetches
const PARSE_CONCURRENCY = 4; // Claude calls in flight at once

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

/** Distinct /apartments/<slug> detail slugs on an index page, in order. */
function parseIndexSlugs(html: string): string[] {
  const slugs: string[] = [];
  const seen = new Set<string>();
  const re = /\/apartments\/([a-z0-9-]{3,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1].toLowerCase();
    if (!seen.has(slug)) {
      seen.add(slug);
      slugs.push(slug);
    }
  }
  return slugs;
}

/** "Posted on 06/22/2026" → "2026-06-22". */
function parsePostedDate(text: string): string | null {
  const m = text.match(/Posted on\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/** Extract the human-readable listing text + metadata from a detail page. */
function extractDetail(html: string): { text: string; postedDate: string | null } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pick = (sel: string): string =>
    (doc?.querySelector(sel) as Element | null)?.textContent?.replace(/\s+/g, ' ').trim() || '';

  const title = pick('.listing-title-headline') || pick('h1');
  const address = pick('.listing-address-headline');
  const description = pick('.listing-description');
  const body = doc?.querySelector('.panel-body, main, body')?.textContent || '';
  const bodyText = body.replace(/\s+/g, ' ').trim();

  // Prefer the structured fields; fall back to the whole panel text so Claude
  // still sees the phone number and any details our selectors missed.
  const composed = [title, address, description].filter(Boolean).join('\n');
  const text = composed.length > 40 ? `${composed}\n${bodyText.slice(0, 4000)}` : bodyText.slice(0, 6000);
  return { text, postedDate: parsePostedDate(bodyText) };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
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

    const body = await req.json().catch(() => ({}));
    const pages = Math.min(Math.max(1, parseInt(String(body?.pages ?? 1), 10) || 1), 10);
    const limit = Math.min(Math.max(1, parseInt(String(body?.limit ?? 40), 10) || 40), 120);

    console.log(`[scrape-luach-com:${requestId}] Admin ${user.id}: pages=${pages}, limit=${limit}`);

    // --- Collect detail slugs from the index pages --------------------------
    const allSlugs: string[] = [];
    const seen = new Set<string>();
    try {
      for (let p = 1; p <= pages; p++) {
        const url = p === 1 ? `${BASE}${INDEX_PATH}` : `${BASE}${INDEX_PATH}?page=${p}`;
        const indexHtml = await fetchHtml(url);
        for (const slug of parseIndexSlugs(indexHtml)) {
          if (!seen.has(slug)) {
            seen.add(slug);
            allSlugs.push(slug);
          }
        }
        if (p < pages) await sleep(FETCH_DELAY_MS);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[scrape-luach-com:${requestId}] index fetch failed:`, message);
      return json(
        {
          error: `Could not reach luach.com (${message}). The site may be blocking cloud requests — you can run the local scraper (npm run scrape:luach) as a fallback.`,
        },
        502,
      );
    }

    const slugs = allSlugs.slice(0, limit);
    if (slugs.length === 0) {
      return json({ error: 'No listings found on luach.com — the page layout may have changed.' }, 502);
    }

    // --- Create run row -----------------------------------------------------
    const today = new Date().toISOString().slice(0, 10);
    const { data: run, error: runError } = await supabase
      .from('scrape_runs')
      .insert({
        source: 'luach_com',
        pdf_date: today,
        pdf_filename: `${BASE}${INDEX_PATH}`,
        total_pages: pages,
        status: 'running',
        created_by: user.id,
      })
      .select('id')
      .single();
    if (runError || !run) return json({ error: 'Failed to create scrape run' }, 500);

    // --- Fetch each detail page (sequential + polite) -----------------------
    const details: Array<{ slug: string; text: string; postedDate: string | null }> = [];
    const errors: Array<{ slug: string; error: string }> = [];
    for (const slug of slugs) {
      try {
        const html = await fetchHtml(`${BASE}${INDEX_PATH}/${slug}`);
        const { text, postedDate } = extractDetail(html);
        if (text && text.length > 30) details.push({ slug, text, postedDate });
      } catch (err) {
        errors.push({ slug, error: err instanceof Error ? err.message : String(err) });
      }
      await sleep(FETCH_DELAY_MS);
    }

    // --- Parse each detail with Claude (bounded concurrency) ----------------
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const parsed = await mapWithConcurrency(details, PARSE_CONCURRENCY, async (d) => {
      try {
        const listings = await parseContent(anthropic, model, d.text, 'auto');
        return { detail: d, listings };
      } catch (err) {
        errors.push({ slug: d.slug, error: err instanceof Error ? err.message : String(err) });
        return { detail: d, listings: [] };
      }
    });

    // --- Geocode + upsert (collapse dupes) ----------------------------------
    let inserted = 0;
    let updated = 0;
    let geocoded = 0;
    let totalParsed = 0;

    for (const { detail, listings } of parsed) {
      totalParsed += listings.length;
      for (const listing of listings) {
        const geo = await geocodeListing(supabaseUrl, anonKey, listing);
        if (geo.status === 'success') geocoded++;
        try {
          const outcome = await upsertScrapedListing(supabase, listing, geo, {
            source: 'luach_com',
            runId: run.id,
            sourceUrl: `${BASE}${INDEX_PATH}/${detail.slug}`,
            pdfDate: detail.postedDate || today,
          });
          if (outcome === 'inserted') inserted++;
          else updated++;
        } catch (err) {
          errors.push({ slug: detail.slug, error: err instanceof Error ? err.message : String(err) });
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
      `[scrape-luach-com:${requestId}] Done: ${details.length} pages, ${totalParsed} parsed, ${inserted} new, ${updated} merged, ${errors.length} error(s)`,
    );

    return json({
      run_id: run.id,
      pages_fetched: details.length,
      parsed: totalParsed,
      inserted,
      updated,
      geocoded,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[scrape-luach-com:${requestId}] Fatal:`, message);
    return json({ error: message }, 500);
  }
});
