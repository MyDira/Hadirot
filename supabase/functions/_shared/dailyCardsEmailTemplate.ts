/**
 * Email Template for Daily Listing Cards
 *
 * Generates HTML email with listing card images and WhatsApp-ready copy
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
  neighborhood: string | null;
  broker_fee: boolean;
  parking: string | null;
  imageUrl: string;
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
 * Generate WhatsApp message for a listing
 */
function generateWhatsAppMessage(listing: ListingEmailData): string {
  const priceText = listing.call_for_price
    ? 'Call for Price'
    : `${formatPrice(listing.price!)}/month`;

  const bedroomText = listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} bed`;
  const bathroomText = `${listing.bathrooms} bath`;
  const feeText = listing.broker_fee ? 'Broker Fee' : 'No Fee';
  const hasParking = listing.parking === 'yes' || listing.parking === 'included';

  return `🏠 New Listing Available!

💰 ${priceText}
🛏️ ${bedroomText}
🛁 ${bathroomText}
${hasParking ? '🅿️ Parking included\n' : ''}📍 ${listing.cross_streets || listing.location}
${feeText}

View details: ${listing.listingUrl}`;
}

/**
 * Generate HTML email template
 */
export function generateDailyCardsEmail(
  listings: ListingEmailData[],
  date: string
): string {
  const listingCardsHTML = listings
    .map(
      (listing) => `
    <tr>
      <td style="padding: 20px;">
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 400px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <!-- Card Image -->
          <tr>
            <td style="padding: 0;">
              <img src="${listing.imageUrl}" alt="${listing.title}" style="width: 100%; height: auto; display: block; max-height: 267px; object-fit: cover;" />
            </td>
          </tr>
          <!-- Card Content -->
          <tr>
            <td style="padding: 16px;">
              <!-- Price -->
              <div style="margin-bottom: 12px;">
                <strong style="font-size: 24px; color: #1f2937; font-weight: 700;">
                  ${listing.call_for_price ? 'Call for Price' : formatPrice(listing.price!)}
                </strong>
              </div>
              <!-- Specs -->
              <div style="margin-bottom: 12px; font-size: 14px; color: #4b5563;">
                🛏️ ${listing.bedrooms === 0 ? 'Studio' : listing.bedrooms} &nbsp;&nbsp;
                🛁 ${listing.bathrooms} &nbsp;&nbsp;
                ${listing.parking === 'yes' || listing.parking === 'included' ? 'Parking &nbsp;&nbsp;' : ''}
                <span style="padding: 2px 8px; font-size: 12px; background-color: #f3f4f6; border-radius: 4px;">
                  ${listing.broker_fee ? 'Broker Fee' : 'No Fee'}
                </span>
              </div>
              <!-- Location -->
              <div style="margin-bottom: 12px; font-size: 14px; color: #4b5563;">
                📍 ${listing.cross_streets || listing.location}
              </div>
              <!-- View Link -->
              <div style="margin-top: 16px;">
                <a href="${listing.listingUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4E4B43; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
                  View Listing
                </a>
              </div>
              <!-- WhatsApp Message -->
              <div style="margin-top: 16px; padding: 12px; background-color: #f9fafb; border-radius: 6px; font-size: 12px; color: #4b5563; font-family: monospace; white-space: pre-wrap;">
${generateWhatsAppMessage(listing)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `
    )
    .join('\n');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Listing Cards - ${date}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 900px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <tr>
      <td style="padding: 20px; background-color: #ffffff; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 28px; color: #1f2937; font-weight: 700;">
          📧 Daily Listing Cards
        </h1>
        <p style="margin: 8px 0 0 0; font-size: 16px; color: #6b7280;">
          ${date}
        </p>
      </td>
    </tr>
    <!-- Summary -->
    <tr>
      <td style="padding: 20px; background-color: #ffffff;">
        <p style="margin: 0; font-size: 16px; color: #4b5563; text-align: center;">
          ${listings.length} listing${listings.length !== 1 ? 's' : ''} ready to share
        </p>
      </td>
    </tr>
    <!-- Listing Cards -->
    ${listingCardsHTML}
    <!-- Footer -->
    <tr>
      <td style="padding: 20px; background-color: #ffffff; border-radius: 0 0 8px 8px; text-align: center;">
        <p style="margin: 0; font-size: 14px; color: #9ca3af;">
          Generated automatically at ${new Date().toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })}
        </p>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #9ca3af;">
          Copy the WhatsApp messages above and paste directly into WhatsApp
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text version for email clients that don't support HTML
 */
export function generatePlainTextEmail(
  listings: ListingEmailData[],
  date: string
): string {
  const listingsText = listings
    .map(
      (listing, index) => `
${index + 1}. ${listing.title}
   ${listing.call_for_price ? 'Call for Price' : formatPrice(listing.price!)}
   ${listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} bed`} | ${listing.bathrooms} bath | ${listing.broker_fee ? 'Broker Fee' : 'No Fee'}
   📍 ${listing.cross_streets || listing.location}
   🔗 ${listing.listingUrl}

   WhatsApp Message:
${generateWhatsAppMessage(listing)}

---
`
    )
    .join('\n');

  return `
DAILY LISTING CARDS - ${date}
${listings.length} listing${listings.length !== 1 ? 's' : ''} ready to share

${listingsText}

Generated automatically at ${new Date().toLocaleString('en-US')}
  `.trim();
}
