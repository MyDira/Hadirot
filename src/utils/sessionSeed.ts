/**
 * Session-seeded random shuffle utilities for featured listings rotation.
 *
 * These utilities ensure every featured listing gets equal probability of appearing
 * in premium positions (0 and 1), while maintaining consistent ordering within a
 * user's browsing session.
 */

/**
 * Returns a stable random seed for the current browsing session.
 * Generated once per session, stored in sessionStorage.
 * Used to shuffle featured listings so every agent gets equal exposure.
 *
 * @returns A random integer seed (0 to 2^31-1)
 */
export function getSessionSeed(): number {
  const STORAGE_KEY = 'hadirot_featured_seed';
  const stored = sessionStorage.getItem(STORAGE_KEY);

  if (stored) {
    return parseInt(stored, 10);
  }

  const seed = Math.floor(Math.random() * 2147483647);
  sessionStorage.setItem(STORAGE_KEY, seed.toString());
  return seed;
}

/**
 * Deterministic shuffle using a seeded PRNG (Mulberry32).
 * Same seed + same array = same shuffle order.
 * Different seed = different order.
 *
 * This gives every featured listing equal probability of appearing in any position,
 * preventing systematic bias toward listings that were featured earliest.
 *
 * @param array The array to shuffle
 * @param seed The random seed for deterministic shuffling
 * @returns A new shuffled array (does not mutate original)
 */
export function seededShuffle<T>(array: T[], seed: number): T[] {
  const shuffled = [...array];

  // Mulberry32 PRNG - fast, good distribution
  let s = seed;
  const random = () => {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Fisher-Yates shuffle with seeded random
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}
