// parse-pamphlet
//
// Admin listing intake from an uploaded community pamphlet — a Luach HaTsibbur
// / Kol Berama / Heimish Agent booklet (PDF or scanned photos).
//
// TEXT-FIRST PIPELINE (July 20 2026 rebuild): all three publications embed a
// clean text layer, so pages are parsed as extracted TEXT, not as rendered
// pages — no vision tokens, and Claude Sonnet on text measured equal to Opus
// on vision for cross-street decoding (the field that drives geocoding AND the
// dedup key). The flow per PDF:
//
//   1. Extract per-page text (unpdf / pdf.js) — free, no AI.
//   2. Triage pages with code — keep pages that look like listings (phone
//      density / section headers / realty keywords), drop pure ads & Hebrew
//      boilerplate BEFORE any tokens are spent. Bias is keep-when-borderline:
//      a junk page that slips through costs cents; a dropped listing page is
//      lost data.
//   3. Pages with no text layer (scanned covers, image ads — and any booklet
//      that turns out to be a pure scan) fall back to the original vision
//      path, so nothing is silently skipped.
//
// Booklets run up to 50+ pages and a full parse takes minutes, so the work is
// split into page-range chunks the CLIENT drives (each call stays well inside
// edge-function wall-clock limits, failures are retryable per chunk, and the
// admin sees progress):
//
//   action "start"    — extract text, triage pages, plan the chunks, create
//                       the scrape_runs row. Returns { run_id, chunks }.
//   action "chunk"    — parse one text page-range (or vision-fallback range /
//                       image group) with Claude, geocode, and upsert into
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
import { extractText, getDocumentProxy } from 'npm:unpdf';
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
const MIN_TEXT_CHARS = 50; // below this a page is treated as image-only
// ≈ listings per chunk; keeps output inside the 64k budget. A 49-listing
// chunk measured 51.5k output tokens, so 30 leaves real headroom.
const MAX_WEIGHT_PER_CHUNK = 30;

interface UploadedFile {
  path: string;
  mime: string;
  name?: string;
}

/** One unit of Claude work the client will request via action "chunk". */
interface ChunkPlan {
  file: UploadedFile;
  /** pdf_text = extracted text (cheap path); pdf = vision fallback. */
  kind: 'pdf_text' | 'pdf' | 'images';
  page_from?: number; // 1-based inclusive (pdf kinds only)
  page_to?: number; // 1-based inclusive (pdf kinds only)
  /** pdf kinds: exact pages to include (triage may skip pages mid-range). */
  pages?: number[];
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

// ---------------------------------------------------------------------------
// Page triage — pure code, zero tokens. Thresholds tuned on real Luach / Kol
// Berama / Heimish booklets (July 20 2026): actual listing pages score 10-139,
// junk-with-phones pages (car services, jobs, gemachs, stamp ads) score 0-7.
// Phones alone prove nothing — every classifieds page has phones. The
// discriminators are realty vocabulary + PRICE patterns (listings always have
// $-amounts; service ads rarely do).
// ---------------------------------------------------------------------------
const PHONE_RX = /\(\d{3}\)\s*\d{3}[.\-\s]*\d{4}|\d{3}[.\-\s]\d{3}[.\-\s]\d{4}|\b\d{10}\b/g;
const SECTION_RX =
  /\b(UNFURNISHED|FURNISHED|SHORT\s*TERM|RENTALS?|FOR\s*SALE|FOR\s*RENT|REAL\s*ESTATE|RESIDENTIAL|APARTMENTS)\b/i;
const REALTY_G =
  /\b(\d\s*(?:BR|bdrms?|bedrooms?)|bsmt|basement|sq\s*\.?\s*f?t?\b|sqft|sf\b|duplex|apt\b|apartment|tenant|lease|rent(?:al)?s?\b|broker|realty|porch|kitchen(?:ette)?|house|condo|famil(?:y|ies)|office|store\s*front|warehouse|entrance|furnished)\b/gi;
const PRICE_G = /\$\s?\d{3}[\d,]*|\d{3}[\d,]*\s?\$|\$\s?\d+(?:\.\d)?[kK]/g;
// Heimish-style listing tags ("Condo #2362") — the listing-count proxy when a
// booklet prints one agency phone instead of per-listing phones.
const LISTING_ID_G = /#\s?\d{3,4}\b/g;
// Heimish non-residential section banners ("~ Offices / For Rent / ... ~",
// "~ Shuls - Day Care - School ~"). The intake schema is residential-only —
// the model either skips these pages or (worse) coerces office listings into
// residential fields, polluting the review table. Drop them before any tokens
// are spent. (Assumes NUL-ligature normalization has already run — see
// extractPdfPages.)
const COMMERCIAL_BANNER_RX = /~\s*(Offices?|Warehouses?|Store\s*Fronts?|Shuls?\b)\s*[-/]/i;
const RESIDENTIAL_BANNER_RX = /~\s*Residential\s*\//i;

type PageClass = 'text' | 'vision' | 'drop';

export function classifyPage(text: string): PageClass {
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_CHARS) return 'vision'; // no text layer on this page
  // Self-labeled pure-commercial pages (Heimish): schema-skipped, never parse.
  if (COMMERCIAL_BANNER_RX.test(trimmed) && !RESIDENTIAL_BANNER_RX.test(trimmed)) return 'drop';
  const score =
    (trimmed.match(REALTY_G) || []).length + 2 * (trimmed.match(PRICE_G) || []).length;
  if (score >= 8) return 'text'; // unambiguous listing page
  // Borderline: some signal + phones + a section header — let the model decide
  // (it dismisses a junk page in seconds for pennies).
  const phones = (trimmed.match(PHONE_RX) || []).length;
  if (score >= 3 && phones >= 2 && SECTION_RX.test(trimmed)) return 'text';
  return 'drop';
}

