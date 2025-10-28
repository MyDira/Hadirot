/**
 * Generates HTML for a listing card suitable for image rendering
 * Matches the design of the ListingCard component but optimized for screenshots
 */

interface ListingCardData {
  id: string;
  title: string;
  price: number | null;
  call_for_price: boolean;
  bedrooms: number;
  bathrooms: number;
  parking: string;
  broker_fee: boolean;
  location: string;
  neighborhood: string | null;
  property_type: string;
  lease_length: string;
  imageUrl: string;
  isStockPhoto?: boolean;
  ownerName?: string;
  ownerRole?: string;
  ownerAgency?: string;
  is_featured: boolean;
}

export function generateListingCardHTML(listing: ListingCardData): string {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const hasParking = listing.parking === 'yes' || listing.parking === 'included';

  const priceDisplay = listing.call_for_price
    ? 'Call for Price'
    : listing.price != null
      ? formatPrice(listing.price)
      : 'Price Not Available';

  const bedroomDisplay = listing.bedrooms === 0 ? 'Studio' : listing.bedrooms.toString();

  const getPosterLabel = () => {
    if (listing.ownerRole === 'agent' && listing.ownerAgency) {
      return listing.ownerAgency;
    }
    return 'Owner';
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #ffffff;
    }

    .card {
      width: 400px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .image-container {
      position: relative;
      width: 100%;
      height: 267px;
      overflow: hidden;
      background: #f3f4f6;
    }

    .image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .badge-container {
      position: absolute;
      bottom: 12px;
      right: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-end;
    }

    .badge {
      background: rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(4px);
      color: white;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
    }

    .stock-badge {
      position: absolute;
      bottom: 12px;
      left: 12px;
      background: rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(4px);
      color: white;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
    }

    .content {
      padding: 12px;
    }

    .price {
      font-size: 24px;
      font-weight: bold;
      color: #1e4a74;
      margin-bottom: 8px;
      line-height: 1;
    }

    .specs {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #4b5563;
      font-size: 14px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .spec-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .icon {
      width: 16px;
      height: 16px;
    }

    .badge-fee {
      background: #f3f4f6;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
    }

    .location {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #4b5563;
      margin-top: 8px;
      margin-bottom: 8px;
      font-size: 14px;
    }

    .footer {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #f3f4f6;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .poster {
      font-size: 12px;
      color: #4b5563;
    }

    .featured-badge {
      background: #7CB342;
      color: white;
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="image-container">
      <img src="${listing.imageUrl}" alt="${listing.title}" class="image" crossorigin="anonymous">

      ${listing.property_type === 'full_house' || listing.lease_length === 'short_term' ? `
      <div class="badge-container">
        ${listing.property_type === 'full_house' ? '<div class="badge">Full House</div>' : ''}
        ${listing.lease_length === 'short_term' ? '<div class="badge">Short Term</div>' : ''}
      </div>
      ` : ''}

      ${listing.isStockPhoto ? '<div class="stock-badge">Stock photo</div>' : ''}
    </div>

    <div class="content">
      <div class="price">${priceDisplay}</div>

      <div class="specs">
        <div class="spec-item">
          <span>🛏️</span>
          <span>${bedroomDisplay}</span>
        </div>
        <div class="spec-item">
          <span>🛁</span>
          <span>${listing.bathrooms}</span>
        </div>
        ${hasParking ? '<div class="spec-item"><span>🅿️ Parking</span></div>' : ''}
        <span class="badge-fee">${listing.broker_fee ? 'Broker Fee' : 'No Fee'}</span>
      </div>

      <div class="location">
        <span>📍</span>
        <span>${listing.neighborhood ? `${listing.neighborhood}, ${listing.location}` : listing.location}</span>
      </div>

      <div class="footer">
        <span class="poster">by ${getPosterLabel()}</span>
        ${listing.is_featured ? '<span class="featured-badge">Featured</span>' : ''}
      </div>
    </div>
  </div>
</body>
</html>
  `;
}
