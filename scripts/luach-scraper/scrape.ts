/**
 * luach.com → Hadirot scraping pipeline
 * ------------------------------------------------------------------
 * Scrapes apartment listings from the luach.com website and feeds NEW
 * ones into the existing `scraped_listings` pipeline (the same table the
 * Luach HaTsibbur publication scraper uses), tagged with source = 'luach_com'.
 *
 * The admin then works them in the Pipeline tab of the Admin Panel:
 *   pending_call → call owner → approved → published (creates a real listing).
 *
 * Dedup: one row per listing URL (dedup_key = md5(slug)), enforced by the
 * existing unique index on scraped_listings.dedup_key. Re-running is safe —
 * already-seen listings only bump date_last_seen / times_seen and never
 * overwrite the admin's call_status or call_notes.
 *
 * Run:
 *   npm run scrape:luach -- --dry-run        # parse + print, no DB writes
 *   npm run scrape:luach                     # scrape page 1 (newest), upsert
 *   npm run scrape:luach -- --pages 5         # scan first 5 index pages (backfill)
 *   npm run scrape:luach -- --limit 10 --verbose
 *
 * DB access: direct Postgres via SUPABASE_DB_URL in .env (bypasses RLS,
 * no service-role key needed). HTML parsing via cheerio.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import pg from 'pg';
import * as cheerio from 'cheerio';

const BASE = 'https://luach.com';
const LISTINGS_PATH = '/apartments';
const SOURCE = 'luach_com';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) HadirotLeadBot/1.0 (+contact: aharonpanigel@gmail.com)';
const REQUEST_DELAY_MS = 800; // be polite between detail-page fetches

// Light neighborhood detection from listing text (Brooklyn frum areas).
const KNOWN_NEIGHBORHOODS = [
  'Flatbush', 'Midwood', 'Boro Park', 'Borough Park', 'Marine Park',
  'Kensington', 'Gravesend', 'Bensonhurst', 'Sheepshead Bay', 'Crown Heights',
  'Williamsburg', 'Canarsie', 'Mill Basin', 'Madison',
];

interface Args {
  dryRun: boolean;
  pages: number;
  limit: number | null;
  verbose: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { dryRun: false, pages: 1, limit: null, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--dry-run') a.dryRun = true;
    else if (v === '--verbose') a.verbose = true;
    else if (v === '--pages') a.pages = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (v === '--limit') a.limit = Math.max(0, parseInt(argv[++i], 10) || 0);
  }
  return a;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

// ---- parsing helpers -------------------------------------------------------

/** All distinct detail-page slugs on an index page, in document order. */
function parseIndexSlugs(html: string): string[] {
  const $ = cheerio.load(html);
  const slugs: string[] = [];
  const seen = new Set<string>();
  $('[data-url]').each((_, el) => {
    const u = $(el).attr('data-url') || '';
    const m = u.match(/^\/apartments\/([a-z0-9-]+)$/i);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      slugs.push(m[1]);
    }
  });
  return slugs;
}

function parsePrice(text: string): { amount: number | null; note: string | null } {
  const m = text.match(/\$\s*([\d,]+)\s*\/\s*(month|week|day|night|year)/i);
  if (!m) return { amount: null, note: null };
  const amount = parseInt(m[1].replace(/,/g, ''), 10);
  const period = m[2].toLowerCase();
  return { amount: Number.isFinite(amount) ? amount : null, note: period === 'month' ? null : `per ${period}` };
}

function parseBedrooms(text: string): number | null {
  if (/\bstudio\b/i.test(text)) return 0;
  const m = text.match(/(\d+)\s*[-\s]?\s*(?:bed\b|bedroom|br\b)/i);
  return m ? parseInt(m[1], 10) : null;
}

function parseBathrooms(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d)?)\s*(?:full\s*)?(?:bath\b|bathroom|ba\b)/i);
  return m ? parseFloat(m[1]) : null;
}

function parsePropertyType(text: string): string {
  const t = text.toLowerCase();
  if (/\bbasement\b/.test(t)) return 'basement';
  if (/\bduplex\b/.test(t)) return 'duplex';
  if (/\b(full\s*house|private\s*house|entire\s*house|whole\s*house)\b/.test(t)) return 'full_house';
  return 'apartment';
}

