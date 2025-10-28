/**
 * Simple Email Template for Manual Listing Emails
 * Used when admin manually sends listing notification
 */

interface ListingEmailData {
  id: string;
  title: string;
  price: number | null;
  call_for_price: boolean;
  bedrooms: number;
  bathrooms: number;
  location: string;
  neighborhood: string | null;
  broker_fee: boolean;
  parking: string;
  imageUrl: string;
  ownerName?: string;
  ownerRole?: string;
  ownerAgency?: string;
  is_featured: boolean;
}

function formatPrice(listing: ListingEmailData): string {
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

function getBedroomDisplay(bedrooms: number): string {
  return bedrooms === 0 ? "Studio" : `${bedrooms} bed`;
}

function getParkingDisplay(parking: string): string {
  return parking === "yes" || parking === "included" ? "Parking" : "";
}

export function generateManualListingEmail(
  listing: ListingEmailData,
  listingUrl: string,
  whatsappLink: string
): string {
  const ownerDisplay =
    listing.ownerRole === "agent" && listing.ownerAgency
      ? listing.ownerAgency
      : "Owner";
  const hasParking = getParkingDisplay(listing.parking);

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f9fafb; padding: 20px;">
      <div style="background: #1e4a74; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">Hadirot</h1>
        <p style="margin: 8px 0 0 0; opacity: 0.9;">New Listing Notification</p>
      </div>

      <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px;">
        <div style="margin-bottom: 40px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          ${
            listing.imageUrl
              ? `<img src="${listing.imageUrl}" alt="${listing.title}" style="width: 100%; max-width: 400px; height: auto; border-radius: 8px; margin-bottom: 20px; display: block;" />`
              : ""
          }

          <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; color: #1e4a74;">${formatPrice(listing)}</h2>

          <div style="margin-bottom: 12px; color: #4b5563; font-size: 14px;">
            🛏️ ${getBedroomDisplay(listing.bedrooms)} |
            🛁 ${listing.bathrooms} bath${hasParking ? " | 🅿️ " + hasParking : ""} |
            <span style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px;">${listing.broker_fee ? "Broker Fee" : "No Fee"}</span>
          </div>

          <div style="margin-bottom: 12px; color: #4b5563; font-size: 14px;">
            📍 ${listing.neighborhood ? `${listing.neighborhood}, ${listing.location}` : listing.location}
          </div>

          <div style="margin-bottom: 16px; padding: 12px; background: #f0f9ff; border-left: 4px solid #25D366; border-radius: 4px;">
            <p style="margin: 0 0 8px 0; font-weight: 600; color: #333;">Join the Hadirot WhatsApp Community:</p>
            <a href="${whatsappLink}" style="color: #25D366; text-decoration: none; font-weight: 500;">${whatsappLink}</a>
          </div>

          <a href="${listingUrl}" style="display: inline-block; background: #1e4a74; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
            View Listing
          </a>

          <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
            Posted by ${ownerDisplay}${listing.is_featured ? ' <span style="background: #7CB342; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">FEATURED</span>' : ""}
          </div>
        </div>

        <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} Hadirot. All rights reserved.</p>
        </div>
      </div>
    </div>
  `;
}