/** Listings-per-page proxy: per-listing phones (Luach/Kol Berama) or listing
 *  #-tags (Heimish prints one agency phone for the whole booklet). */
export function pageWeight(text: string): number {
  return Math.max(
    (text.match(PHONE_RX) || []).length,
    (text.match(LISTING_ID_G) || []).length,
  );
}

/** Group kept page numbers into contiguous runs, then slice runs into
 *  overlapping chunks (1-5, 5-9, ... within each run).
 *
 *  DENSITY-AWARE: chunks are also capped by estimated listing count. Luach's
 *  rental pages run 19-32 listings per page and Heimish 8-12 — five dense
 *  pages is 120+ listings, which overflows the 64k output budget mid-JSON
 *  (both caught July 20 2026 on real booklets). pageWeight() estimates
 *  listings per page; a chunk closes when adding the next page would exceed
 *  MAX_WEIGHT_PER_CHUNK. A single dense page can stand alone (a page can't
 *  be split). */
export function planTextChunks(
  pages: number[],
  pageWeights?: Map<number, number>,
): Array<{ from: number; to: number; pages: number[] }> {
  const runs: number[][] = [];
  for (const p of pages) {
    const run = runs[runs.length - 1];
    if (run && p === run[run.length - 1] + 1) run.push(p);
    else runs.push([p]);
  }
  const chunks: Array<{ from: number; to: number; pages: number[] }> = [];
  for (const run of runs) {
    let i = 0;
    while (i < run.length) {
      const slice: number[] = [];
      let weight = 0;
      let j = i;
      while (j < run.length && slice.length < PAGES_PER_CHUNK) {
        const w = pageWeights?.get(run[j]) ?? 0;
        if (slice.length > 0 && weight + w > MAX_WEIGHT_PER_CHUNK) break;
        slice.push(run[j]);
        weight += w;
        j++;
      }
      // A chunk that is entirely contained in the previous chunk (an overlap
      // page that couldn't extend because the next page is too dense) adds
      // nothing — skip it instead of parsing the same page twice.
      const prev = chunks[chunks.length - 1];
      if (!prev || !slice.every((p) => prev.pages.includes(p))) {
        chunks.push({ from: slice[0], to: slice[slice.length - 1], pages: slice });
      }
      if (j >= run.length) break;
      // Step back one page for the boundary overlap — but always advance past
      // the previous chunk's start so a lone dense page can't loop forever.
      i = Math.max(j - CHUNK_OVERLAP, i + 1);
    }
  }
  return chunks;
}

