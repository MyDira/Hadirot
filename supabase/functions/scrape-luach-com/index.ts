// scrape-luach-com
//
// Admin, button-triggered scrape of the luach.com real-estate section. Reads
// the server-rendered /apartments index, filters candidates BY POSTING DATE
// before spending anything on them, fetches only the surviving detail pages,
// and sends them to Claude. Results are upserted into scraped_listings with
// source = 'luach_com' and the per-listing source_url. Cross-source dedup
// collapses re-scrapes and listings that also appear in a pamphlet onto one row.
//
// Two things about luach.com's index drive the design here (verified live
// July 30 2026):
//
//   1. Page 1 opens with a block of PROMOTED cards carrying the CSS class
//      `top-ad-bg`. They are NOT in date order — a promoted card can be weeks
//      old. Everything after that block, and all of page 2+, is strictly
//      newest-first. Taking the first N cards in document order therefore
//      harvests stale promoted ads while missing that day's real postings.
//      Promoted cards are skipped by default (includePromoted opts back in).
//   2. Every card carries its own posting date in `.listing-date-posted-list`
//      and its slug in `data-url`. Both are available on the INDEX, so a
//      listing that fails the date filter costs zero detail fetches and zero
//      tokens. Because the non-promoted feed is date-descending, the crawl also
//      stops paginating as soon as it drops below the cutoff.
//
// CLIENT-DRIVEN (Aug 6 2026 rebuild): the original single-request design did
// every detail fetch, one batched Claude call, and every geocode+upsert inside
// one invocation. At the 60-listing default that is ~70s of polite fetching +
// a multi-minute Claude call + ~60s of geocoding, which ran past the
// edge-function wall clock — the gateway answered 504, the admin saw nothing,
// and the run row was orphaned at 'running'. The work is now split into batches
// the CLIENT drives, exactly like parse-pamphlet and parse-bulk-listings:
//
//   action "start"    — crawl the index, date-filter, plan the batches, create
//                       the scrape_runs row. Returns { run_id, chunks, ... }.
//   action "chunk"    — fetch one batch of detail pages, parse them in ONE
//                       Claude call, geocode + upsert. Returns per-batch counts.
//   action "finalize" — stamp the run completed/failed with the totals.
//
// Every action stays well inside the wall-clock limit, a failed batch costs
// only its own listings, and the admin gets real progress.
//
// Admin-only: the caller's JWT must carry app_metadata.is_admin = true.
// Required secrets: ANTHROPIC_API_KEY

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { DOMParser, type Element } from 'jsr:@b-fuze/deno-dom';
import { corsHeaders } from '../_shared/cors.ts';
import {
  DEFAULT_MODEL,
  parseBatch,
  geocodeListing,
  upsertScrapedListing,
  type ParsedListing,
} from '../_shared/intake.ts';

const BASE = 'https://luach.com';
const INDEX_PATH = '/apartments';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) HadirotLeadBot/1.0 (+contact: aharonpanigel@gmail.com)';
const FETCH_DELAY_MS = 600; // polite gap between fetches

// "since last scrape" reaches one day further back than the last run. Posting
// dates are day-granular, so a same-day listing added after we ran would be
// invisible on an exact-boundary cutoff. Re-seeing a listing is free (the dedup
// key collapses it); missing one is not.
const SINCE_LAST_GRACE_DAYS = 1;

// Listings per "chunk" call. Sized so one call comfortably fits the wall clock:
// 8 detail fetches (~9s with the polite gap) + one Claude call over ~8 short
// pages + 8 geocode/upsert round trips lands near a minute, leaving wide
// headroom. It also bounds the blast radius — a batch that fails costs 8
// listings, not the whole run.
const CARDS_PER_CHUNK = 8;

// Safety net only: a chunk's detail pages compose to well under 2k characters
// each, so 8 of them never approach this. It exists so a freak oversized page
// splits into a second call instead of building a request too large to serve.
const MAX_BATCH_CHARS = 300_000;

