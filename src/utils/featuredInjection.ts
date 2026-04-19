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
