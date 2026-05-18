import { supabase } from "../config/supabase";
import { GOOGLE_MAPS_API_KEY } from "@/config/env";

interface ReverseGeocodeResult {
  zipCode: string | null;
  neighborhood: string | null;
  city: string | null;
  borough: string | null;
}

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResult {
  address_components: GoogleAddressComponent[];
}

interface GoogleGeocodeResponse {
  status: string;
  results: GoogleGeocodeResult[];
}

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

  if (!GOOGLE_MAPS_API_KEY) {
    console.error("Google Maps API key not configured");
    return result;
  }

  try {
    const params = new URLSearchParams({
      latlng: `${lat},${lng}`,
      key: GOOGLE_MAPS_API_KEY,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params}`
    );

    if (!response.ok) {
      console.error("Reverse geocoding failed:", response.status);
      return result;
    }

    const data: GoogleGeocodeResponse = await response.json();

    if (data.status !== "OK" || !data.results?.length) {
      return result;
    }

    // Walk all results and pick the best component for each field
    for (const geocodeResult of data.results) {
      for (const component of geocodeResult.address_components) {
        const types = component.types;

        if (!result.zipCode && types.includes("postal_code")) {
          result.zipCode = component.long_name;
        }

        if (!result.neighborhood && types.includes("neighborhood")) {
          result.neighborhood = component.long_name;
        }

        // sublocality_level_1 is often the neighborhood in NYC (e.g. "Midwood")
        if (!result.neighborhood && types.includes("sublocality_level_1")) {
          result.neighborhood = component.long_name;
        }

        // sublocality covers borough-level (Brooklyn, Queens, etc.)
        if (!result.borough && types.includes("sublocality")) {
          result.borough = component.long_name;
        }

        if (!result.city && types.includes("locality")) {
          result.city = component.long_name;
        }
      }

      // Stop as soon as we have all four fields
      if (result.zipCode && result.neighborhood && result.borough && result.city) break;
    }

    // If Google didn't return a neighborhood, fall back to our spatial DB lookup
    if (!result.neighborhood) {
      const dbNeighborhood = await lookupNeighborhoodFromDatabase(lat, lng);
      if (dbNeighborhood) result.neighborhood = dbNeighborhood;
    }

    return result;
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return result;
  }
}

// ── Neighborhood DB cache ─────────────────────────────────────────────────────
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

    const dbResult = error || !data ? null : data.name ?? null;

    if (neighborhoodCache.size >= NEIGHBORHOOD_CACHE_MAX) {
      const oldest = neighborhoodCache.keys().next().value;
      if (oldest !== undefined) neighborhoodCache.delete(oldest);
    }
    neighborhoodCache.set(key, dbResult);
    return dbResult;
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

  if (geoResult.zipCode) updates.zip_code = geoResult.zipCode;
  if (geoResult.neighborhood) updates.neighborhood = geoResult.neighborhood;
  if (geoResult.city) updates.city = geoResult.city;

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
