// _shared/intake.ts
//
// Shared intake pipeline used by every listing feed that lands in
// scraped_listings:
//   - parse-bulk-listings   (pasted text)
//   - parse-pamphlet        (uploaded Luach / Kol Berama / Heimish PDFs & photos)
//   - scrape-luach-com      (luach.com website)
//
// One prompt, one schema, one deterministic dedup key, and one upsert that
// COLLAPSES the same real-world apartment onto a single row (bumping its
// sighting history) instead of duplicating it. This is what makes the review
// table's "new vs old + history" behavior correct across all sources.

import Anthropic from 'npm:@anthropic-ai/sdk';
import { z } from 'npm:zod@4';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk/helpers/zod';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { createHash } from 'node:crypto';

// Sonnet on extracted TEXT matches Opus-on-vision on the metrics that matter
// (July 20 2026 bake-off: vague-street decoding 15/15 = Opus on all three
// pamphlets; Haiku failed 0/15 even at temperature 0 — do NOT downgrade below
// Sonnet). Override via the ANTHROPIC_MODEL secret.
export const DEFAULT_MODEL = 'claude-sonnet-5';

// ---------------------------------------------------------------------------
// Structured output schema — mirrors the listing form's field set
//
// The Anthropic structured-output API caps a schema at 16 parameters carrying
// union types, and a nullable field is a union. This schema had 16 nullable
// fields and started being rejected with:
//   "Schemas contains too many parameters with union types (18 parameters ...)"
//
// So the TEXT fields that used to be nullable are plain strings on the wire and
// the model writes "" for "not present"; normalizeParsed() turns "" back into
// null immediately after validation, which keeps ParsedListing — and therefore
// every consumer of it — exactly as it was. Numbers stay nullable on purpose:
// there is no safe empty value for them (bedrooms: 0 is a studio, not unknown).
// ---------------------------------------------------------------------------

/** Text fields where the model writes "" instead of null. Order is irrelevant;
 *  membership is what drives both the wire schema and the normalizer. */
const EMPTY_AS_NULL = [
  'price_note',
  'cross_street_1',
  'cross_street_2',
  'cross_streets_raw',
  'street_address',
  'unit_number',
  'contact_name',
  'contact_phone',
  'contact_phone_display',
  'agency_name',
  'additional_notes',
] as const;

type EmptyAsNullKey = (typeof EMPTY_AS_NULL)[number];

