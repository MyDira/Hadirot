// Email template rendering for digests
import type { Listing, CategoryGroup, FilterLinkWithCount } from "./types.ts";

export function formatPrice(listing: Listing): string {
  // Determine if this is a sale or rental listing
  const isSale = listing.listing_type === 'sale';

  if (listing.call_for_price) return "Call for Price";

  if (isSale) {
    // For sales, use asking_price with abbreviation
    if (listing.asking_price != null) {
      // Abbreviate sale prices
      if (listing.asking_price >= 1000000) {
        const millions = listing.asking_price / 1000000;
        return `$${millions.toFixed(1).replace(/\.0$/, '')}M`;
      } else if (listing.asking_price >= 1000) {
        const thousands = listing.asking_price / 1000;
        return `$${Math.round(thousands)}K`;
      } else {
        return `$${listing.asking_price}`;
      }
    }
    return "Call for Price";
  } else {
    // For rentals, use price with /month suffix
    if (listing.price != null) {
      const formattedPrice = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(listing.price);
      return `${formattedPrice}/month`;
    }
    return "Price Not Available";
  }
}

export function getBedroomDisplay(listing: Listing): string {
  if (listing.bedrooms === 0) return "Studio";
  if (listing.additional_rooms && listing.additional_rooms > 0) {
    return `${listing.bedrooms}+${listing.additional_rooms} bed`;
  }
  return `${listing.bedrooms} bed`;
}

export function getBathroomDisplay(bathrooms: number): string {
  return `${bathrooms} bath`;
}

export function getParkingDisplay(parking: string): string {
  return parking === "yes" || parking === "included" ? "Parking" : "";
}

export function getPropertyTypeDisplay(propertyType: string): string {
  if (propertyType === "basement") return "Basement";
  if (propertyType === "full_house") return "Full House";
  if (propertyType === "duplex") return "Duplex";
  if (propertyType === "apartment_in_building" || propertyType === "apartment_in_house") return "Apartment";
  return "";
}

export function getLeaseDisplay(leaseLength: string): string {
  if (leaseLength === "short_term") return "Short Term";
  return "";
}

export function renderListingCard(
  listing: Listing,
  listingUrl: string
): string {
  const hasParking = getParkingDisplay(listing.parking);
  const displayLocation = listing.cross_streets || listing.location || 'Location not specified';
  const locationWithNeighborhood = listing.neighborhood
    ? `${listing.neighborhood}, ${displayLocation}`
    : displayLocation;

  const ownerDisplay =
    listing.owner?.role === "agent" && listing.owner?.agency
      ? listing.owner.agency
      : "Owner";

  let specs = `${getBedroomDisplay(listing)} | ${getBathroomDisplay(listing.bathrooms)}`;
  if (hasParking) {
    specs += ` | ${hasParking}`;
  }
  specs += ` | ${listing.broker_fee ? "Broker Fee" : "No Fee"}`;

  const propertyType = getPropertyTypeDisplay(listing.property_type);
  const leaseType = getLeaseDisplay(listing.lease_length);
  if (propertyType || leaseType) {
    const extras = [propertyType, leaseType].filter((x) => x).join(", ");
    specs += ` - ${extras}`;
  }

  const featuredBadge = listing.is_featured ? " (FEATURED)" : "";

  return `${formatPrice(listing)}
${specs}
${locationWithNeighborhood}
Posted by ${ownerDisplay}${featuredBadge}
${listingUrl}
`;
}

export function renderCategorySection(
  category: CategoryGroup,
  siteUrl: string,
  createShortUrl: (listingId: string, originalUrl: string) => Promise<string>
): Promise<string> {
  return (async () => {
    let section = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${category.label.toUpperCase()} (${category.listings.length})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

    for (const listing of category.listings) {
      const listingUrl = await createShortUrl(
        listing.id,
        `${siteUrl}/listing/${listing.id}`
      );
      section += renderListingCard(listing, listingUrl) + "\n";
    }

    return section;
  })();
}

export function renderFilterLink(link: FilterLinkWithCount, siteUrl: string): string {
  const url = link.short_url || `${siteUrl}${link.url}`;
  return `${link.label} (${link.count} available)
${url}
`;
}

export async function renderPlainTextEmail(
  categories: CategoryGroup[],
  filterLinks: FilterLinkWithCount[],
  siteUrl: string,
  totalActive: number,
  createShortUrl: (listingId: string, originalUrl: string) => Promise<string>
): Promise<string> {
  const roundedCount = Math.floor(totalActive / 10) * 10;

  let email = `Here are the latest apartments posted on Hadirot:

To see all ${roundedCount}+ active apartments:
${siteUrl}/browse

`;

  // Add filter links section if any
  if (filterLinks.length > 0) {
    email += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BROWSE BY CATEGORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    for (const link of filterLinks) {
      email += renderFilterLink(link, siteUrl) + "\n";
    }
    email += "\n";
  }

  // Add listing categories
  for (const category of categories) {
    const section = await renderCategorySection(category, siteUrl, createShortUrl);
    email += section;
  }

  email += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Join the Hadirot WhatsApp Community:
https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt`;

  return email;
}

export function generateEmailSubject(
  templateName: string,
  subjectTemplate: string,
  listingCount: number
): string {
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return subjectTemplate
    .replace("{{date}}", currentDate)
    .replace("{{count}}", listingCount.toString())
    .replace("{{template}}", templateName);
}
