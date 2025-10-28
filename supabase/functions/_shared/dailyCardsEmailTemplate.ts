/**
 * WhatsApp-Optimized Text Email Template for Daily Listings
 *
 * Generates plain text email format optimized for copy/paste into WhatsApp
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

/**
 * Format price for display
 */
function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Generate WhatsApp-optimized text for a single listing
 */
function generateListingText(listing: ListingEmailData): string {
  const priceText = listing.call_for_price
    ? 'Call for Price'
    : `${formatPrice(listing.price!)}/month`;

  const bedroomText = listing.bedrooms === 0 ? '🛏️ Studio' : `🛏️ ${listing.bedrooms}`;
  const bathroomText = `🛁 ${listing.bathrooms}`;
  const hasParking = listing.parking === 'yes' || listing.parking === 'included';
  const parkingText = hasParking ? ' • 🅿️ Parking' : '';
  const feeText = listing.broker_fee ? '' : ' • ✅ No Fee';
  const locationText = listing.cross_streets || listing.location;

  return `${priceText}
${bedroomText} • ${bathroomText}${parkingText}${feeText}
📍 ${locationText}

Click the link to view
${listing.listingUrl}`;
}

/**
 * Generate plain text email optimized for WhatsApp
 */
export function generateDailyCardsEmail(
  listings: ListingEmailData[],
  date: string,
  whatsappGroupUrl: string
): string {
  const listingsText = listings
    .map((listing) => generateListingText(listing))
    .join('\n\n—————————————————\n\n');

  const whatsappFooter = `

═══════════════════

Join our WhatsApp group to stay updated with the latest listings:
${whatsappGroupUrl}`;

  return `Today's new Hadirot listings 👇

—————————————————

${listingsText}

${whatsappFooter}`;
}

/**
 * Generate HTML version for email clients (kept minimal)
 */
export function generateDailyCardsEmailHTML(
  listings: ListingEmailData[],
  date: string,
  whatsappGroupUrl: string
): string {
  const listingsHTML = listings
    .map((listing) => {
      const priceText = listing.call_for_price
        ? 'Call for Price'
        : `${formatPrice(listing.price!)}/month`;

      const bedroomText = listing.bedrooms === 0 ? '🛏️ Studio' : `🛏️ ${listing.bedrooms}`;
      const bathroomText = `🛁 ${listing.bathrooms}`;
      const hasParking = listing.parking === 'yes' || listing.parking === 'included';
      const parkingText = hasParking ? ' • 🅿️ Parking' : '';
      const feeText = listing.broker_fee ? '' : ' • ✅ No Fee';
      const locationText = listing.cross_streets || listing.location;

      return `<div style="margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;">
        <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px;">${priceText}</div>
        <div style="margin-bottom: 8px;">${bedroomText} • ${bathroomText}${parkingText}${feeText}</div>
        <div style="margin-bottom: 12px;">📍 ${locationText}</div>
        <div style="margin-top: 12px;">
          <div style="margin-bottom: 5px; color: #666;">Click the link to view</div>
          <a href="${listing.listingUrl}" style="color: #4E4B43; text-decoration: underline;">${listing.listingUrl}</a>
        </div>
      </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Today's Hadirot Listings - ${date}</title>
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h1 style="margin: 0 0 30px 0; font-size: 24px; color: #1f2937;">Today's new Hadirot listings 👇</h1>

    ${listingsHTML}

    <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #e5e7eb;">
      <div style="margin-bottom: 15px; font-size: 16px; font-weight: 600; color: #1f2937;">Join our WhatsApp group to stay updated with the latest listings:</div>
      <a href="${whatsappGroupUrl}" style="display: inline-block; padding: 12px 24px; background-color: #25D366; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Join WhatsApp Group</a>
    </div>

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
      Generated on ${date}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate plain text version for email clients
 */
export function generatePlainTextEmail(
  listings: ListingEmailData[],
  date: string,
  whatsappGroupUrl: string
): string {
  return generateDailyCardsEmail(listings, date, whatsappGroupUrl);
}
