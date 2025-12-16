import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../config/supabase";

export interface PolygonGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface LocationResult {
  id: string;
  name: string;
  type: 'zip' | 'neighborhood' | 'borough';
  aliases: string[];
  zipCodes: string[];
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null;
  center: {
    lat: number;
    lng: number;
  };
  matchScore: number;
  polygon?: PolygonGeometry | null;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  const aLen = a.length;
  const bLen = b.length;

  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  for (let i = 0; i <= aLen; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bLen; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[aLen][bLen];
}

function calculateFuzzyScore(query: string, target: string): number {
  const queryLower = query.toLowerCase().trim();
  const targetLower = target.toLowerCase().trim();

  if (queryLower === targetLower) return 100;
  if (targetLower.startsWith(queryLower)) return 95;
  if (targetLower.includes(queryLower)) return 85;

  const distance = levenshteinDistance(queryLower, targetLower);
  const maxLen = Math.max(queryLower.length, targetLower.length);

  const allowedDistance = queryLower.length <= 4 ? 1 : queryLower.length <= 7 ? 2 : 3;

  if (distance <= allowedDistance) {
    return Math.max(60, 80 - (distance * 10));
  }

  return 0;
}

export async function searchLocations(query: string): Promise<LocationResult[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const searchTerm = query.trim();

  try {
    const { data, error } = await supabase.rpc('search_locations', {
      search_query: searchTerm
    });

    if (error) {
      console.error('Error searching locations:', error);
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('location_search_index')
        .select('*')
        .or(`name.ilike.%${searchTerm}%,aliases.cs.{${searchTerm}}`)
        .limit(10);

      if (fallbackError) {
        console.error('Fallback search also failed:', fallbackError);
        return [];
      }

      return (fallbackData || []).map(row => ({
        id: row.id,
        name: row.name,
        type: row.type as LocationResult['type'],
        aliases: row.aliases || [],
        zipCodes: row.zip_codes || [],
        bounds: row.bounds_north ? {
          north: row.bounds_north,
          south: row.bounds_south,
          east: row.bounds_east,
          west: row.bounds_west,
        } : null,
        center: {
          lat: row.center_lat,
          lng: row.center_lng,
        },
        matchScore: calculateFuzzyScore(searchTerm, row.name),
      }));
    }

    const results: LocationResult[] = (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      type: row.type as LocationResult['type'],
      aliases: row.aliases || [],
      zipCodes: row.zip_codes || [],
      bounds: row.bounds_north ? {
        north: row.bounds_north,
        south: row.bounds_south,
        east: row.bounds_east,
        west: row.bounds_west,
      } : null,
      center: {
        lat: row.center_lat,
        lng: row.center_lng,
      },
      matchScore: row.match_score || calculateFuzzyScore(searchTerm, row.name),
    }));

    return results
      .filter(r => r.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore);

  } catch (err) {
    console.error('Search locations error:', err);
    return [];
  }
}

export async function getLocationByName(name: string): Promise<LocationResult | null> {
  try {
    const { data, error } = await supabase
      .from('location_search_index')
      .select('*')
      .ilike('name', name)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      type: data.type as LocationResult['type'],
      aliases: data.aliases || [],
      zipCodes: data.zip_codes || [],
      bounds: data.bounds_north ? {
        north: data.bounds_north,
        south: data.bounds_south,
        east: data.bounds_east,
        west: data.bounds_west,
      } : null,
      center: {
        lat: data.center_lat,
        lng: data.center_lng,
      },
      matchScore: 100,
    };
  } catch (err) {
    console.error('Get location by name error:', err);
    return null;
  }
}

export async function getLocationByZipCode(zipCode: string): Promise<LocationResult | null> {
  try {
    const { data, error } = await supabase
      .from('location_search_index')
      .select('*')
      .eq('name', zipCode)
      .eq('type', 'zip')
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      const { data: neighborhoodData, error: neighborhoodError } = await supabase
        .from('location_search_index')
        .select('*')
        .contains('zip_codes', [zipCode])
        .limit(1)
        .maybeSingle();

      if (neighborhoodError || !neighborhoodData) {
        return null;
      }

      return {
        id: neighborhoodData.id,
        name: neighborhoodData.name,
        type: neighborhoodData.type as LocationResult['type'],
        aliases: neighborhoodData.aliases || [],
        zipCodes: neighborhoodData.zip_codes || [],
        bounds: neighborhoodData.bounds_north ? {
          north: neighborhoodData.bounds_north,
          south: neighborhoodData.bounds_south,
          east: neighborhoodData.bounds_east,
          west: neighborhoodData.bounds_west,
        } : null,
        center: {
          lat: neighborhoodData.center_lat,
          lng: neighborhoodData.center_lng,
        },
        matchScore: 100,
      };
    }

    return {
      id: data.id,
      name: data.name,
      type: data.type as LocationResult['type'],
      aliases: data.aliases || [],
      zipCodes: data.zip_codes || [],
      bounds: data.bounds_north ? {
        north: data.bounds_north,
        south: data.bounds_south,
        east: data.bounds_east,
        west: data.bounds_west,
      } : null,
      center: {
        lat: data.center_lat,
        lng: data.center_lng,
      },
      matchScore: 100,
    };
  } catch (err) {
    console.error('Get location by zip code error:', err);
    return null;
  }
}

export async function fetchZipCodePolygon(zipCode: string): Promise<PolygonGeometry | null> {
  if (!zipCode || !/^\d{5}$/.test(zipCode)) {
    return null;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/get-zipcode-polygon?zip=${zipCode}`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch zip code polygon:', response.status);
      return null;
    }

    const data = await response.json();

    if (data.polygon) {
      return data.polygon as PolygonGeometry;
    }

    return null;
  } catch (err) {
    console.error('Error fetching zip code polygon:', err);
    return null;
  }
}

export async function getLocationWithPolygon(location: LocationResult): Promise<LocationResult> {
  if (location.type !== 'zip') {
    return location;
  }

  const polygon = await fetchZipCodePolygon(location.name);
  return {
    ...location,
    polygon,
  };
}