export const ParsedListingSchema = z.object({
  listing_kind: z.enum(['rental', 'sale']),
  title: z.string(),
  description: z.string(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().nullable(),
  price: z.number().int().nullable(),
  asking_price: z.number().int().nullable(),
  call_for_price: z.boolean(),
  price_note: z.string(),
  floor: z.number().int().nullable(),
  square_footage: z.number().int().nullable(),
  property_type: z.enum([
    'apartment_building',
    'apartment_house',
    'full_house',
    'duplex',
    'basement',
    'detached_house',
    'semi_attached_house',
    'fully_attached_townhouse',
    'condo',
    'co_op',
    'single_family',
    'two_family',
    'three_family',
    'four_family',
  ]),
  parking: z.enum(['no', 'yes', 'included', 'optional', 'carport']),
  heat: z.enum(['tenant_pays', 'included']),
  washer_dryer_hookup: z.boolean(),
  lease_length: z
    .enum(['long_term_annual', 'short_term', 'summer_rental', 'winter_rental'])
    .nullable(),
  is_furnished: z.boolean(),
  broker_fee: z.boolean(),
  section_8_ok: z.boolean(),
  utilities_included: z.boolean(),
  has_porch: z.boolean(),
  separate_entrance: z.boolean(),
  cross_street_1: z.string(),
  cross_street_2: z.string(),
  cross_streets_raw: z.string(),
  street_address: z.string(),
  unit_number: z.string(),
  neighborhood: z.string(),
  contact_name: z.string(),
  contact_phone: z.string(),
  contact_phone_display: z.string(),
  contact_type: z.enum(['agent', 'individual', 'unknown']),
  agency_name: z.string(),
  additional_notes: z.string(),
  confidence: z.number(),
  raw_text: z.string(),
});

export const ParseResultSchema = z.object({
  listings: z.array(ParsedListingSchema),
});

/** What the model returns over the wire ("" for absent text). */
type ParsedListingWire = z.infer<typeof ParsedListingSchema>;

/** What the rest of the pipeline consumes — absent text is null, as before. */
export type ParsedListing = Omit<ParsedListingWire, EmptyAsNullKey> & {
  [K in EmptyAsNullKey]: string | null;
};

/**
 * "" (or whitespace) => null, so downstream sees the same shape it always has,
 * plus the one default the model must NOT guess at itself:
 *
 * every rental has at least one bathroom — classified blurbs simply don't
 * bother saying so, and a null there blocks publishing and shows as a blank on
 * the card. Sales are left alone: bathroom count is a real selling point a
 * buyer compares on, so an assumed "1" on a house would be misinformation.
 *
 * Both parseContent() and parseBatch() run everything through here, so every
 * feed gets identical treatment.
 */
export function normalizeParsed(row: ParsedListingWire): ParsedListing {
  const out = { ...row } as Record<string, unknown>;
  for (const key of EMPTY_AS_NULL) {
    const value = row[key];
    out[key] = typeof value === 'string' && value.trim() !== '' ? value : null;
  }
  if (row.listing_kind === 'rental' && (row.bathrooms == null || row.bathrooms <= 0)) {
    out.bathrooms = 1;
  }
  return out as ParsedListing;
}

// ---------------------------------------------------------------------------
// System prompt — the proven Luach pipeline rules, extended to the full
// listing-form field set plus rental/sale detection. Shared by every feed.
// ---------------------------------------------------------------------------
export const SYSTEM_PROMPT = `You are a real estate data extraction specialist for Brooklyn, NY (primarily Boro Park) classified listings. You receive raw listing content — pasted text, a scanned community pamphlet (Luach HaTsibbur, Kol Berama, or a Heimish Agent booklet), or a website listing — and convert it into structured JSON listing objects.

CRITICAL RULES:
1. The content may contain ONE listing or MANY. Detect listing boundaries yourself. A phone number typically marks the end of one listing or a group of listings. In a pamphlet, listings are usually stacked one per line or short paragraph under section headers like UNFURNISHED, FURNISHED, SHORT TERM, RENTALS, or FOR SALE.
2. Agents/brokers often stack multiple listings under one phone number. Split them into SEPARATE listing objects. EVERY split listing MUST inherit the phone number, contact name, contact type, and agency name from the group. No listing should have an empty phone if a phone appears anywhere in that block.
3. Location shorthand patterns (STREET first, AVENUE second in cross_street fields):
   - "53 14" = 53rd Street & 14th Avenue
   - "10&40th" = 40th Street & 10th Avenue
   - "Dahill/43" = 43rd Street & Dahill Road
   - "15-40" = 40th Street & 15th Avenue (in X-Y formats the SMALLER number 1-25 is the AVENUE, the LARGER 30-90 is the STREET)
   - "39th Street btw 12 and 13 Ave" = 39th Street & 12th Avenue
4. Vague street references — EXACT mappings: "low 30s/40s/50s/60s" = X1 (31st/41st/51st/61st); "mid" = X5; "high"/"hi" = X8.
5. cross_street_1 is ALWAYS the street (e.g. "53rd Street"); cross_street_2 is ALWAYS the avenue/road (e.g. "14th Avenue").
6. Named roads: "Dahill" = Dahill Road, "New Utrecht" = New Utrecht Avenue, "Fort Ham"/"Ft Ham" = Fort Hamilton Parkway, "McDonald" = McDonald Avenue, "Ditmas" = Ditmas Avenue, "Cortelyou" = Cortelyou Road, "E2/E3/E4/E8" = East 2nd/3rd/4th/8th Street, "Foster" = Foster Avenue.
7. EXACT ADDRESSES — when the listing gives a specific street address (a house number followed by a street name: "1438 53rd Street", "5012 14th Ave", "1279 E 8 St Apt 2"), put it in street_address as "<number> <full street name>" (expand the street name the same way as rule 6, e.g. "5012 14th Avenue"). Put any apartment/unit designation ("Apt 2", "#3R", "Unit B") in unit_number WITHOUT the "Apt"/"Unit"/"#" prefix. Rules:
   - A house number ALWAYS means an exact address. Never put a house number into cross_street_1 / cross_street_2.
   - If the text ALSO names an intersection, fill the cross_street fields too — both can be present.
   - If the text gives ONLY an intersection, street_address MUST be "". NEVER build an address out of cross streets, and never invent a house number.
8. Neighborhoods: if the text mentions "Kensington", "Flatbush", "Bensonhurst", "Midwood", "Ditmas Park", "Gravesend", "Williamsburg", "Crown Heights", "Marine Park", "Sea Gate", or another NYC neighborhood, set neighborhood accordingly. Default is "Boro Park". The pipeline re-derives the neighborhood from the geocoded coordinates afterwards, so a best guess here is fine.
9. Abbreviations: BR/bdr/bdrm=bedroom, bth/bath=bathroom, bsmt=basement, flr=floor, sf/sqft/sqf=square feet, ent=entrance, sep=separate, furn=furnished, kit=kitchen, DR=dining room, LR=living room, W/D=washer/dryer, sec 8=Section 8, MIC=move-in condition, neg=negotiable, incl/inc=included, apt/aprt/apart=apartment, k=thousand ("$4k"=4000), "Chusen Kalah"/"chosson kallah"=newlywed couple apartment (note it in additional_notes).
10. listing_kind detection: "for sale", asking prices in the hundreds of thousands or millions, lot sizes, "house/condo for sale", cap rate, "investment property" => "sale". Monthly-sounding prices ($1,000-$10,000), lease terms, "for rent" => "rental". If a kind hint is supplied, follow it unless the text overwhelmingly contradicts it.
11. For RENTALS put the monthly rent in "price" and set asking_price to null. For SALES put the asking price in "asking_price" and set price to null. If no price is given, set both to null, call_for_price=true, and price_note="call for price". When a price IS given, price_note is "".
12. bathrooms: extract the stated count ("1.5 bth" => 1.5). If the listing says nothing about bathrooms, leave it null — do NOT guess a number. The pipeline fills in the standard assumption for rentals afterwards.
13. property_type: default "apartment_building" for rentals. Use "basement" for bsmt/garden-level units, "full_house" for whole-house rentals, "duplex" for two-floor units, "apartment_house" for an apartment inside a private house. For sales prefer "single_family", "two_family", "three_family", "four_family", "detached_house", "semi_attached_house", "fully_attached_townhouse", "condo", or "co_op" when stated; otherwise best inference.
14. parking: "included" if parking comes with the listing at no extra charge, "optional" if available for extra cost, "yes" if parking exists but details unclear, "carport" if a carport is mentioned, otherwise "no".
15. heat: "included" only if heat/utilities are stated as included; otherwise "tenant_pays".
16. lease_length: "short_term" for short-term/temporary, "summer_rental"/"winter_rental" when seasonal, "long_term_annual" when a year lease is implied, null when unknown. Sales: null.
17. Identify if the contact is an agent/broker (look for: "Realty", company names, multiple stacked listings, "broker", "Call Broker") vs an individual owner.
18. contact_phone = digits only; contact_phone_display = formatted as written.
19. title: short marketing title like "Spacious 3BR on 53rd & 14th" or "2 Family House for Sale — Flatbush". Never include the phone number in the title.
20. description: 1-3 sentence clean marketing description summarizing the unit's selling points from the text. Do NOT invent details that are not in the text. Do NOT include contact info in the description.
21. additional_notes: anything parsed that does not fit other fields.
22. confidence: 0-1 — how confident you are the extraction is complete and correct. Lower it when the source is a blurry scan or the text is ambiguous.
23. raw_text: the exact original text fragment for this listing.
24. Skip pure advertisements/promotions that are not property listings. Skip job posts, services, gemachs, vouchers, and non-real-estate classifieds. Skip Hebrew-only ad boilerplate and publication headers/footers.
25. NEVER invent data. Accuracy matters far more than completeness — it is better to leave a field empty than to guess. How to say "not present" depends on the field's type: TEXT fields (price_note, cross_street_1, cross_street_2, cross_streets_raw, street_address, unit_number, contact_name, contact_phone, contact_phone_display, agency_name, additional_notes) use an empty string ""; NUMBER fields (bedrooms, bathrooms, price, asking_price, floor, square_footage) and lease_length use null; booleans use false. Never write the word "null" inside a text field.`;

export function buildUserPrompt(typeHint: string, extraContext?: string): string {
  const hintLine =
    typeHint === 'rental' || typeHint === 'sale'
      ? `The admin says these are ${typeHint.toUpperCase()} listings.`
      : 'The admin did not specify a listing kind — detect rental vs sale per listing.';
  const ctx = extraContext ? `\n${extraContext}` : '';
  return `${hintLine}${ctx}\n\nExtract every real estate listing you can find. Return them in the "listings" array.`;
}

// ---------------------------------------------------------------------------
// Claude parse — content may be plain text OR document/image blocks (a PDF or
// scanned pamphlet pages). Same prompt + schema either way.
// ---------------------------------------------------------------------------
export async function parseContent(
  anthropic: Anthropic,
  model: string,
  content: string | Anthropic.MessageParam['content'],
  typeHint: string,
  extraContext?: string,
  /** Caller-specific remedy shown if the model runs out of output budget. */
  overflowHint = 'split the upload into smaller files (fewer pages per file) and retry.',
): Promise<ParsedListing[]> {
  const userContent =
    typeof content === 'string'
      ? `${buildUserPrompt(typeHint, extraContext)}\n---\n${content}\n---`
      : [
          { type: 'text' as const, text: buildUserPrompt(typeHint, extraContext) },
          ...(content as Anthropic.ContentBlockParam[]),
        ];

  // Streaming is mandatory here: above ~16k max_tokens the SDK rejects
  // non-streaming requests (10-minute rule), and a full booklet genuinely
  // takes minutes. 64k output gives adaptive thinking + ~100 listings of JSON
  // headroom (a 32k cap truncated a real Heimish booklet mid-array). The API
  // still enforces the JSON schema (output_config); we accumulate the stream
  // and zod-validate the final text.
  //
  // cache_control on the system prompt: the ~2.5k-token rulebook is identical
  // across every chunk of a run (and across runs), so all calls after the
  // first read it from cache at ~10% of the input price.
  const stream = anthropic.messages.stream({
    model,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
    output_config: { format: zodOutputFormat(ParseResultSchema) },
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === 'max_tokens') {
    throw new Error(`Output hit the token limit before finishing — ${overflowHint}`);
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const parsed = ParseResultSchema.parse(JSON.parse(text));
  return parsed.listings.map(normalizeParsed);
}

// ---------------------------------------------------------------------------
// Batch parse — MANY separate source documents in ONE Claude call.
//
// parseContent() above handles "one blob of content => listings". When a feed
// has N independent sources (N scraped web pages, say) calling it N times costs
// N round-trips and re-sends the cached prompt N times. parseBatch() sends all
// N in a single request, delimited by "===== SOURCE n =====" markers, and asks
// the model to stamp every listing with the source_index it came from — which
// is what lets the caller attach each listing back to its own URL and date.
//
// source_index is a plain int, NOT nullable: nullable fields are unions and the
// structured-output API caps a schema at 16 union-typed parameters (see the
// EMPTY_AS_NULL note above). A non-nullable number adds nothing to that count,
// so this extension is safe.
//
// The system prompt is deliberately left byte-identical to parseContent()'s so
// the cached prefix is still shared with every other feed; the batch-specific
// rules ride in the user turn.
// ---------------------------------------------------------------------------

export const BatchParsedListingSchema = ParsedListingSchema.extend({
  source_index: z.number().int(),
});

export const BatchParseResultSchema = z.object({
  listings: z.array(BatchParsedListingSchema),
});

export interface BatchParsedListing {
  sourceIndex: number;
  listing: ParsedListing;
}

export async function parseBatch(
  anthropic: Anthropic,
  model: string,
  sources: Array<{ text: string }>,
  typeHint: string,
  extraContext?: string,
  overflowHint = 'narrow the date range (or lower the max-listings cap) and retry.',
): Promise<BatchParsedListing[]> {
  if (sources.length === 0) return [];

  const batchRules = [
    `This message contains ${sources.length} SEPARATE listing sources, each introduced by a "===== SOURCE n =====" marker.`,
    'Treat every source independently. NEVER merge details across sources, and never let one source\'s phone number, address, or price leak into a listing that came from a different source.',
    'A single source may still hold more than one listing (an agent stacking units) — emit one object per listing, exactly as usual.',
    'A source may hold NO real listing at all (an advertisement, or a page that failed to load) — emit nothing for it. Do not invent a listing to fill a gap.',
    'EVERY listing you return MUST carry source_index = the integer n from the marker it was found under. This is the only link back to the listing\'s own URL and posting date; a wrong source_index files the listing under someone else\'s address.',
  ].join('\n');

  const numbered = sources
    .map((s, i) => `===== SOURCE ${i} =====\n${s.text}`)
    .join('\n\n');

  const userContent = `${buildUserPrompt(typeHint, extraContext)}\n\n${batchRules}\n\n${numbered}`;

  const stream = anthropic.messages.stream({
    model,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
    output_config: { format: zodOutputFormat(BatchParseResultSchema) },
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === 'max_tokens') {
    throw new Error(`Output hit the token limit before finishing — ${overflowHint}`);
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const parsed = BatchParseResultSchema.parse(JSON.parse(text));

  let clamped = 0;
  const out = parsed.listings.map((row) => {
    const { source_index, ...rest } = row;
    let idx = source_index;
    if (!Number.isInteger(idx) || idx < 0 || idx >= sources.length) {
      clamped++;
      idx = Math.min(Math.max(0, Number.isFinite(idx) ? idx : 0), sources.length - 1);
    }
    return { sourceIndex: idx, listing: normalizeParsed(rest as ParsedListingWire) };
  });
  if (clamped > 0) {
    // Not fatal — the listing is still real — but it is now attached to a
    // best-guess source, so surface it rather than swallowing it.
    console.warn(`[intake] parseBatch: ${clamped} listing(s) had an out-of-range source_index`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic dedup key — identical logic to the original Python pipeline so
// keys line up with the ~1.3k historical Luach rows. Same real-world apartment
// (phone + cross streets + bedrooms) => same key => collapse.
// ---------------------------------------------------------------------------
function normalizeStreet(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\b(street|st|avenue|ave|road|rd|parkway|pkwy|boulevard|blvd|drive|dr)\b/g, '')
    .replace(/\b(th|st|nd|rd)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Digits only, dropping a leading US country code so "1-718-555-1234" and
 * "718-555-1234" collapse onto the same key. Anything that isn't a 10- or
 * 11-digit US number keeps its raw digits, so odd/partial numbers still
 * contribute to the key instead of silently dropping out of it.
 *
 * Back-compatible with the historical keys: a plain 10-digit number is
 * returned unchanged, so existing dedup_keys still line up.
 */
export function normalizePhoneDigits(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

/**
 * Dedup key from normalized phone + sorted cross streets + bedrooms.
 * Returns null when the listing is too sparse to safely dedup (no phone AND no
 * streets) — the caller then assigns a unique key so distinct-but-empty
 * listings are NEVER wrongly merged. Accuracy first.
 *
 * MD5 (not SHA) so keys line up with the ~1.3k historical Python-generated
 * Luach rows; stable hash, not a secure one.
 */
export function generateDedupKey(listing: {
  contact_phone?: string | null;
  cross_street_1?: string | null;
  cross_street_2?: string | null;
  street_address?: string | null;
  unit_number?: string | null;
  bedrooms?: number | null;
}): string | null {
  const phone = normalizePhoneDigits(listing.contact_phone);
  const s1 = normalizeStreet(listing.cross_street_1);
  const s2 = normalizeStreet(listing.cross_street_2);
  const address = normalizeAddress(listing.street_address, listing.unit_number);
  if (!phone && !s1 && !s2 && !address) return null;
  const streets = [s1, s2].sort().join('|');
  const beds = listing.bedrooms != null ? String(listing.bedrooms) : 'x';
  // An exact address identifies the unit far more tightly than the
  // intersection does — two different buildings on one agent's block would
  // otherwise collapse onto a single row. Rows without an address keep the
  // historical 3-part key untouched.
  if (address) return md5(`${phone}|${streets}|${beds}|${address}`);
  return md5(`${phone}|${streets}|${beds}`);
}

/** House number + street + unit, punctuation-free, for the dedup key. */
function normalizeAddress(
  address: string | null | undefined,
  unit: string | null | undefined,
): string {
  const clean = (s: string | null | undefined) =>
    (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const base = clean(address);
  if (!base) return '';
  const u = clean(unit);
  return u ? `${base}#${u}` : base;
}

// ---------------------------------------------------------------------------
// Geocoding — delegate to the existing geocode-cross-streets edge function
// (caching, NYC bounds, fuzzy street matching).
// ---------------------------------------------------------------------------
export interface GeoResult {
  latitude: number | null;
  longitude: number | null;
  status: string;
  /**
   * Neighborhood reverse-geocoded FROM the resolved pin — the same rule the
   * listing form follows. Null when nothing was placed, in which case the
   * caller falls back to whatever the model read out of the text.
   */
  neighborhood: string | null;
}

export async function geocodeListing(
  supabaseUrl: string,
  anonKey: string,
  listing: ParsedListing,
): Promise<GeoResult> {
  const crossStreets = [listing.cross_street_1, listing.cross_street_2].filter(Boolean).join(' & ');
  const address = listing.street_address?.trim() || '';
  // An exact address beats an intersection: it pins the actual building.
  // Cross streets remain the fallback when the address can't be resolved.
  const attempts: Array<Record<string, string>> = [];
  if (address) attempts.push({ address });
  if (crossStreets) attempts.push({ crossStreets });
  if (attempts.length === 0) {
    return { latitude: null, longitude: null, status: 'failed', neighborhood: null };
  }

  for (const attempt of attempts) {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/geocode-cross-streets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          ...attempt,
          neighborhood: listing.neighborhood || undefined,
          // Always re-derive the neighborhood from the pin instead of trusting
          // the model's read of the text (or its "Boro Park" default).
          detectNeighborhood: true,
        }),
      });
      if (!resp.ok) continue;
      const result = await resp.json();
      if (result?.success && result?.coordinates) {
        return {
          latitude: result.coordinates.latitude,
          longitude: result.coordinates.longitude,
          status: 'success',
          neighborhood: result.neighborhood || null,
        };
      }
    } catch (err) {
      console.error('[intake] geocode error:', err);
    }
  }
  return { latitude: null, longitude: null, status: 'failed', neighborhood: null };
}

// ---------------------------------------------------------------------------
// Collapse-on-conflict upsert.
//   - New dedup_key           => INSERT a fresh row (admin_reviewed_at NULL => "New").
//   - Existing dedup_key      => bump date_last_seen + times_seen, append a
//                                source_history entry, refresh price if it was
//                                previously unknown; NEVER touch the admin's
//                                call_status / call_notes / edits / assignment
//                                / reviewed state.
// Returns 'inserted' | 'updated'.
// ---------------------------------------------------------------------------
export interface UpsertContext {
  source: string;
  runId: string | null;
  blockIndex?: number | null;
  sourceUrl?: string | null;
  pdfDate: string; // yyyy-mm-dd
  images?: Array<{ filePath: string; publicUrl: string; is_featured: boolean }>;
  assignedUserId?: string | null;
  adminCustomAgencyName?: string | null;
  adminListingTypeDisplay?: 'agent' | 'owner' | null;
}

export async function upsertScrapedListing(
  supabase: SupabaseClient,
  listing: ParsedListing,
  geo: GeoResult,
  ctx: UpsertContext,
): Promise<'inserted' | 'updated'> {
  const phoneDigits = normalizePhoneDigits(listing.contact_phone);
  const dedupKey = generateDedupKey(listing) ?? `nokey_${crypto.randomUUID()}`;
  const seenAt = new Date().toISOString();
  const price = listing.listing_kind === 'rental' ? listing.price : null;

  const sighting = {
    source: ctx.source,
    date: ctx.pdfDate,
    run_id: ctx.runId,
    price,
    seen_at: seenAt,
  };

  // --- Does this real-world listing already exist? ------------------------
  const { data: existing } = await supabase
    .from('scraped_listings')
    .select(
      'id, times_seen, source_history, price, call_status, image_paths, assigned_user_id, admin_custom_agency_name, admin_listing_type_display, intake_extra',
    )
    .eq('dedup_key', dedupKey)
    .maybeSingle();

  if (existing) {
    const history = Array.isArray(existing.source_history) ? existing.source_history : [];
    // Same listing seen twice within one run (page-chunk overlap, or repeated
    // in the same booklet): not a new sighting — don't inflate times_seen.
    if (ctx.runId && history.some((h: { run_id?: string | null }) => h.run_id === ctx.runId)) {
      return 'updated';
    }
    const patch: Record<string, unknown> = {
      date_last_seen: ctx.pdfDate,
      times_seen: (existing.times_seen ?? 1) + 1,
      source_history: [...history, sighting],
    };
    // Only fill a price we didn't already have — never overwrite an admin edit.
    if ((existing.price == null || existing.price === 0) && price != null) {
      patch.price = price;
    }
    // Same rule for an exact address: a later sighting that spells the address
    // out fills a gap, but never overwrites one that's already there.
    const existingExtra = (existing.intake_extra ?? {}) as Record<string, unknown>;
    const newAddress = listing.street_address?.trim();
    if (!existingExtra.full_address && newAddress) {
      patch.intake_extra = {
        ...existingExtra,
        full_address: newAddress,
        unit_number: listing.unit_number?.trim() || existingExtra.unit_number || null,
      };
    }
    // Carry this block's media + account assignment onto the existing draft,
    // but only when it doesn't already have them — never clobber an earlier
    // admin choice (same rule as price above).
    const existingImages = Array.isArray(existing.image_paths) ? existing.image_paths : [];
    if (existingImages.length === 0 && Array.isArray(ctx.images) && ctx.images.length > 0) {
      patch.image_paths = ctx.images;
    }
    if (!existing.assigned_user_id && ctx.assignedUserId) {
      patch.assigned_user_id = ctx.assignedUserId;
      patch.admin_custom_agency_name = null;
      patch.admin_listing_type_display = null;
    } else if (!existing.assigned_user_id && !ctx.assignedUserId) {
      if (!existing.admin_custom_agency_name && ctx.adminCustomAgencyName) {
        patch.admin_custom_agency_name = ctx.adminCustomAgencyName;
      }
      if (!existing.admin_listing_type_display && ctx.adminListingTypeDisplay) {
        patch.admin_listing_type_display = ctx.adminListingTypeDisplay;
      }
    }
    // A re-sighting of a previously suppressed row is worth resurfacing.
    if (existing.call_status === 'suppressed') {
      patch.call_status = 'pending_call';
      patch.admin_reviewed_at = null;
    }
    const { error } = await supabase.from('scraped_listings').update(patch).eq('id', existing.id);
    if (error) throw new Error(`update failed: ${error.message}`);
    return 'updated';
  }

  // --- Brand-new listing ---------------------------------------------------
  const row = {
    source: ctx.source,
    source_url: ctx.sourceUrl ?? null,
    intake_batch_id: ctx.runId,
    intake_block_index: ctx.blockIndex ?? null,
    listing_kind: listing.listing_kind,
    pdf_date: ctx.pdfDate,
    raw_text: listing.raw_text,
    title: listing.title || 'Untitled',
    description: listing.description || null,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    price,
    price_note: listing.price_note,
    floor: listing.floor,
    square_footage: listing.square_footage,
    parking: listing.parking !== 'no',
    washer_dryer: listing.washer_dryer_hookup,
    rental_term: listing.lease_length === 'short_term' ? 'short_term' : 'long_term',
    is_furnished: listing.is_furnished,
    property_type: listing.property_type,
    cross_street_1: listing.cross_street_1,
    cross_street_2: listing.cross_street_2,
    cross_streets_raw: listing.cross_streets_raw,
    // Geocode-derived neighborhood wins — the model only ever sees the words
    // in the blurb, and most of them name no neighborhood at all.
    neighborhood: geo.neighborhood || listing.neighborhood || 'Boro Park',
    latitude: geo.latitude,
    longitude: geo.longitude,
    geocode_status: geo.status,
    contact_phone: phoneDigits || null,
    contact_phone_display: listing.contact_phone_display,
    contact_name: listing.contact_name,
    contact_type: listing.contact_type,
    agency_name: listing.agency_name,
    section_8_ok: listing.section_8_ok,
    heat_included: listing.heat === 'included',
    utilities_included: listing.utilities_included,
    has_porch: listing.has_porch,
    basement: listing.property_type === 'basement',
    separate_entrance: listing.separate_entrance,
    additional_notes: listing.additional_notes,
    dedup_key: dedupKey,
    date_first_seen: ctx.pdfDate,
    date_last_seen: ctx.pdfDate,
    times_seen: 1,
    source_history: [sighting],
    // Pre-publish admin drafts must never satisfy the public "active scraped
    // listings" read policy.
    is_active: false,
    // Brand-new => unseen => lights up the "New" badge / filter.
    admin_reviewed_at: null,
    parse_confidence: Math.max(0, Math.min(1, listing.confidence)),
    match_status: 'unchecked',
    call_status: 'pending_call',
    assigned_user_id: ctx.assignedUserId ?? null,
    admin_custom_agency_name: ctx.assignedUserId ? null : ctx.adminCustomAgencyName ?? null,
    admin_listing_type_display: ctx.assignedUserId ? null : ctx.adminListingTypeDisplay ?? null,
    image_paths: Array.isArray(ctx.images) ? ctx.images : [],
    intake_extra: {
      property_type: listing.property_type,
      parking: listing.parking,
      heat: listing.heat,
      washer_dryer_hookup: listing.washer_dryer_hookup,
      lease_length: listing.lease_length,
      call_for_price: listing.call_for_price,
      asking_price: listing.listing_kind === 'sale' ? listing.asking_price : null,
      broker_fee: listing.broker_fee,
      // Exact address (when the blurb gave one). Cross streets stay in their
      // own columns; these live alongside the other publish-time extras.
      full_address: listing.street_address?.trim() || null,
      unit_number: listing.unit_number?.trim() || null,
    },
  };

  const { error } = await supabase.from('scraped_listings').insert(row);
  if (error) {
    // A concurrent run may have inserted the same key between our SELECT and
    // INSERT — treat the unique-violation as an update we lost the race on.
    if (error.code === '23505') return 'updated';
    throw new Error(`insert failed: ${error.message}`);
  }
  return 'inserted';
}

// MD5 (not SHA) so dedup keys line up with the historical Python-generated
// Luach rows. Stable hash, not a secure one. node:crypto is available in the
// Supabase Edge (Deno) runtime.
function md5(input: string): string {
  return createHash('md5').update(input, 'utf8').digest('hex');
}
