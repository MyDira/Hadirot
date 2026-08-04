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
  /** Street address, used instead of cross streets by ~12% of live listings
   *  (mostly sales). Those rows have NULL cross streets, so without this they
   *  could never match on location at all. */
  full_address: string | null;
  property_type: PropertyType | null;
  price: number | null;
  asking_price: number | null;
  call_for_price: boolean | null;
  /** Display name of the account this listing sits under. */
  account_name: string | null;
}

export type MatchStrength = 'strong' | 'partial';

/** How the location requirement was satisfied. */
export type MatchLocation = 'both_streets' | 'one_street' | 'address';

export interface MatchCandidate extends LiveListingCandidate {
  strength: MatchStrength;
  matchedVia: MatchLocation;
  /** Always all true — a candidate only exists when phone, bedrooms and
   *  location all matched. Kept so the compare view can tick each row. */
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

/** Short human summary of how this candidate matched — every candidate matched
 *  phone and bedrooms by definition, so the useful detail is the location. */
export function describeMatch(candidate: MatchCandidate): string {
  const location =
    candidate.matchedVia === 'address'
      ? 'address'
      : candidate.matchedVia === 'both_streets'
        ? 'both cross streets'
        : 'one cross street';
  return `same phone, bedrooms & ${location}`;
}

/**
 * Decides whether a live listing is a possible duplicate of an intake draft.
 *
 * ALL THREE must match or the listing is not shown at all:
 *   1. contact phone
 *   2. bedroom count
 *   3. location — at least one cross street, OR the street address
 *
 * The previous rule surfaced anything with a phone hit, or with streets+beds
 * and no phone, which meant an agent's whole portfolio showed up against every
 * lead they placed. Requiring all three trades recall for precision on purpose:
 * a missed duplicate costs a second look, a false one costs trust in the flag.
 *
 * Advisory only — never blocks publishing. Only compares within the same
 * rental/sale kind.
 */
export function scoreMatch(
  scraped: ScrapedListing,
  live: LiveListingCandidate,
): MatchCandidate | null {
  if (live.listing_type !== scraped.listing_kind) return null;

  // 1. Phone — required.
  const scrapedPhone = normalizePhone(scraped.contact_phone || scraped.contact_phone_display);
  const livePhone = normalizePhone(live.contact_phone);
  if (!scrapedPhone || !livePhone || scrapedPhone !== livePhone) return null;

  // 2. Bedrooms — required. A missing count on either side can't corroborate,
  //    so it fails rather than passing silently.
  if (scraped.bedrooms == null || live.bedrooms == null) return null;
  if (scraped.bedrooms !== live.bedrooms) return null;

  // 3. Location — required, satisfied by cross streets or by the address.
  const scrapedStreets = streetTokens(scraped.cross_street_1, scraped.cross_street_2);
  const liveStreets = streetTokens(live.cross_street_a, live.cross_street_b);
  const sharedStreets = scrapedStreets.filter((s) => liveStreets.includes(s));

  // Address-based listings carry no cross streets, so compare the intake's
  // street tokens against the normalized address text. Containment is loose
  // ("east17" also sits inside "east175"), which is acceptable only because
  // phone and bedrooms have already had to match.
  const liveAddress = normalizeStreet(live.full_address);
  const addressHit =
    sharedStreets.length === 0 &&
    liveAddress.length > 0 &&
    scrapedStreets.some((s) => s.length >= 4 && liveAddress.includes(s));

  if (sharedStreets.length === 0 && !addressHit) return null;

  const matchedVia: MatchLocation =
    sharedStreets.length >= 2 ? 'both_streets' : addressHit ? 'address' : 'one_street';

  return {
    ...live,
    // Both cross streets (or a full address hit) is as close to certain as
    // this gets; a single shared street still qualifies but stays amber.
    strength: matchedVia === 'one_street' ? 'partial' : 'strong',
    matchedVia,
    matched: { phone: true, bedrooms: true, streets: true },
  };
}
