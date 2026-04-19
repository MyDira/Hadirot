import { supabase } from "../config/supabase";

interface ReverseGeocodeResult {
  zipCode: string | null;
  neighborhood: string | null;
  city: string | null;
  borough: string | null;
}

interface MapboxFeature {
  id: string;
  text: string;
  place_name: string;
  place_type: string[];
  context?: Array<{
    id: string;
    text: string;
    short_code?: string;
  }>;
}

interface MapboxResponse {
  features: MapboxFeature[];
}

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult> {
  const result: ReverseGeocodeResult = {
    zipCode: null,
    neighborhood: null,
    city: null,
    borough: null,
  };

  if (!MAPBOX_ACCESS_TOKEN) {
    console.error("Mapbox access token not configured");
    return result;
  }

  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?` +
        `types=postcode,neighborhood,locality,place&` +
        `access_token=${MAPBOX_ACCESS_TOKEN}`
    );

    if (!response.ok) {
      console.error("Reverse geocoding failed:", response.status);
      return result;
    }

    const data: MapboxResponse = await response.json();

    for (const feature of data.features) {
      const placeType = feature.place_type[0];

      if (placeType === "postcode" && !result.zipCode) {
        result.zipCode = feature.text;
      }

      if (placeType === "neighborhood" && !result.neighborhood) {
        result.neighborhood = feature.text;
      }

      if (placeType === "locality" && !result.borough) {
        result.borough = feature.text;
      }

      if (placeType === "place" && !result.city) {
        result.city = feature.text;
      }

      if (feature.context) {
        for (const ctx of feature.context) {
          if (ctx.id.startsWith("postcode") && !result.zipCode) {
            result.zipCode = ctx.text;
          }
          if (ctx.id.startsWith("neighborhood") && !result.neighborhood) {
            result.neighborhood = ctx.text;
          }
          if (ctx.id.startsWith("locality") && !result.borough) {
            result.borough = ctx.text;
          }
          if (ctx.id.startsWith("place") && !result.city) {
            result.city = ctx.text;
          }
        }
      }
    }

    if (!result.neighborhood && result.borough) {
      const locationResult = await lookupNeighborhoodFromDatabase(lat, lng);
      if (locationResult) {
        result.neighborhood = locationResult;
      }
    }

    return result;
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return result;
  }
}

// Small in-memory cache keyed by rounded coordinates. Reverse geocoding is
// called repeatedly for nearby points (map pins, listing detail loads). 3
// decimal places ≈ 110m precision — fine for neighborhood resolution.
const NEIGHBORHOOD_CACHE_MAX = 500;
const neighborhoodCache = new Map<string, string | null>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)}|${lng.toFixed(3)}`;
}

async function lookupNeighborhoodFromDatabase(
  lat: number,
  lng: number
): Promise<string | null> {
  const key = cacheKey(lat, lng);
  if (neighborhoodCache.has(key)) {
    return neighborhoodCache.get(key) ?? null;
  }

  try {
    // Filter in SQL instead of pulling all neighborhoods to the client. At
    // ~145 rows this mostly saves payload bytes today; scales with the table.
    const { data, error } = await supabase
      .from("location_search_index")
      .select("name")
      .eq("type", "neighborhood")
      .lte("bounds_south", lat)
      .gte("bounds_north", lat)
      .lte("bounds_west", lng)
      .gte("bounds_east", lng)
      .limit(1)
      .maybeSingle();

    const result = error || !data ? null : data.name ?? null;

    // LRU-ish eviction: when cache is full, drop the oldest entry (Map
    // preserves insertion order).
    if (neighborhoodCache.size >= NEIGHBORHOOD_CACHE_MAX) {
      const oldest = neighborhoodCache.keys().next().value;
      if (oldest !== undefined) neighborhoodCache.delete(oldest);
    }
    neighborhoodCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

export async function updateListingLocationFields(
  listingId: string,
  lat: number,
  lng: number
): Promise<void> {
  const geoResult = await reverseGeocode(lat, lng);

  const updates: Record<string, string | null> = {};

  if (geoResult.zipCode) {
    updates.zip_code = geoResult.zipCode;
  }
  if (geoResult.neighborhood) {
    updates.neighborhood = geoResult.neighborhood;
  }
  if (geoResult.city) {
    updates.city = geoResult.city;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("listings")
      .update(updates)
      .eq("id", listingId);

    if (error) {
      console.error("Failed to update listing location fields:", error);
    }
  }
}
