/**
 * Daily Digest Email Template
 * Simple text-based format for daily listing digest
 */

export interface DigestListing {
  id: string;
  price: number | null;
  call_for_price: boolean;
  bedrooms: number;
  bathrooms: number;
  parking: string;
  broker_fee: boolean;
  location: string;
  neighborhood: string | null;
  owner?: {
    role?: string;
    agency?: string;
  };
}

function formatPrice(listing: DigestListing): string {
  if (listing.call_for_price) return "Call for Price";
  if (listing.price != null) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(listing.price);
  }
  return "Price Not Available";
}

function getParkingText(parking: string): string {
  if (parking === "yes" || parking === "included") return "Parking included";
  if (parking === "available") return "Parking available";
  return ""; // No text if no parking
}

function getOwnerText(listing: DigestListing): string {
  if (listing.owner?.role === "agent" && listing.owner?.agency) {
    return listing.owner.agency;
  }
  return "By Owner";
}

function getLocationText(listing: DigestListing): string {
  if (listing.neighborhood) {
    return `${listing.neighborhood}, ${listing.location}`;
  }
  return listing.location;
}

/**
 * Generate plain text format for a single listing
 */
export function formatListingText(listing: DigestListing, siteUrl: string): string {
  const price = formatPrice(listing);
  const bedrooms = listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms}`;
  const bathrooms = `${listing.bathrooms}`;
  const parking = getParkingText(listing.parking);
  const fee = listing.broker_fee ? "Broker Fee" : "No Fee";
  const location = getLocationText(listing);
  const owner = getOwnerText(listing);
  const listingUrl = `${siteUrl}/listing/${listing.id}`;

  // Build line 2 with icons for bed/bath, text for parking (only if exists)
  let line2 = `🛏️ ${bedrooms}, 🛁 ${bathrooms}`;
  if (parking) {
    line2 += `, ${parking}`;
  }
  line2 += `, ${fee}`;

  return `${price}
${line2}
📍 ${location}
${owner}
Click here to view the apartment: ${listingUrl}`;
}

/**
 * Generate HTML email for daily digest
 */
export function generateDailyDigestEmail(
  listings: DigestListing[],
  siteUrl: string,
  whatsappLink: string
): string {
  const listingsHtml = listings
    .map((listing) => {
      const price = formatPrice(listing);
      const bedrooms = listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms}`;
      const bathrooms = `${listing.bathrooms}`;
      const parking = getParkingText(listing.parking);
      const fee = listing.broker_fee ? "Broker Fee" : "No Fee";
      const location = getLocationText(listing);
      const owner = getOwnerText(listing);
      const listingUrl = `${siteUrl}/listing/${listing.id}`;

      // Build line 2 with icons for bed/bath, text for parking (only if exists)
      let line2 = `🛏️ ${bedrooms}, 🛁 ${bathrooms}`;
      if (parking) {
        line2 += `, ${parking}`;
      }
      line2 += `, ${fee}`;

      return `
        <div style="margin-bottom: 30px; padding: 20px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
          <div style="font-size: 22px; font-weight: bold; color: #1e4a74; margin-bottom: 12px;">
            ${price}
          </div>
          <div style="color: #4b5563; margin-bottom: 8px; font-size: 15px;">
            ${line2}
          </div>
          <div style="color: #4b5563; margin-bottom: 12px; font-size: 15px;">
            📍 ${location}
          </div>
          <div style="color: #6b7280; margin-bottom: 12px; font-size: 14px;">
            ${owner}
          </div>
          <a href="${listingUrl}" style="display: inline-block; background: #1e4a74; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Click here to view the apartment
          </a>
        </div>
      `;
    })
    .join("");

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f9fafb; padding: 20px;">
      <div style="background: #1e4a74; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">Hadirot</h1>
        <p style="margin: 8px 0 0 0; opacity: 0.9;">Daily Listings Digest</p>
      </div>

      <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px;">
        <div style="margin-bottom: 30px; font-size: 18px; font-weight: 600; color: #1e4a74;">
          Today's new Hadirot listings 👇
        </div>

        ${listingsHtml}

        <div style="margin-top: 40px; padding: 20px; background: #f0f9ff; border-left: 4px solid #25D366; border-radius: 4px; text-align: center;">
          <p style="margin: 0 0 12px 0; font-weight: 600; color: #333; font-size: 16px;">
            Click the link to join the Hadirot community
          </p>
          <a href="${whatsappLink}" style="color: #25D366; text-decoration: none; font-weight: 600; font-size: 16px;">
            ${whatsappLink}
          </a>
        </div>

        <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} Hadirot. All rights reserved.</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate plain text format for all listings (for copy-to-clipboard)
 */
export function generatePlainTextDigest(
  listings: DigestListing[],
  siteUrl: string,
  whatsappLink: string
): string {
  const header = "Today's new Hadirot listings 👇\n\n";

  const listingsText = listings
    .map((listing) => formatListingText(listing, siteUrl))
    .join("\n\n");

  const footer = `\n\nClick the link to join the Hadirot community\n${whatsappLink}`;

  return header + listingsText + footer;
}
