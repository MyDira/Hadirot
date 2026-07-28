import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  parseCrossStreets,
  generateQueryVariations,
  fuzzyMatchStreet,
} from './normalizer.ts';
import { corsHeaders } from "../_shared/cors.ts";

// NYC bounding box for biasing results (SW corner | NE corner)
const NYC_BOUNDS = '40.4774,-74.2591|40.9176,-73.7002';

// Hard limits — any geocoded coordinate outside this box is rejected outright.
const NYC_LAT_MIN = 40.4774, NYC_LAT_MAX = 40.9176;
const NYC_LNG_MIN = -74.2591, NYC_LNG_MAX = -73.7002;

function isInNYC(lat: number, lng: number): boolean {
  return lat >= NYC_LAT_MIN && lat <= NYC_LAT_MAX &&
         lng >= NYC_LNG_MIN && lng <= NYC_LNG_MAX;
}

function buildCacheKey(
  crossStreets: string,
  neighborhood?: string,
  opts?: { address?: boolean; detectNeighborhood?: boolean },
): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  // The mode flags change what comes back for the same query text, so they
  // have to be part of the key or the two modes poison each other's cache.
  const suffix = `${opts?.address ? '|addr' : ''}${opts?.detectNeighborhood ? '|nb' : ''}`;
  return `${norm(crossStreets)}|${norm(neighborhood ?? '')}${suffix}`;
}

async function lookupCache(
  supabase: SupabaseClient,
  cacheKey: string,
): Promise<GeocodeResult | null> {
  const { data, error } = await supabase
    .from('geocode_cache')
    .select('result')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error('Cache lookup error:', error);
    return null;
  }
  if (!data) return null;

  return data.result as GeocodeResult;
}

async function writeCache(
  supabase: SupabaseClient,
  cacheKey: string,
  crossStreets: string,
  neighborhood: string | undefined,
  result: GeocodeResult,
): Promise<void> {
  const { error } = await supabase
    .from('geocode_cache')
    .upsert(
      {
        cache_key: cacheKey,
        input_cross_streets: crossStreets,
        input_neighborhood: neighborhood ?? null,
        result,
      },
      { onConflict: 'cache_key' },
    );

  if (error) {
    console.error('Cache write error:', error);
  }
}

interface GeocodeRequest {
  crossStreets?: string;
  /**
   * Exact street address ("1438 53rd Street"). Mutually exclusive with
   * crossStreets — geocoded as a plain address, with no intersection check.
   */
  address?: string;
  neighborhood?: string;
  /**
   * Force the neighborhood to be reverse-geocoded from the resolved pin even
   * when the caller passed one in. Callers that only have a guessed
   * neighborhood (the AI intake parser) use this to get the real one back.
   */
  detectNeighborhood?: boolean;
}

interface GeocodeResult {
  success: boolean;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  normalizedQuery?: string;
  originalQuery: string;
  neighborhood?: string;
  fallbackUsed?: string;
  error?: string;
  corrections?: string[];
}

interface GoogleCoords {
  lat: number;
  lng: number;
}

// ── Google Geocoding ──────────────────────────────────────────────────────────

async function geocodeWithGoogle(
  query: string,
  apiKey: string,
  requireIntersection = false,
): Promise<GoogleCoords | null> {
  const params = new URLSearchParams({
    address: query,
    key: apiKey,
    bounds: NYC_BOUNDS,
  });

  // When requireIntersection=true, Google will only return results whose type
  // is "intersection". Parallel or non-crossing streets return ZERO_RESULTS.
  if (requireIntersection) {
    params.set('result_type', 'intersection');
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Google Geocoding API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.status === 'OK' && data.results?.length > 0) {
      // When enforcing intersection, only accept results whose type is 'intersection'.
      // Google may return 'route'-typed results even when result_type=intersection is
      // requested — those must be rejected so parallel streets don't slip through.
      const candidates = requireIntersection
        ? data.results.filter((r: { types?: string[] }) => r.types?.includes('intersection'))
        : data.results;

      const loc = candidates[0]?.geometry?.location;
      // Reject anything that geocoded outside the five boroughs / NYC metro.
      if (loc && isInNYC(loc.lat, loc.lng)) return { lat: loc.lat, lng: loc.lng };
    }

    if (data.status !== 'ZERO_RESULTS') {
      console.error(`Google Geocoding status: ${data.status}`);
    }

    return null;
  } catch (error) {
    console.error('Google Geocoding error:', error);
    return null;
  }
}