function parseContactType(text: string): 'agent' | 'individual' | 'unknown' {
  if (/\b(broker|agent|realty|real estate|management|realtor)\b/i.test(text)) return 'agent';
  return 'unknown';
}

function parseNeighborhood(text: string): string | null {
  for (const n of KNOWN_NEIGHBORHOODS) {
    if (new RegExp(`\\b${n}\\b`, 'i').test(text)) {
      return n === 'Borough Park' ? 'Boro Park' : n;
    }
  }
  return null;
}

/** "Posted on 06/22/2026" → "2026-06-22" */
function parsePostedDate(text: string): string | null {
  const m = text.match(/Posted on\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

function parseAdId(text: string): string | null {
  const m = text.match(/Ad ID#?\s*(L\d{4,8})/i);
  return m ? m[1].toUpperCase() : null;
}

function parsePhone(html: string, $: cheerio.CheerioAPI): { raw: string | null; display: string | null } {
  // Prefer the explicit "Phone:" field, fall back to the first phone in the body.
  const labeled = html.match(/Phone:\s*<\/strong>\s*([\d().\-\s]{7,})/i);
  let display = labeled ? labeled[1].trim() : null;
  if (!display) {
    const body = $('.listing-description').text();
    const m = body.match(/(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
    display = m ? m[1].trim() : null;
  }
  if (!display) return { raw: null, display: null };
  const digits = display.replace(/\D/g, '');
  const formatted =
    digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : display;
  return { raw: digits || null, display: formatted };
}

export interface ParsedListing {
  slug: string;
  source_url: string;
  ad_id: string | null;
  title: string;
  cross_streets_raw: string | null;
  description: string;
  price: number | null;
  price_note: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  property_type: string;
  contact_type: 'agent' | 'individual' | 'unknown';
  contact_phone: string | null;
  contact_phone_display: string | null;
  neighborhood: string | null;
  posted_date: string | null;
}

function parseDetail(html: string, slug: string): ParsedListing {
  const $ = cheerio.load(html);
  const title = $('.listing-title-headline').first().text().trim() || $('title').text().split(' - ')[0].trim();
  const address = $('.listing-address-headline').first().text().trim() || null;
  const description = $('.listing-description').text().replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  const footer = $('.panel-footer').text();
  const priceText = $('.row.col-xs-12.h3').first().text() || $('body').text();
  const haystack = `${title}\n${description}`;
  const { amount, note } = parsePrice(priceText);
  const phone = parsePhone(html, $);
  return {
    slug,
    source_url: `${BASE}/apartments/${slug}`,
    ad_id: parseAdId(footer) || parseAdId(html),
    title,
    cross_streets_raw: address,
    description,
    price: amount,
    price_note: note,
    bedrooms: parseBedrooms(haystack),
    bathrooms: parseBathrooms(haystack),
    property_type: parsePropertyType(haystack),
    contact_type: parseContactType(`${haystack}\n${$('.panel-body').text()}`),
    contact_phone: phone.raw,
    contact_phone_display: phone.display,
    neighborhood: parseNeighborhood(`${address ?? ''}\n${description}`),
    posted_date: parsePostedDate(footer),
  };
}

// ---- db --------------------------------------------------------------------

function dedupKey(slug: string): string {
  return createHash('md5').update(`luach_com:${slug}`).digest('hex');
}

async function upsertListing(client: pg.Client, l: ParsedListing): Promise<'inserted' | 'updated'> {
  const key = dedupKey(l.slug);
  const today = new Date().toISOString();
  const pdfDate = l.posted_date ?? today.slice(0, 10); // pdf_date is NOT NULL; use posted date
  const res = await client.query(
    `INSERT INTO scraped_listings (
       source, dedup_key, source_url, title, raw_text, cross_streets_raw,
       neighborhood, price, price_note, bedrooms, bathrooms, property_type,
       rental_term, contact_type, contact_phone, contact_phone_display,
       pdf_date, date_first_seen, date_last_seen, times_seen, is_active
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'long_term',$13,$14,$15,$16,$17,$17,1,true
     )
     ON CONFLICT (dedup_key) DO UPDATE SET
       date_last_seen = EXCLUDED.date_last_seen,
       times_seen = scraped_listings.times_seen + 1,
       is_active = true,
       source_url = COALESCE(scraped_listings.source_url, EXCLUDED.source_url),
       updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [
      SOURCE, key, l.source_url, l.title, l.description || null, l.cross_streets_raw,
      l.neighborhood, l.price, l.price_note, l.bedrooms, l.bathrooms, l.property_type,
      l.contact_type, l.contact_phone, l.contact_phone_display, pdfDate, today,
    ],
  );
  return res.rows[0].inserted ? 'inserted' : 'updated';
}

// ---- main ------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl && !args.dryRun) {
    console.error('Missing SUPABASE_DB_URL in .env (required unless --dry-run).');
    process.exit(1);
  }

  console.log(`luach.com scraper — ${args.dryRun ? 'DRY RUN' : 'LIVE'} | pages=${args.pages}${args.limit != null ? ` limit=${args.limit}` : ''}`);

  // Collect candidate slugs from the index pages (newest first).
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (let p = 1; p <= args.pages; p++) {
    const url = p === 1 ? `${BASE}${LISTINGS_PATH}` : `${BASE}${LISTINGS_PATH}?page=${p}`;
    const html = await fetchHtml(url);
    const pageSlugs = parseIndexSlugs(html).filter((s) => !seen.has(s));
    pageSlugs.forEach((s) => seen.add(s));
    slugs.push(...pageSlugs);
    if (args.verbose) console.log(`  index page ${p}: ${pageSlugs.length} listings`);
    if (p < args.pages) await sleep(REQUEST_DELAY_MS);
  }
  console.log(`Found ${slugs.length} listing(s) across ${args.pages} page(s).`);

  const client = args.dryRun ? null : new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  if (client) await client.connect();

  // Skip slugs already in the pipeline (cheap pre-check to avoid refetching).
  let existing = new Set<string>();
  if (client) {
    const keys = slugs.map(dedupKey);
    const { rows } = await client.query(
      `SELECT dedup_key FROM scraped_listings WHERE source = $1 AND dedup_key = ANY($2)`,
      [SOURCE, keys],
    );
    existing = new Set(rows.map((r) => r.dedup_key));
  }

  const toFetch = slugs.filter((s) => args.dryRun || !existing.has(dedupKey(s)));
  const limited = args.limit != null ? toFetch.slice(0, args.limit) : toFetch;
  console.log(`${args.dryRun ? limited.length : toFetch.length} new listing(s) to process${args.limit != null ? ` (capped at ${args.limit})` : ''}.`);

  let runId: string | null = null;
  if (client) {
    const { rows } = await client.query(
      `INSERT INTO scrape_runs (source, pdf_date, started_at, status)
       VALUES ($1, $2, now(), 'running') RETURNING id`,
      [SOURCE, new Date().toISOString().slice(0, 10)],
    );
    runId = rows[0].id;
  }

  let inserted = 0;
  let updated = 0;
  let parsed = 0;
  const errors: { slug: string; error: string }[] = [];

  for (const slug of limited) {
    try {
      const html = await fetchHtml(`${BASE}/apartments/${slug}`);
      const listing = parseDetail(html, slug);
      parsed++;
      if (args.dryRun) {
        console.log(
          `\n• ${listing.title}\n  ${listing.source_url}\n  ${listing.bedrooms ?? '?'}BR ${listing.bathrooms ?? '?'}BA · ` +
          `${listing.property_type} · $${listing.price ?? '?'}${listing.price_note ? ` (${listing.price_note})` : ''} · ` +
          `${listing.contact_phone_display ?? 'no phone'} · ${listing.neighborhood ?? 'n/a'} · posted ${listing.posted_date ?? '?'} · ${listing.ad_id ?? 'no id'}`,
        );
      } else if (client) {
        const r = await upsertListing(client, listing);
        if (r === 'inserted') inserted++;
        else updated++;
        if (args.verbose) console.log(`  ${r}: ${listing.title}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ slug, error: msg });
      console.error(`  ! ${slug}: ${msg}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  if (client && runId) {
    await client.query(
      `UPDATE scrape_runs SET completed_at = now(), status = $2,
         listings_parsed = $3, listings_inserted = $4, listings_updated = $5, errors = $6
       WHERE id = $1`,
      [runId, errors.length ? 'completed_with_errors' : 'completed', parsed, inserted, updated, JSON.stringify(errors)],
    );
  }
  if (client) await client.end();

  console.log(
    `\nDone. parsed=${parsed} inserted=${inserted} updated=${updated} errors=${errors.length}` +
    (args.dryRun ? ' (dry run — nothing written)' : ''),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
