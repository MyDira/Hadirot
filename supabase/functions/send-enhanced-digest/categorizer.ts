// Categorize listings by bedroom count or other criteria
import type { Listing, CategoryGroup, CategoryLimits } from "./types.ts";

export function categorizeByBedrooms(
  listings: Listing[],
  limits: CategoryLimits = {}
): CategoryGroup[] {
  const categories: CategoryGroup[] = [
    { label: 'Studio Apartments', key: 'studio', listings: [], limit: limits.studio },
    { label: '1 Bedroom', key: '1bed', listings: [], limit: limits['1bed'] },
    { label: '2 Bedrooms', key: '2bed', listings: [], limit: limits['2bed'] },
    { label: '3 Bedrooms', key: '3bed', listings: [], limit: limits['3bed'] },
    { label: '4+ Bedrooms', key: '4plus', listings: [], limit: limits['4plus'] },
  ];

  for (const listing of listings) {
    if (listing.bedrooms === 0) {
      categories[0].listings.push(listing);
    } else if (listing.bedrooms === 1) {
      categories[1].listings.push(listing);
    } else if (listing.bedrooms === 2) {
      categories[2].listings.push(listing);
    } else if (listing.bedrooms === 3) {
      categories[3].listings.push(listing);
    } else if (listing.bedrooms >= 4) {
      categories[4].listings.push(listing);
    }
  }

  // Apply limits if specified
  for (const category of categories) {
    if (category.limit && category.limit > 0) {
      category.listings = category.listings.slice(0, category.limit);
    }
  }

  // Only return categories that have listings
  return categories.filter(cat => cat.listings.length > 0);
}

export function categorizeByPrice(
  listings: Listing[],
  limits: Record<string, number> = {}
): CategoryGroup[] {
  const categories: CategoryGroup[] = [
    { label: 'Under $2,000', key: 'under_2k', listings: [], limit: limits.under_2k },
    { label: '$2,000 - $3,000', key: '2k_3k', listings: [], limit: limits['2k_3k'] },
    { label: '$3,000 - $4,000', key: '3k_4k', listings: [], limit: limits['3k_4k'] },
    { label: 'Over $4,000', key: 'over_4k', listings: [], limit: limits.over_4k },
  ];

  for (const listing of listings) {
    if (listing.call_for_price || listing.price === null) {
      continue; // Skip call for price listings
    }

    if (listing.price < 2000) {
      categories[0].listings.push(listing);
    } else if (listing.price >= 2000 && listing.price < 3000) {
      categories[1].listings.push(listing);
    } else if (listing.price >= 3000 && listing.price < 4000) {
      categories[2].listings.push(listing);
    } else if (listing.price >= 4000) {
      categories[3].listings.push(listing);
    }
  }

  // Apply limits if specified
  for (const category of categories) {
    if (category.limit && category.limit > 0) {
      category.listings = category.listings.slice(0, category.limit);
    }
  }

  // Only return categories that have listings
  return categories.filter(cat => cat.listings.length > 0);
}

export function getBedroomCategory(bedrooms: number): string {
  if (bedrooms === 0) return 'studio';
  if (bedrooms === 1) return '1bed';
  if (bedrooms === 2) return '2bed';
  if (bedrooms === 3) return '3bed';
  return '4plus';
}

export function getPriceCategory(price: number | null, callForPrice: boolean): string {
  if (callForPrice || price === null) return 'call_for_price';
  if (price < 2000) return 'under_2k';
  if (price >= 2000 && price < 3000) return '2k_3k';
  if (price >= 3000 && price < 4000) return '3k_4k';
  return 'over_4k';
}