async function reverseGeocode(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    latlng: `${lat},${lng}`,
    key: apiKey,
    result_type: 'neighborhood|sublocality',
  });

  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();

    if (data.status === 'OK' && data.results?.length > 0) {
      for (const result of data.results) {
        const comp = (result.address_components ?? []).find(
          (c: { types: string[] }) =>
            c.types.includes('neighborhood') ||
            c.types.includes('sublocality_level_1'),
        );
        if (comp) return comp.long_name;
      }
    }

    return null;
  } catch (error) {
    console.error('Google reverse geocoding error:', error);
    return null;
  }
}

// ── Query fallback chain ──────────────────────────────────────────────────────

async function tryGeocodingWithFallbacks(
  parsed: ReturnType<typeof parseCrossStreets>,
  neighborhood: string | undefined,
  apiKey: string,
): Promise<{ coords: GoogleCoords | null; query: string; fallback: string }> {
  const variations = generateQueryVariations(parsed);
  const locationSuffixes = neighborhood
    ? [`${neighborhood}, Brooklyn, NY`, 'Brooklyn, NY', 'New York, NY']
    : ['Brooklyn, NY', 'New York, NY'];

  // Whether both streets were provided — determines if we enforce intersection validation
  const hasBothStreets = !!parsed.street2;

  // Primary: try all query variations × location suffixes.
  // When two streets are present, require result_type=intersection so Google
  // rejects parallel / non-crossing streets outright.
  for (const variation of variations) {
    for (const suffix of locationSuffixes) {
      const query = `${variation}, ${suffix}`;
      console.log(`Trying geocode query: ${query}`);

      const coords = await geocodeWithGoogle(query, apiKey, hasBothStreets);
      if (coords) {
        return {
          coords,
          query: variation,
          fallback: variation === variations[0] ? 'none' : `variation: ${variation}`,
        };
      }
    }
  }

  // Fuzzy match on street 1
  if (parsed.street1 && parsed.street1.type !== 'unknown') {
    const fuzzyMatch1 = fuzzyMatchStreet(parsed.street1.original);
    if (fuzzyMatch1 && fuzzyMatch1 !== parsed.street1.normalized) {
      console.log(`Fuzzy match for street1: ${parsed.street1.original} -> ${fuzzyMatch1}`);

      for (const suffix of locationSuffixes) {
        const query = hasBothStreets
          ? `${fuzzyMatch1} & ${parsed.street2!.normalized}, ${suffix}`
          : `${fuzzyMatch1}, ${suffix}`;

        const coords = await geocodeWithGoogle(query, apiKey, hasBothStreets);
        if (coords) {
          return { coords, query: query.split(',')[0], fallback: `fuzzy match: ${fuzzyMatch1}` };
        }
      }
    }
  }

  // Fuzzy match on street 2
  if (parsed.street2 && parsed.street2.type !== 'unknown') {
    const fuzzyMatch2 = fuzzyMatchStreet(parsed.street2.original);
    if (fuzzyMatch2 && fuzzyMatch2 !== parsed.street2.normalized) {
      console.log(`Fuzzy match for street2: ${parsed.street2.original} -> ${fuzzyMatch2}`);

      for (const suffix of locationSuffixes) {
        const query = `${parsed.street1.normalized} & ${fuzzyMatch2}, ${suffix}`;
        const coords = await geocodeWithGoogle(query, apiKey, true);
        if (coords) {
          return { coords, query: query.split(',')[0], fallback: `fuzzy match: ${fuzzyMatch2}` };
        }
      }
    }
  }

  // Single-street fallback — only used when no second street was provided.
  // When both streets are present we must NOT fall back to one street, because
  // that would accept parallel streets that share a neighbourhood.
  if (!hasBothStreets) {
    for (const suffix of ['Brooklyn, NY', 'New York, NY']) {
      const query = `${parsed.street1.normalized}, ${suffix}`;
      console.log(`Trying single street fallback: ${query}`);

      const coords = await geocodeWithGoogle(query, apiKey, false);
      if (coords) {
        return { coords, query: parsed.street1.normalized, fallback: 'single street only' };
      }
    }
  }

  return { coords: null, query: '', fallback: 'all attempts failed' };
}

