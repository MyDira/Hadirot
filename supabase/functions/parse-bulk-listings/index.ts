// parse-bulk-listings
//
// Admin AI Intake: receives blocks of raw listing text (each block may contain
// one or many listings), parses them with the Claude API into structured
// listing data, geocodes the cross streets, and stores the results in
// scraped_listings (source = 'admin_intake') tied to a scrape_runs batch row.
//
// Admin-only: the caller's JWT must carry app_metadata.is_admin = true.
//
// Required secrets: ANTHROPIC_API_KEY
// Optional: ANTHROPIC_MODEL (defaults to claude-opus-4-7)

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { z } from 'npm:zod@4';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk/helpers/zod';
import { corsHeaders } from '../_shared/cors.ts';

const DEFAULT_MODEL = 'claude-opus-4-7';

// ---------------------------------------------------------------------------
// Structured output schema — mirrors the listing form's field set
// ---------------------------------------------------------------------------
const ParsedListingSchema = z.object({
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

const ParseResultSchema = z.object({
  listings: z.array(ParsedListingSchema),
});

type ParsedListing = z.infer<typeof ParsedListingSchema>;

// ---------------------------------------------------------------------------
// System prompt — adapted from the proven Luach pipeline prompt, extended to
// the full listing-form field set plus rental/sale detection.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a real estate data extraction specialist for Brooklyn, NY (primarily Boro Park) classified listings. An admin pastes one or more raw listing blurbs; you convert them into structured JSON listing objects.

CRITICAL RULES:
1. The pasted text may contain ONE listing or MANY. Detect listing boundaries yourself. A phone number typically marks the end of one listing or a group of listings.
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
9. listing_kind detection: "for sale", asking prices in the hundreds of thousands or millions, lot sizes, "house/condo for sale", cap rate, "investment property" => "sale". Monthly-sounding prices ($1,000-$10,000), lease terms, "for rent" => "rental". If the admin supplied a kind hint, follow it unless the text overwhelmingly contradicts it.
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
20. confidence: 0-1 — how confident you are the extraction is complete and correct.
21. raw_text: the exact original text fragment for this listing.
22. Skip pure advertisements/promotions that are not property listings. Skip job posts, services, and vouchers.
23. NEVER invent data. Missing value => null (or false for booleans).`;

function buildUserPrompt(text: string, typeHint: string): string {
  const hintLine =
    typeHint === 'rental' || typeHint === 'sale'
      ? `The admin says these are ${typeHint.toUpperCase()} listings.`
      : 'The admin did not specify a listing kind — detect rental vs sale per listing.';
  return `${hintLine}\n\nParse every listing in the following text:\n---\n${text}\n---`;
}

// ---------------------------------------------------------------------------
// Geocoding — delegate to the existing geocode-cross-streets edge function
// (it has caching, NYC bounds checks, and street-name fuzzy matching).
// ---------------------------------------------------------------------------
async function geocodeListing(
  supabaseUrl: string,
  anonKey: string,
  listing: ParsedListing,
): Promise<{ latitude: number | null; longitude: number | null; status: string }> {
  const crossStreets = [listing.cross_street_1, listing.cross_street_2]
    .filter(Boolean)
    .join(' & ');
  if (!crossStreets) return { latitude: null, longitude: null, status: 'failed' };

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/geocode-cross-streets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        crossStreets,
        neighborhood: listing.neighborhood || undefined,
      }),
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
    console.error('[parse-bulk-listings] geocode error:', err);
  }
  return { latitude: null, longitude: null, status: 'failed' };
}

// ---------------------------------------------------------------------------

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
    const validBlocks = blocks.filter((b) => typeof b.text === 'string' && b.text.trim().length > 0);

    if (validBlocks.length === 0) {
      return json({ error: 'No text blocks provided' }, 400);
    }
    if (validBlocks.length > 20) {
      return json({ error: 'Too many blocks (max 20 per run)' }, 400);
    }

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
        pdf_filename: null,
        total_pages: null,
        rental_pages_found: null,
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
          const response = await anthropic.messages.parse({
            model,
            max_tokens: 16000,
            thinking: { type: 'adaptive' },
            system: SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: buildUserPrompt(block.text, block.type_hint || 'auto'),
              },
            ],
            output_config: { format: zodOutputFormat(ParseResultSchema) },
          });

          const listings = response.parsed_output?.listings ?? [];
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

    // --- Geocode + insert ----------------------------------------------------
    let inserted = 0;
    let geocoded = 0;
    let totalParsed = 0;

    for (const { blockIndex, block, listings } of blockResults) {
      totalParsed += listings.length;

      for (const listing of listings) {
        const geo = await geocodeListing(supabaseUrl, anonKey, listing);
        if (geo.status === 'success') geocoded++;

        const phoneDigits = (listing.contact_phone || '').replace(/\D/g, '');

        const row = {
          source: 'admin_intake',
          intake_batch_id: run.id,
          intake_block_index: blockIndex,
          listing_kind: listing.listing_kind,
          pdf_date: today,
          raw_text: listing.raw_text,
          title: listing.title || 'Untitled',
          description: listing.description || null,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          price: listing.listing_kind === 'rental' ? listing.price : null,
          price_note: listing.price_note,
          floor: listing.floor,
          square_footage: listing.square_footage,
          parking: listing.parking !== 'no',
          washer_dryer: listing.washer_dryer_hookup,
          rental_term: listing.lease_length === 'short_term' ? 'short_term' : 'long_term',
          is_furnished: listing.is_furnished,
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
          dedup_key: `intake_${crypto.randomUUID()}`,
          date_first_seen: today,
          date_last_seen: today,
          times_seen: 1,
          // Intake rows must never satisfy the public "active scraped
          // listings" read policy — they are admin drafts.
          is_active: false,
          parse_confidence: Math.max(0, Math.min(1, listing.confidence)),
          match_status: 'unchecked',
          call_status: 'approved',
          assigned_user_id: block.assigned_user_id || null,
          admin_custom_agency_name: block.assigned_user_id
            ? null
            : block.admin_custom_agency_name || null,
          admin_listing_type_display: block.assigned_user_id
            ? null
            : block.admin_listing_type_display || null,
          image_paths: Array.isArray(block.image_paths) ? block.image_paths : [],
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

        const { error: insertError } = await supabase.from('scraped_listings').insert(row);
        if (insertError) {
          console.error(`[parse-bulk-listings:${requestId}] Insert failed:`, insertError.message);
          errors.push({ block: blockIndex, error: `Insert failed: ${insertError.message}` });
        } else {
          inserted++;
        }
      }
    }

    // --- Finalize batch ------------------------------------------------------
    await supabase
      .from('scrape_runs')
      .update({
        listings_parsed: totalParsed,
        listings_geocoded: geocoded,
        listings_inserted: inserted,
        listings_updated: 0,
        errors,
        status: errors.length > 0 && inserted === 0 ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    console.log(
      `[parse-bulk-listings:${requestId}] Done: ${totalParsed} parsed, ${inserted} inserted, ${geocoded} geocoded, ${errors.length} error(s)`,
    );

    return json({
      run_id: run.id,
      parsed: totalParsed,
      inserted,
      geocoded,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[parse-bulk-listings:${requestId}] Fatal:`, message);
    return json({ error: message }, 500);
  }
});
