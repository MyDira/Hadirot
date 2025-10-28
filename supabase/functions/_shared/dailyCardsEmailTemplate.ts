/**
 * Pure Text Email Template for Daily Listings
 * Generates ONLY plain text - no HTML whatsoever
 */

interface ListingEmailData {
  id: string;
  title: string;
  price: number | null;
  call_for_price: boolean;
  bedrooms: number;
  bathrooms: number;
  location: string;
  cross_streets: string | null;
  broker_fee: boolean;
  parking: string | null;
  listingUrl: string;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function generateListingText(listing: ListingEmailData): string {
  const priceText = listing.call_for_price
    ? 'Call for Price'
    : `${formatPrice(listing.price!)}/month`;

  const bedroomText = listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} bed`;
  const bathroomText = `${listing.bathrooms} bath`;
  const hasParking = listing.parking === 'yes' || listing.parking === 'included';
  const parkingText = hasParking ? ' • Parking' : '';
  const feeText = listing.broker_fee ? '' : ' • No Fee';
  const locationText = listing.cross_streets || listing.location;

  return `${priceText}
${bedroomText} • ${bathroomText}${parkingText}${feeText}
${locationText}

${listing.listingUrl}`;
}

export function generateDailyCardsTextEmail(
  listings: ListingEmailData[],
  date: string,
  whatsappGroupUrl: string
): string {
  const listingsText = listings
    .map((listing) => generateListingText(listing))
    .join('\n\n—————————————————\n\n');

  const whatsappFooter = `

═══════════════════

Join our WhatsApp group:
${whatsappGroupUrl}`;

  return `Today's new Hadirot listings

—————————————————

${listingsText}

${whatsappFooter}`;
}