// ── Request handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const googleApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!googleApiKey) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Geocoding service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body: GeocodeRequest = await req.json();
    const { neighborhood, detectNeighborhood } = body;
    const isAddressMode = typeof body.address === 'string' && body.address.trim().length > 0;
    // One query string drives both modes; only the resolution strategy differs.
    const query = (isAddressMode ? body.address : body.crossStreets) ?? '';

    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 200) {
      return new Response(
        JSON.stringify({
          success: false,
          error: isAddressMode ? 'Invalid address input' : 'Invalid cross streets input',
          originalQuery: query || '',
        } as GeocodeResult),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (neighborhood !== undefined && (typeof neighborhood !== 'string' || neighborhood.length > 200)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid neighborhood input', originalQuery: query } as GeocodeResult),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const crossStreets = query;

    console.log(
      `Geocoding request (${isAddressMode ? 'address' : 'cross streets'}): "${query}" (neighborhood: ${neighborhood || 'not specified'})`,
    );

    // Cache lookup
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const cacheClient = supabaseUrl && supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;

    const cacheKey = buildCacheKey(crossStreets, neighborhood, {
      address: isAddressMode,
      detectNeighborhood: !!detectNeighborhood,
    });
    if (cacheClient) {
      const cached = await lookupCache(cacheClient, cacheKey);
      if (cached) {
        console.log(`Cache hit for key: ${cacheKey}`);
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const corrections: string[] = [];
    let coords: GoogleCoords | null = null;
    let resolvedQuery = crossStreets;
    let fallback = 'none';
    let normalizedForError = crossStreets;

    if (isAddressMode) {
      // A house-numbered address is a plain forward geocode — no intersection
      // parsing, no street normalization, no intersection result_type. The
      // neighborhood hint is deliberately left out: number + street is already
      // unique inside a borough, and a wrong hint (the parser's guess often is)
      // would only drag the result off the real building.
      for (const suffix of ['Brooklyn, NY', 'New York, NY']) {
        const candidate = `${crossStreets}, ${suffix}`;
        coords = await geocodeWithGoogle(candidate, googleApiKey);
        if (coords) {
          resolvedQuery = candidate;
          break;
        }
      }
    } else {
      const parsed = parseCrossStreets(crossStreets);
      console.log('Parsed cross streets:', JSON.stringify(parsed));

      if (parsed.street1.original !== parsed.street1.normalized) {
        corrections.push(`"${parsed.street1.original}" -> "${parsed.street1.normalized}"`);
      }
      if (parsed.street2 && parsed.street2.original !== parsed.street2.normalized) {
        corrections.push(`"${parsed.street2.original}" -> "${parsed.street2.normalized}"`);
      }

      const attempt = await tryGeocodingWithFallbacks(parsed, neighborhood, googleApiKey);
      coords = attempt.coords;
      resolvedQuery = attempt.query;
      fallback = attempt.fallback;
      normalizedForError = parsed.formattedQuery;
    }

    if (!coords) {
      const notFoundResult: GeocodeResult = {
        success: false,
        error: isAddressMode
          ? 'Address not found. Check the house number and street, or switch to cross streets.'
          : 'Location not found. Try a different format (e.g., "Avenue J & East 15th Street")',
        originalQuery: crossStreets,
        normalizedQuery: normalizedForError,
        corrections: corrections.length > 0 ? corrections : undefined,
      };
      if (cacheClient) {
        await writeCache(cacheClient, cacheKey, crossStreets, neighborhood, notFoundResult);
      }
      return new Response(JSON.stringify(notFoundResult), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { lat, lng } = coords;

    // The caller's neighborhood is only a hint when detectNeighborhood is set —
    // the pin is the source of truth, exactly as the listing form treats it.
    let detectedNeighborhood = detectNeighborhood ? undefined : neighborhood;
    if (!detectedNeighborhood) {
      detectedNeighborhood =
        (await reverseGeocode(lat, lng, googleApiKey)) || neighborhood || undefined;
    }

    const result: GeocodeResult = {
      success: true,
      coordinates: { latitude: lat, longitude: lng },
      originalQuery: crossStreets,
      normalizedQuery: resolvedQuery,
      neighborhood: detectedNeighborhood,
      fallbackUsed: fallback !== 'none' ? fallback : undefined,
      corrections: corrections.length > 0 ? corrections : undefined,
    };

    console.log(`Geocoding success: ${JSON.stringify(result)}`);

    if (cacheClient) {
      await writeCache(cacheClient, cacheKey, crossStreets, neighborhood, result);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error in geocode-cross-streets:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to geocode location. Please try again.', originalQuery: '' } as GeocodeResult),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
