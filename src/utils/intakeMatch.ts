import type { ScrapedListing } from '@/config/supabase';

/** Minimal shape of a live `listings` row needed to score a match. */
export interface LiveListingCandidate {
  id: string;
  title: string | null;
  listing_type: 'rental' | 'sale';
  bedrooms: number | null;
  contact_phone: string | null;
  cross_street_a: string | null;
  cross_street_b: string | null;
  neighborhood: string | null;
  price: number | null;
  asking_price: number | null;
  created_at: string;
}

export type MatchStrength = 'strong' | 'partial';

export interface MatchCandidate extends LiveListingCandidate {
  strength: MatchStrength;
  reason: string;
}

/** Digits-only, last-10 (drops a leading country code). Same shape either side needs to match. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

// Mirrors supabase/functions/_shared/intake.ts normalizeStreet — keep both in
// sync if either changes, so a live listing and a scraped draft of the same
// real-world apartment normalize to the same street token.
export function normalizeStreet(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\b(street|st|avenue|ave|road|rd|parkway|pkwy|boulevard|blvd|drive|dr)\b/g, '')
    .replace(/\b(th|st|nd|rd)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function streetSet(a: string | null | undefined, b: string | null | undefined): string {
  return [normalizeStreet(a), normalizeStreet(b)].filter(Boolean).sort().join('|');
}

/**
 * Scores a scraped intake draft against one live listing. Advisory only —
 * never blocks publishing, just flags a likely duplicate for the admin to
 * eyeball. Only compares within the same rental/sale kind.
 */
export function scoreMatch(
  scraped: ScrapedListing,
  live: LiveListingCandidate,
): MatchCandidate | null {
  if (live.listing_type !== scraped.listing_kind) return null;

  const scrapedPhone = normalizePhone(scraped.contact_phone || scraped.contact_phone_display);
  const livePhone = normalizePhone(live.contact_phone);
  const phoneMatch = !!scrapedPhone && !!livePhone && scrapedPhone === livePhone;

  const scrapedStreets = streetSet(scraped.cross_street_1, scraped.cross_street_2);
  const liveStreets = streetSet(live.cross_street_a, live.cross_street_b);
  const streetsMatch = !!scrapedStreets && scrapedStreets === liveStreets;

  const bedsMatch =
    scraped.bedrooms != null && live.bedrooms != null && scraped.bedrooms === live.bedrooms;

  if (phoneMatch && (bedsMatch || streetsMatch)) {
    const parts = ['Same phone'];
    if (bedsMatch) parts.push(`${live.bedrooms}BR`);
    if (streetsMatch) parts.push('same cross streets');
    return { ...live, strength: 'strong', reason: parts.join(' + ') };
  }

  if (phoneMatch) {
    return { ...live, strength: 'partial', reason: 'Same phone number' };
  }

  if (streetsMatch && bedsMatch) {
    return { ...live, strength: 'partial', reason: `Same cross streets + ${live.bedrooms}BR` };
  }

  return null;
}
