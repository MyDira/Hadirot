import { supabase } from '../config/supabase';

export interface GeocodeResult {
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

export interface GeocodeRequest {
  crossStreets: string;
  neighborhood?: string;
  /**
   * Treat `crossStreets` as an exact street address ("1438 53rd Street")
   * instead of an intersection — no intersection validation is applied.
   */
  asAddress?: boolean;
  /**
   * Re-derive the neighborhood from the resolved pin even when one is passed
   * in. Use when the supplied neighborhood is only a guess.
   */
  detectNeighborhood?: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function geocodeCrossStreets(request: GeocodeRequest): Promise<GeocodeResult> {
  const { crossStreets, neighborhood, asAddress, detectNeighborhood } = request;

  if (!crossStreets || crossStreets.trim().length < 2) {
    return {
      success: false,
      error: 'Please enter cross streets',
      originalQuery: crossStreets || '',
    };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/geocode-cross-streets`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...(asAddress
            ? { address: crossStreets.trim() }
            : { crossStreets: crossStreets.trim() }),
          neighborhood: neighborhood?.trim(),
          detectNeighborhood: detectNeighborhood || undefined,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Geocoding API error:', response.status, errorText);
      return {
        success: false,
        error: 'Failed to find location. Please try again.',
        originalQuery: crossStreets,
      };
    }

    const result: GeocodeResult = await response.json();
    return result;
  } catch (error) {
    console.error('Geocoding service error:', error);
    return {
      success: false,
      error: 'Network error. Please check your connection and try again.',
      originalQuery: crossStreets,
    };
  }
}

export function formatCorrectionMessage(result: GeocodeResult): string | null {
  if (!result.corrections || result.corrections.length === 0) {
    return null;
  }

  if (result.corrections.length === 1) {
    return `Auto-corrected: ${result.corrections[0]}`;
  }

  return `Auto-corrected: ${result.corrections.join(', ')}`;
}
