import type { ScrapedListing, PropertyType } from '@/config/supabase';

/** Minimal shape of a live `listings` row needed to score + display a match. */
export interface LiveListingCandidate {
  id: string;
  listing_type: 'rental' | 'sale';
  bedrooms: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  cross_street_a: string | null;
  cross_street_b: string | null;
  property_type: PropertyType | null;
  price: number | null;
  asking_price: number | null;
  call_for_price: boolean | null;
  /** Display name of the account this listing sits under. */
  account_name: string | null;
}

export type MatchStrength = 'strong' | 'partial';

export interface MatchCandidate extends LiveListingCandidate {
  strength: MatchStrength;
  /** Which of the three signals fully matched — drives the compare view. */
  matched: { phone: boolean; bedrooms: boolean; streets: boolean };
}

/**
 * Digits only, dropping a leading US country code so "1-718-555-1234" and
 * "718-555-1234" compare equal. Returns null for anything that isn't a
 * recognizable 10-digit US number, so malformed numbers never match.
 */
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

function streetTokens(a: string | null | undefined, b: string | null | undefined): string[] {
  return [normalizeStreet(a), normalizeStreet(b)].filter(Boolean);
}

/** Short human summary of which signals matched, e.g. "same phone + streets". */
export function describeMatch(candidate: MatchCandidate): string {
  const parts = [
    candidate.matched.phone ? 'phone' : null,
    candidate.matched.bedrooms ? 'bedrooms' : null,
    candidate.matched.streets ? 'streets' : null,
  ].filter(Boolean);
  return parts.length > 0 ? `same ${parts.join(' + ')}` : 'partial match';
}

/**
 * Scores a scraped intake draft against one live listing on three signals:
 * phone, bedroom count, and cross streets. Streets count as matching when at
 * least ONE of the two sides matches — parsers frequently get one cross street
 * right and the other vague, so requiring both misses real duplicates.
 *
 * Advisory only — never blocks publishing, just flags a likely duplicate for
 * the admin to eyeball. Only compares within the same rental/sale kind.
 */
export function scoreMatch(
  scraped: ScrapedListing,
  live: LiveListingCandidate,
): MatchCandidate | null {
  if (live.listing_type !== scraped.listing_kind) return null;

  const scrapedPhone = normalizePhone(scraped.contact_phone || scraped.contact_phone_display);
  const livePhone = normalizePhone(live.contact_phone);
  const phone = !!scrapedPhone && !!livePhone && scrapedPhone === livePhone;

  const scrapedStreets = streetTokens(scraped.cross_street_1, scraped.cross_street_2);
  const liveStreets = streetTokens(live.cross_street_a, live.cross_street_b);
  const shared = scrapedStreets.filter((s) => liveStreets.includes(s));
  const streets = shared.length > 0;

  const bedrooms =
    scraped.bedrooms != null && live.bedrooms != null && scraped.bedrooms === live.bedrooms;

  const matched = { phone, bedrooms, streets };

  // A phone hit alongside either corroborating signal is as close to certain
  // as this gets; streets + beds without a phone is a strong hint, not proof.
  if (phone && (bedrooms || streets)) return { ...live, strength: 'strong', matched };
  if (phone) return { ...live, strength: 'partial', matched };
  if (streets && bedrooms) return { ...live, strength: 'partial', matched };

  return null;
}
