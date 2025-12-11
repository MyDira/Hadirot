import {
  parseCrossStreets,
  generateQueryVariations,
  fuzzyMatchStreet,
} from './normalizer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const NYC_BOUNDING_BOX = '-74.2591,40.4774,-73.7002,40.9176';
const BROOKLYN_CENTER = [-73.9442, 40.6782];

interface GeocodeRequest {
  crossStreets: string;
  neighborhood?: string;
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

interface MapboxFeature {
  center: [number, number];
  place_name: string;
  relevance: number;
  place_type: string[];
  context?: Array<{
    id: string;
    text: string;
  }>;
}

interface MapboxResponse {
  features: MapboxFeature[];
}

async function geocodeWithMapbox(
  query: string,
  mapboxToken: string
): Promise<MapboxFeature | null> {
  const encodedQuery = encodeURIComponent(query);

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?` +
    `access_token=${mapboxToken}` +
    `&bbox=${NYC_BOUNDING_BOX}` +
    `&proximity=${BROOKLYN_CENTER.join(',')}` +
    `&types=address,poi` +
    `&limit=1` +
    `&country=US`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Mapbox API error: ${response.status}`);
      return null;
    }

    const data: MapboxResponse = await response.json();

    if (data.features && data.features.length > 0) {
      const feature = data.features[0];

      if (feature.relevance < 0.5) {
        console.log(`Low relevance score (${feature.relevance}) for query: ${query}`);
        return null;
      }

      return feature;
    }

    return null;
  } catch (error) {
    console.error('Mapbox geocoding error:', error);
    return null;
  }
}

async function reverseGeocode(
  lat: number,
  lng: number,
  mapboxToken: string
): Promise<string | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?` +
    `access_token=${mapboxToken}` +
    `&types=neighborhood,locality,place`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data: MapboxResponse = await response.json();

    if (data.features && data.features.length > 0) {
      const neighborhoodFeature = data.features.find(
        f => f.place_type.includes('neighborhood') || f.place_type.includes('locality')
      );

      if (neighborhoodFeature) {
        return neighborhoodFeature.place_name?.split(',')[0] || null;
      }
    }

    return null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

async function tryGeocodingWithFallbacks(
  parsed: ReturnType<typeof parseCrossStreets>,
  neighborhood: string | undefined,
  mapboxToken: string
): Promise<{ feature: MapboxFeature | null; query: string; fallback: string }> {
  const variations = generateQueryVariations(parsed);
  const locationSuffixes = neighborhood
    ? [`${neighborhood}, Brooklyn, NY`, 'Brooklyn, NY', 'New York, NY']
    : ['Brooklyn, NY', 'New York, NY'];

  for (const variation of variations) {
    for (const suffix of locationSuffixes) {
      const query = `${variation}, ${suffix}`;
      console.log(`Trying geocode query: ${query}`);

      const feature = await geocodeWithMapbox(query, mapboxToken);
      if (feature) {
        return {
          feature,
          query: variation,
          fallback: variation === variations[0] ? 'none' : `variation: ${variation}`,
        };
      }
    }
  }

  if (parsed.street1 && parsed.street1.type !== 'unknown') {
    const fuzzyMatch1 = fuzzyMatchStreet(parsed.street1.original);
    if (fuzzyMatch1 && fuzzyMatch1 !== parsed.street1.normalized) {
      console.log(`Fuzzy match for street1: ${parsed.street1.original} -> ${fuzzyMatch1}`);

      for (const suffix of locationSuffixes) {
        let query: string;
        if (parsed.street2) {
          query = `${fuzzyMatch1} & ${parsed.street2.normalized}, ${suffix}`;
        } else {
          query = `${fuzzyMatch1}, ${suffix}`;
        }

        const feature = await geocodeWithMapbox(query, mapboxToken);
        if (feature) {
          return {
            feature,
            query: query.split(',')[0],
            fallback: `fuzzy match: ${fuzzyMatch1}`,
          };
        }
      }
    }
  }

  if (parsed.street2 && parsed.street2.type !== 'unknown') {
    const fuzzyMatch2 = fuzzyMatchStreet(parsed.street2.original);
    if (fuzzyMatch2 && fuzzyMatch2 !== parsed.street2.normalized) {
      console.log(`Fuzzy match for street2: ${parsed.street2.original} -> ${fuzzyMatch2}`);

      for (const suffix of locationSuffixes) {
        const query = `${parsed.street1.normalized} & ${fuzzyMatch2}, ${suffix}`;

        const feature = await geocodeWithMapbox(query, mapboxToken);
        if (feature) {
          return {
            feature,
            query: query.split(',')[0],
            fallback: `fuzzy match: ${fuzzyMatch2}`,
          };
        }
      }
    }
  }

  for (const suffix of ['Brooklyn, NY', 'New York, NY']) {
    const query = `${parsed.street1.normalized}, ${suffix}`;
    console.log(`Trying single street fallback: ${query}`);

    const feature = await geocodeWithMapbox(query, mapboxToken);
    if (feature) {
      return {
        feature,
        query: parsed.street1.normalized,
        fallback: 'single street only',
      };
    }
  }

  return { feature: null, query: '', fallback: 'all attempts failed' };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const mapboxToken = Deno.env.get('MAPBOX_ACCESS_TOKEN');
    if (!mapboxToken) {
      console.error('MAPBOX_ACCESS_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'Geocoding service not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const body: GeocodeRequest = await req.json();
    const { crossStreets, neighborhood } = body;

    if (!crossStreets || typeof crossStreets !== 'string' || crossStreets.trim().length < 2) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid cross streets input',
          originalQuery: crossStreets || '',
        } as GeocodeResult),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Geocoding request: "${crossStreets}" (neighborhood: ${neighborhood || 'not specified'})`);

    const parsed = parseCrossStreets(crossStreets);
    console.log('Parsed cross streets:', JSON.stringify(parsed));

    const corrections: string[] = [];
    if (parsed.street1.original !== parsed.street1.normalized) {
      corrections.push(`"${parsed.street1.original}" -> "${parsed.street1.normalized}"`);
    }
    if (parsed.street2 && parsed.street2.original !== parsed.street2.normalized) {
      corrections.push(`"${parsed.street2.original}" -> "${parsed.street2.normalized}"`);
    }

    const { feature, query, fallback } = await tryGeocodingWithFallbacks(
      parsed,
      neighborhood,
      mapboxToken
    );

    if (!feature) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Location not found. Try a different format (e.g., "Avenue J & East 15th Street")',
          originalQuery: crossStreets,
          normalizedQuery: parsed.formattedQuery,
          corrections: corrections.length > 0 ? corrections : undefined,
        } as GeocodeResult),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const [lng, lat] = feature.center;

    let detectedNeighborhood = neighborhood;
    if (!detectedNeighborhood) {
      detectedNeighborhood = await reverseGeocode(lat, lng, mapboxToken) || undefined;
    }

    const result: GeocodeResult = {
      success: true,
      coordinates: {
        latitude: lat,
        longitude: lng,
      },
      originalQuery: crossStreets,
      normalizedQuery: query,
      neighborhood: detectedNeighborhood,
      fallbackUsed: fallback !== 'none' ? fallback : undefined,
      corrections: corrections.length > 0 ? corrections : undefined,
    };

    console.log(`Geocoding success: ${JSON.stringify(result)}`);

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Unexpected error in geocode-cross-streets:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to geocode location. Please try again.',
        originalQuery: '',
      } as GeocodeResult),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