// A run left 'running' this long was killed mid-flight (the 504 this rebuild
// fixes left several behind). Sweep them when a new run starts so the review
// screen stops showing phantom in-progress batches. Generous enough that a
// genuinely in-flight run is never touched.
const STALE_RUN_MINUTES = 45;

type ScrapeMode = 'since_last' | 'range' | 'all';

interface IndexCard {
  slug: string;
  postedDate: string | null; // yyyy-mm-dd
  promoted: boolean;
}

interface Detail {
  slug: string;
  text: string;
  postedDate: string | null;
}

/** One unit of work the client requests via action "chunk". */
interface ChunkPlan {
  cards: IndexCard[];
}

const SLUG_RX = /^[a-z0-9-]{3,120}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const cleanDate = (v: unknown): string | null =>
  typeof v === 'string' && ISO_DATE.test(v) ? v : null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

/** yyyy-mm-dd from an MM/DD/YYYY fragment, or null. */
function toIsoDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/**
 * Every listing card on an index page, in document order.
 *
 * Reads the site's own `data-url` attribute rather than regexing hrefs out of
 * the raw HTML: it is the canonical slug, it cannot pick up navigation or
 * markup that merely looks like a listing path, and it keeps each slug attached
 * to the card whose date and promoted-flag belong to it.
 */
function parseIndexCards(html: string): IndexCard[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) return [];
  const cards: IndexCard[] = [];
  for (const node of Array.from(doc.querySelectorAll('.listing-container-list')) as Element[]) {
    const slugMatch = (node.getAttribute('data-url') || '').match(/^\/apartments\/([a-z0-9-]{3,})$/i);
    if (!slugMatch) continue;
    const dateText = node.querySelector('.listing-date-posted-list')?.textContent || '';
    cards.push({
      slug: slugMatch[1].toLowerCase(),
      postedDate: toIsoDate(dateText),
      promoted: (node.getAttribute('class') || '').includes('top-ad-bg'),
    });
  }
  return cards;
}

