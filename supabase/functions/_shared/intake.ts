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

export const DEFAULT_MODEL = 'claude-opus-4-7';

// ---------------------------------------------------------------------------
// Structured output schema — mirrors the listing form's field set
// ---------------------------------------------------------------------------
export const ParsedListingSchema = z.object({
  listing_kind: z.enum(['rental', 'sale']),
  title: z.string(),
  description: z.string(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().nullable(),
  price: z.number().int().nullable(),
  asking_price: z.number().int().nullable(),
  call_for_price: z.boolean(),
  price_note: z.string().nullable(),
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
  cross_street_1: z.string().nullable(),
  cross_street_2: z.string().nullable(),
  cross_streets_raw: z.string().nullable(),
  neighborhood: z.string(),
  contact_name: z.string().nullable(),
  contact_phone: z.string().nullable(),
  contact_phone_display: z.string().nullable(),
  contact_type: z.enum(['agent', 'individual', 'unknown']),
  agency_name: z.string().nullable(),
  additional_notes: z.string().nullable(),
  confidence: z.number(),
  raw_text: z.string(),
});

export const ParseResultSchema = z.object({
  listings: z.array(ParsedListingSchema),
});

export type ParsedListing = z.infer<typeof ParsedListingSchema>;

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
7. Neighborhoods: if the text mentions "Kensington", "Flatbush", "Bensonhurst", "Midwood", "Ditmas Park", "Gravesend", "Williamsburg", "Crown Heights", "Marine Park", "Sea Gate", or another NYC neighborhood, set neighborhood accordingly. Default is "Boro Park".
8. Abbreviations: BR/bdr/bdrm=bedroom, bth/bath=bathroom, bsmt=basement, flr=floor, sf/sqft/sqf=square feet, ent=entrance, sep=separate, furn=furnished, kit=kitchen, DR=dining room, LR=living room, W/D=washer/dryer, sec 8=Section 8, MIC=move-in condition, neg=negotiable, incl/inc=included, apt/aprt/apart=apartment, k=thousand ("$4k"=4000), "Chusen Kalah"/"chosson kallah"=newlywed couple apartment (note it in additional_notes).
9. listing_kind detection: "for sale", asking prices in the hundreds of thousands or millions, lot sizes, "house/condo for sale", cap rate, "investment property" => "sale". Monthly-sounding prices ($1,000-$10,000), lease terms, "for rent" => "rental". If a kind hint is supplied, follow it unless the text overwhelmingly contradicts it.
10. For RENTALS put the monthly rent in "price" and set asking_price to null. For SALES put the asking price in "asking_price" and set price to null. If no price is given, set both to null, call_for_price=true, and price_note="call for price".
11. property_type: default "apartment_building" for rentals. Use "basement" for bsmt/garden-level units, "full_house" for whole-house rentals, "duplex" for two-floor units, "apartment_house" for an apartment inside a private house. For sales prefer "single_family", "two_family", "three_family", "four_family", "detached_house", "semi_attached_house", "fully_attached_townhouse", "condo", or "co_op" when stated; otherwise best inference.
12. parking: "included" if parking comes with the listing at no extra charge, "optional" if available for extra cost, "yes" if parking exists but details unclear, "carport" if a carport is mentioned, otherwise "no".
13. heat: "included" only if heat/utilities are stated as included; otherwise "tenant_pays".
14. lease_length: "short_term" for short-term/temporary, "summer_rental"/"winter_rental" when seasonal, "long_term_annual" when a year lease is implied, null when unknown. Sales: null.
15. Identify if the contact is an agent/broker (look for: "Realty", company names, multiple stacked listings, "broker", "Call Broker") vs an individual owner.
16. contact_phone = digits only; contact_phone_display = formatted as written.
17. title: short marketing title like "Spacious 3BR on 53rd & 14th" or "2 Family House for Sale — Flatbush". Never include the phone number in the title.
18. description: 1-3 sentence clean marketing description summarizing the unit's selling points from the text. Do NOT invent details that are not in the text. Do NOT include contact info in the description.
19. additional_notes: anything parsed that does not fit other fields.
20. confidence: 0-1 — how confident you are the extraction is complete and correct. Lower it when the source is a blurry scan or the text is ambiguous.
21. raw_text: the exact original text fragment for this listing.
22. Skip pure advertisements/promotions that are not property listings. Skip job posts, services, gemachs, vouchers, and non-real-estate classifieds. Skip Hebrew-only ad boilerplate and publication headers/footers.
23. NEVER invent data. Missing value => null (or false for booleans). Accuracy matters far more than completeness — it is better to leave a field null than to guess.`;

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
): Promise<ParsedListing[]> {
  const userContent =
    typeof content === 'string'
      ? `${buildUserPrompt(typeHint, extraContext)}\n---\n${content}\n---`
      : [
          { type: 'text' as const, text: buildUserPrompt(typeHint, extraContext) },
          ...(content as Anthropic.ContentBlockParam[]),
        ];

  const response = await anthropic.messages.parse({
    model,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
    output_config: { format: zodOutputFormat(ParseResultSchema) },
  });

  return response.parsed_output?.listings ?? [];
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
  bedrooms?: number | null;
}): string | null {
  const phone = (listing.contact_phone || '').replace(/\D/g, '');
  const s1 = normalizeStreet(listing.cross_street_1);
  const s2 = normalizeStreet(listing.cross_street_2);
  if (!phone && !s1 && !s2) return null;
  const streets = [s1, s2].sort().join('|');
  const beds = listing.bedrooms != null ? String(listing.bedrooms) : 'x';
  return md5(`${phone}|${streets}|${beds}`);
}

// ---------------------------------------------------------------------------
// Geocoding — delegate to the existing geocode-cross-streets edge function
// (caching, NYC bounds, fuzzy street matching).
// ---------------------------------------------------------------------------
export async function geocodeListing(
  supabaseUrl: string,
  anonKey: string,
  listing: ParsedListing,
): Promise<{ latitude: number | null; longitude: number | null; status: string }> {
  const crossStreets = [listing.cross_street_1, listing.cross_street_2].filter(Boolean).join(' & ');
  if (!crossStreets) return { latitude: null, longitude: null, status: 'failed' };
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/geocode-cross-streets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ crossStreets, neighborhood: listing.neighborhood || undefined }),
    });
    if (!resp.ok) return { latitude: null, longitude: null, status: 'failed' };
    const result = await resp.json();
    if (result?.success && result?.coordinates) {
      return {
        latitude: result.coordinates.latitude,
        longitude: result.coordinates.longitude,
        status: 'success',
      };
    }
  } catch (err) {
    console.error('[intake] geocode error:', err);
  }
  return { latitude: null, longitude: null, status: 'failed' };
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
  geo: { latitude: number | null; longitude: number | null; status: string },
  ctx: UpsertContext,
): Promise<'inserted' | 'updated'> {
  const phoneDigits = (listing.contact_phone || '').replace(/\D/g, '');
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
    .select('id, times_seen, source_history, price, call_status')
    .eq('dedup_key', dedupKey)
    .maybeSingle();

  if (existing) {
    const history = Array.isArray(existing.source_history) ? existing.source_history : [];
    const patch: Record<string, unknown> = {
      date_last_seen: ctx.pdfDate,
      times_seen: (existing.times_seen ?? 1) + 1,
      source_history: [...history, sighting],
    };
    // Only fill a price we didn't already have — never overwrite an admin edit.
    if ((existing.price == null || existing.price === 0) && price != null) {
      patch.price = price;
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
    neighborhood: listing.neighborhood || 'Boro Park',
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
