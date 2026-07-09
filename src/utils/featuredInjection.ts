import { Listing } from '../config/supabase';
import { getSessionSeed, seededShuffle } from './sessionSeed';

export type InjectedListing = Listing & { showFeaturedBadge: boolean; key: string };

export function computeInjectionPositions(): number[] {
  const hourSeed = Math.floor(Date.now() / (1000 * 60 * 60));
  const zoneB = [6, 7, 8];
  const zoneC = [11, 12, 13];
  return [
    0,
    1,
    zoneB[hourSeed % zoneB.length],
    zoneC[(hourSeed + 1) % zoneC.length],
  ];
}

export function selectFeaturedForPage(
  allFeatured: Listing[],
  currentPage: number,
  slotsPerPage: number,
  serviceFilters: unknown,
): Listing[] {
  if (allFeatured.length === 0) return [];

  const sessionSeed = getSessionSeed();
  const filterHash = JSON.stringify(serviceFilters).split('').reduce(
    (hash, char) => ((hash << 5) - hash) + char.charCodeAt(0),
    0,
  );
  const combinedSeed = sessionSeed ^ filterHash;
  const shuffled = seededShuffle(allFeatured, combinedSeed);

  const startIndex = (currentPage - 1) * slotsPerPage;
  let featuredForThisPage: Listing[] = [];

  for (let i = 0; i < slotsPerPage; i++) {
    const index = startIndex + i;
    if (index < shuffled.length) {
      featuredForThisPage.push(shuffled[index]);
    } else {
      featuredForThisPage.push(shuffled[index % shuffled.length]);
    }
  }

  return [...new Map(featuredForThisPage.map(f => [f.id, f])).values()];
}

/**
 * Compute the standard-stream window for a given page, accounting for the
 * featured listings woven onto every prior page.
 *
 * Featured injection consumes `itemsPerPage - featuredForThisPage.length`
 * standard items per page. The old code advanced the standard cursor by a full
 * `itemsPerPage` each page while only consuming `numStandardNeeded`, so
 * `featuredCount` standard listings fell into an unreachable gap at every page
 * boundary (bughunt P1). Here we sum the *actual* per-page standard consumption
 * for pages `1..currentPage-1` to get a gap-free, overlap-free cursor.
 *
 * `selectFeaturedForPage` is a pure, deterministic function of the featured
 * pool + page + filters, so the per-page featured counts can be recomputed
 * cheaply without needing the standard data for prior pages. This also lets the
 * caller fetch only `standardOffset + numStandardNeeded` standard rows from the
 * server instead of the entire matching set.
 */
export function computeStandardWindow(
  featuredPool: Listing[],
  currentPage: number,
  slotsPerPage: number,
  itemsPerPage: number,
  serviceFilters: unknown,
): { featuredForThisPage: Listing[]; standardOffset: number; numStandardNeeded: number } {
  let standardOffset = 0;
  for (let p = 1; p < currentPage; p++) {
    const featuredForPrior = selectFeaturedForPage(featuredPool, p, slotsPerPage, serviceFilters);
    standardOffset += Math.max(0, itemsPerPage - featuredForPrior.length);
  }
  const featuredForThisPage = selectFeaturedForPage(featuredPool, currentPage, slotsPerPage, serviceFilters);
  const numStandardNeeded = Math.max(0, itemsPerPage - featuredForThisPage.length);
  return { featuredForThisPage, standardOffset, numStandardNeeded };
}

export function weaveFeaturedIntoListings(
  featured: Listing[],
  standard: Listing[],
  injectionPositions: number[],
  itemsPerPage: number,
): InjectedListing[] {
  const featuredPositionMap = new Map<string, number[]>();
  let fIdx = 0;
  for (let pos = 0; pos < itemsPerPage && fIdx < featured.length; pos++) {
    if (injectionPositions.includes(pos) && fIdx < featured.length) {
      const fId = featured[fIdx].id;
      if (!featuredPositionMap.has(fId)) featuredPositionMap.set(fId, []);
      featuredPositionMap.get(fId)!.push(pos);
      fIdx++;
    }
  }

  const result: InjectedListing[] = [];
  let featuredIndex = 0;
  let standardCursor = 0;

  for (let position = 0; position < itemsPerPage; position++) {
    const isInjectionSlot = injectionPositions.includes(position) && featuredIndex < featured.length;

    if (isInjectionSlot) {
      result.push({
        ...featured[featuredIndex],
        showFeaturedBadge: true,
        key: `sponsored-${featured[featuredIndex].id}`,
      });
      featuredIndex++;
      continue;
    }

    if (standardCursor >= standard.length) break;

    const stdListing = standard[standardCursor];
    const sponsoredPositions = featuredPositionMap.get(stdListing.id);

    if (sponsoredPositions && sponsoredPositions.some(sp => Math.abs(sp - position) <= 2)) {
      standardCursor++;
      if (standardCursor < standard.length) {
        const nextStd = standard[standardCursor];
        const nextKey = featuredPositionMap.has(nextStd.id) ? `${nextStd.id}-natural` : nextStd.id;
        result.push({ ...nextStd, showFeaturedBadge: false, key: nextKey });
        standardCursor++;
      }
    } else {
      const key = featuredPositionMap.has(stdListing.id) ? `${stdListing.id}-natural` : stdListing.id;
      result.push({ ...stdListing, showFeaturedBadge: false, key });
      standardCursor++;
    }
  }

  return result;
}