async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  // The Heimish booklet's font drops "t"/"tt" ligature glyphs as NUL bytes
  // ("S\0ore Fron\0s" = "Store Fronts", "Ki\0chen" = "Kitchen"). Substituting
  // "t" reconstructs the word almost every time and fixes both triage regexes
  // and the text Claude reads.
  return (text as string[]).map((t) => (t || '').replace(/\u0000/g, 't'));
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
    // action: start — extract text, triage pages, plan chunks + create the run
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
      let keptPages = 0;
      let visionPages = 0;
      let droppedPages = 0;

      for (const file of validFiles) {
        if (file.mime === 'application/pdf') {
          const bytes = await downloadFile(supabase, file.path);
          const pageTexts = await extractPdfPages(bytes);
          const pageCount = pageTexts.length;
          totalPages += pageCount;

          const textPages: number[] = [];
          const visionOnly: number[] = [];
          const weights = new Map<number, number>();
          for (let p = 1; p <= pageCount; p++) {
            const pageText = pageTexts[p - 1] || '';
            const cls = classifyPage(pageText);
            weights.set(p, pageWeight(pageText));
            if (cls === 'text') textPages.push(p);
            else if (cls === 'vision') visionOnly.push(p);
            else droppedPages++;
          }
          keptPages += textPages.length;

          for (const c of planTextChunks(textPages, weights)) {
            chunks.push({ file, kind: 'pdf_text', page_from: c.from, page_to: c.to, pages: c.pages });
          }
          // Image-only pages: if the booklet clearly HAS a text layer (≥30% of
          // pages), its few zero-text pages are cover art / image ads — drop
          // them instead of paying vision. Only a genuinely scanned booklet
          // (photographed pages, no text layer) takes the vision path, so a
          // scan upload is never silently skipped.
          const hasTextLayer = textPages.length >= Math.ceil(pageCount * 0.3);
          if (hasTextLayer) {
            droppedPages += visionOnly.length;
          } else {
            visionPages += visionOnly.length;
            for (const c of planTextChunks(visionOnly)) {
              chunks.push({ file, kind: 'pdf', page_from: c.from, page_to: c.to, pages: c.pages });
            }
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
        `[parse-pamphlet:${requestId}] start: admin ${user.id}, source=${source}, ${validFiles.length} file(s), ` +
          `${totalPages} pages (${keptPages} text, ${visionPages} vision-fallback, ${droppedPages} dropped as non-listing), ` +
          `${chunks.length} chunk(s)`,
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
      let textNote = '';

      if (chunk.kind === 'pdf_text') {
        // --- Cheap path: extracted text only, no vision tokens ---------------
        const bytes = await downloadFile(supabase, chunk.file.path);
        const pageTexts = await extractPdfPages(bytes);
        const from = Math.max(1, Number(chunk.page_from) || 1);
        const to = Math.max(from, Number(chunk.page_to) || from);
        const wanted = (Array.isArray(chunk.pages) && chunk.pages.length > 0
          ? chunk.pages.map(Number)
          : Array.from({ length: to - from + 1 }, (_, i) => from + i)
        ).filter((p) => Number.isInteger(p) && p >= 1 && p <= pageTexts.length);
        if (wanted.length === 0) return json({ error: 'chunk page range is empty' }, 400);
        const textBlock = wanted
          .map((p) => `--- page ${p} ---\n${(pageTexts[p - 1] || '').trim()}`)
          .join('\n\n');
        content.push({ type: 'text', text: textBlock });
        pageNote = ` (pages ${wanted[0]}-${wanted[wanted.length - 1]}, extracted text)`;
        textNote =
          ' The listing text below was extracted directly from the PDF text layer; it may contain extraction artifacts such as dropped ligatures ("Ki chen" = "Kitchen", "Grani e" = "Granite") or joined/split words — read through them.';
      } else if (chunk.kind === 'pdf') {
        // --- Vision fallback: image-only pages (scanned covers / photo ads) --
        const from = Math.max(1, Number(chunk.page_from) || 1);
        const to = Math.max(from, Number(chunk.page_to) || from);
        const bytes = await downloadFile(supabase, chunk.file.path);
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const indices = (Array.isArray(chunk.pages) && chunk.pages.length > 0
          ? chunk.pages.map(Number)
          : Array.from({ length: to - from + 1 }, (_, i) => from + i)
        )
          .filter((p) => Number.isInteger(p) && p >= 1 && p <= src.getPageCount())
          .map((p) => p - 1);
        if (indices.length === 0) return json({ error: 'chunk page range is empty' }, 400);
        const out = await PDFDocument.create();
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
      const extraContext = `This content is part of a "${label}" — a Brooklyn Orthodox-Jewish community classifieds pamphlet${pageNote}.${textNote} Read every page, including scanned images, and extract each real estate rental or sale listing. If a listing at the very start or end of the excerpt is cut off mid-text, skip it unless its key details (contact or location) are visible.`;

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