/** "Posted on 06/22/2026" → "2026-06-22". */
function parsePostedDate(text: string): string | null {
  const m = text.match(/Posted on\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  return m ? toIsoDate(m[1]) : null;
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

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Lower bound on posting date, or null for "no lower bound".
 * since_last => the day before the last completed luach_com run started.
 */
async function resolveCutoff(
  supabase: SupabaseClient,
  mode: ScrapeMode,
  since: string | null,
): Promise<string | null> {
  if (mode === 'all') return null;
  if (mode === 'range') return since;
  const { data } = await supabase
    .from('scrape_runs')
    .select('started_at')
    .eq('source', 'luach_com')
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.started_at) return null; // never scraped => take everything
  return shiftDays(String(data.started_at).slice(0, 10), -SINCE_LAST_GRACE_DAYS);
}

/** Split sources so no single Claude request exceeds the character budget. */
function chunkByBudget(details: Detail[], maxChars: number): Detail[][] {
  const chunks: Detail[][] = [];
  let current: Detail[] = [];
  let size = 0;
  for (const d of details) {
    if (current.length > 0 && size + d.text.length > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(d);
    size += d.text.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * The client hands chunk descriptors straight back to us, so re-validate every
 * slug before it is pasted into a URL — an unchecked slug would let an admin
 * client point the fetch at an arbitrary path.
 */
function sanitizeCards(raw: unknown): IndexCard[] {
  if (!Array.isArray(raw)) return [];
  const out: IndexCard[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const slug = typeof item?.slug === 'string' ? item.slug.toLowerCase() : '';
    if (!SLUG_RX.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      postedDate: cleanDate(item?.postedDate),
      promoted: item?.promoted === true,
    });
  }
  return out;
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
    const action: string = typeof body?.action === 'string' ? body.action : 'start';

    // =========================================================================
    // action: start — crawl + date-filter the index, plan batches, create run
    // =========================================================================
    if (action === 'start') {
      const maxPages = Math.min(Math.max(1, parseInt(String(body?.pages ?? 3), 10) || 3), 10);
      const limit = Math.min(Math.max(1, parseInt(String(body?.limit ?? 60), 10) || 60), 120);
      const includePromoted = body?.includePromoted === true;
      const rawMode = String(body?.mode ?? 'since_last');
      const mode: ScrapeMode =
        rawMode === 'range' || rawMode === 'all' ? (rawMode as ScrapeMode) : 'since_last';
      const untilDate = mode === 'range' ? cleanDate(body?.until) : null;

      const cutoff = await resolveCutoff(
        supabase,
        mode,
        mode === 'range' ? cleanDate(body?.since) : null,
      );

      console.log(
        `[scrape-luach-com:${requestId}] start: admin ${user.id}, mode=${mode}, cutoff=${cutoff ?? 'none'}, until=${untilDate ?? 'none'}, pages<=${maxPages}, limit=${limit}, promoted=${includePromoted}`,
      );

      // --- Walk the index, filtering by date before spending anything -------
      const selected: IndexCard[] = [];
      const seenSlugs = new Set<string>();
      let cardsSeen = 0;
      let skippedPromoted = 0;
      let skippedByDate = 0;
      let pagesFetched = 0;

      try {
        for (let p = 1; p <= maxPages; p++) {
          const url = p === 1 ? `${BASE}${INDEX_PATH}` : `${BASE}${INDEX_PATH}?page=${p}`;
          const cards = parseIndexCards(await fetchHtml(url));
          pagesFetched++;
          if (cards.length === 0) break; // ran off the end of the listings

          // The non-promoted feed is date-descending, so the first card older
          // than the cutoff means every later card is older too.
          let exhausted = false;
          for (const card of cards) {
            cardsSeen++;
            if (card.promoted && !includePromoted) {
              skippedPromoted++;
              continue;
            }
            if (card.postedDate) {
              if (cutoff && card.postedDate < cutoff) {
                skippedByDate++;
                if (!card.promoted) exhausted = true; // promoted cards are out of order
                continue;
              }
              if (untilDate && card.postedDate > untilDate) {
                skippedByDate++;
                continue;
              }
            }
            if (!seenSlugs.has(card.slug)) {
              seenSlugs.add(card.slug);
              selected.push(card);
            }
          }

          if (selected.length >= limit || exhausted) break;
          if (p < maxPages) await sleep(FETCH_DELAY_MS);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[scrape-luach-com:${requestId}] index fetch failed:`, message);
        return json(
          {
            error: `Could not reach luach.com (${message}). The site may be blocking cloud requests — you can run the local scraper (npm run scrape:luach, on the claude/luach-scraper-pipeline branch) as a fallback.`,
          },
          502,
        );
      }

      if (cardsSeen === 0) {
        return json(
          { error: 'No listings found on luach.com — the page layout may have changed.' },
          502,
        );
      }

      const chosen = selected.slice(0, limit);
      const chunks: ChunkPlan[] = [];
      for (let i = 0; i < chosen.length; i += CARDS_PER_CHUNK) {
        chunks.push({ cards: chosen.slice(i, i + CARDS_PER_CHUNK) });
      }

      // Clear debris from runs that were killed mid-flight, so the review
      // screen doesn't show them as forever in-progress.
      const staleBefore = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString();
      await supabase
        .from('scrape_runs')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('source', 'luach_com')
        .eq('status', 'running')
        .lt('started_at', staleBefore);

      const { data: run, error: runError } = await supabase
        .from('scrape_runs')
        .insert({
          source: 'luach_com',
          pdf_date: new Date().toISOString().slice(0, 10),
          pdf_filename: `${BASE}${INDEX_PATH}`,
          total_pages: pagesFetched,
          status: 'running',
          created_by: user.id,
        })
        .select('id')
        .single();
      if (runError || !run) return json({ error: 'Failed to create scrape run' }, 500);

      console.log(
        `[scrape-luach-com:${requestId}] start: ${cardsSeen} cards over ${pagesFetched} page(s), ${skippedPromoted} promoted + ${skippedByDate} out-of-range skipped, ${chosen.length} selected in ${chunks.length} chunk(s)`,
      );

      return json({
        run_id: run.id,
        mode,
        cutoff,
        chunks,
        cards_seen: cardsSeen,
        index_pages: pagesFetched,
        selected: chosen.length,
        skipped_by_date: skippedByDate,
        skipped_promoted: skippedPromoted,
      });
    }

    // =========================================================================
    // action: chunk — fetch one batch of detail pages, parse, geocode, upsert
    // =========================================================================
    if (action === 'chunk') {
      const runId: string | null = typeof body?.run_id === 'string' ? body.run_id : null;
      if (!runId) return json({ error: 'run_id is required' }, 400);
      const cards = sanitizeCards(body?.chunk?.cards);
      if (cards.length === 0) return json({ error: 'chunk descriptor is required' }, 400);

      const today = new Date().toISOString().slice(0, 10);
      const errors: Array<{ slug: string; error: string }> = [];

      // --- Fetch each detail page (sequential + polite) ---------------------
      const details: Detail[] = [];
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        try {
          const html = await fetchHtml(`${BASE}${INDEX_PATH}/${card.slug}`);
          const { text, postedDate } = extractDetail(html);
          if (text && text.length > 30) {
            // The index date and the detail date agree in practice; prefer the
            // index one since it is what the date filter just matched on.
            details.push({ slug: card.slug, text, postedDate: card.postedDate ?? postedDate });
          }
        } catch (err) {
          errors.push({ slug: card.slug, error: err instanceof Error ? err.message : String(err) });
        }
        if (i < cards.length - 1) await sleep(FETCH_DELAY_MS);
      }

      // --- Parse the batch in one Claude call -------------------------------
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const batches = chunkByBudget(details, MAX_BATCH_CHARS);
      const attributed: Array<{ detail: Detail; listing: ParsedListing }> = [];
      for (const batch of batches) {
        try {
          const rows = await parseBatch(anthropic, model, batch.map((d) => ({ text: d.text })), 'auto');
          for (const row of rows) {
            const detail = batch[row.sourceIndex] ?? batch[0];
            attributed.push({ detail, listing: row.listing });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // A failed batch loses every source in it — name them all so the admin
          // can see exactly what was dropped instead of a silent shortfall.
          for (const d of batch) errors.push({ slug: d.slug, error: message });
        }
      }

      // --- Geocode + upsert (collapse dupes) --------------------------------
      let inserted = 0;
      let updated = 0;
      let geocoded = 0;

      for (const { detail, listing } of attributed) {
        const geo = await geocodeListing(supabaseUrl, anonKey, listing);
        if (geo.status === 'success') geocoded++;
        try {
          const outcome = await upsertScrapedListing(supabase, listing, geo, {
            source: 'luach_com',
            runId,
            sourceUrl: `${BASE}${INDEX_PATH}/${detail.slug}`,
            pdfDate: detail.postedDate || today,
          });
          if (outcome === 'inserted') inserted++;
          else updated++;
        } catch (err) {
          errors.push({
            slug: detail.slug,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      console.log(
        `[scrape-luach-com:${requestId}] chunk: ${cards.length} card(s), ${details.length} fetched, ${batches.length} AI call(s), ${attributed.length} parsed, ${inserted} new, ${updated} merged, ${errors.length} error(s)`,
      );

      return json({
        fetched: details.length,
        ai_calls: batches.length,
        parsed: attributed.length,
        inserted,
        updated,
        geocoded,
        errors,
      });
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
        `[scrape-luach-com:${requestId}] finalize ${runId}: ${parsed} parsed, ${inserted} new, ${updated} merged, ${errors.length} error(s)`,
      );
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[scrape-luach-com:${requestId}] Fatal:`, message);
    return json({ error: message }, 500);
  }
});
