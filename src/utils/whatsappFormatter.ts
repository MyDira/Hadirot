import { Listing } from '@/config/supabase';

export interface CollectionLink {
  label: string;
  count: number;
  url: string;
  enabled: boolean;
}

export interface FormattedListing {
  price: string;
  specs: string;
  location: string;
  postedBy: string;
  url: string;
  sectionKey?: string;
  sectionLabel?: string;
}

export interface WhatsAppDigestOptions {
  introText: string;
  outroText: string;
  collections?: CollectionLink[];
  listings?: FormattedListing[];
  sectionByFilter?: 'bedrooms' | 'property_type' | null;
}

export class WhatsAppFormatter {
  /**
   * Format a complete WhatsApp digest with all sections
   */
  static formatDigest(options: WhatsAppDigestOptions): string {
    const sections: string[] = [];

    // Section 1: Intro (always included)
    sections.push(options.introText);
    sections.push('');

    // Section 2: Collections (only if provided and has enabled items)
    if (options.collections && options.collections.length > 0) {
      const enabledCollections = options.collections.filter(c => c.enabled);
      if (enabledCollections.length > 0) {
        const collectionText = this.formatCollections(enabledCollections);
        sections.push(collectionText);
        sections.push('');
      }
    }

    // Section 3: Listings (only if provided)
    if (options.listings && options.listings.length > 0) {
      const listingsText = options.sectionByFilter
        ? this.formatSectionedListings(options.listings, options.sectionByFilter)
        : this.formatListings(options.listings);
      sections.push(listingsText);
      sections.push('');
    }

    // Section 4: Outro (always included)
    sections.push(options.outroText);

    return sections.join('\n');
  }

  /**
   * Format collection links with counts
   * Note: collection.label should already be the full CTA text with {count} and {label} replaced
   */
  private static formatCollections(collections: CollectionLink[]): string {
    return collections
      .map(collection => {
        // The label is already the formatted CTA text, just use it as-is
        return `*${collection.label}*\n${collection.url}`;
      })
      .join('\n\n');
  }

  /**
   * Format count - exact if under 10, rounded to nearest 5 if 10+
   */
  private static formatCount(count: number): number {
    if (count < 10) {
      return count;
    }
    return Math.round(count / 5) * 5;
  }

  /**
   * Format listings without sections
   */
  private static formatListings(listings: FormattedListing[]): string {
    return listings
      .map(listing => this.formatSingleListing(listing))
      .join('\n\n');
  }

  /**
   * Format listings grouped by a filter field
   */
  private static formatSectionedListings(
    listings: FormattedListing[],
    sectionBy: 'bedrooms' | 'property_type'
  ): string {
    // Group listings by section
    const grouped = new Map<string, FormattedListing[]>();

    listings.forEach(listing => {
      const key = listing.sectionKey || 'other';
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(listing);
    });

    // Sort sections
    const sortedSections = Array.from(grouped.keys()).sort((a, b) => {
      if (sectionBy === 'bedrooms') {
        // Sort bedrooms numerically: 0 (studio), 1, 2, 3, 4+
        const aNum = a === 'studio' ? 0 : parseInt(a) || 999;
        const bNum = b === 'studio' ? 0 : parseInt(b) || 999;
        return aNum - bNum;
      }
      // Sort property types alphabetically
      return a.localeCompare(b);
    });

    // Format each section
    const sections = sortedSections.map(sectionKey => {
      const sectionListings = grouped.get(sectionKey)!;
      const sectionLabel = sectionListings[0].sectionLabel || sectionKey;
      const listingsText = sectionListings
        .map(listing => this.formatSingleListing(listing))
        .join('\n\n');

      return `*${sectionLabel}*\n\n${listingsText}`;
    });

    return sections.join('\n\n');
  }

  /**
   * Format a single listing
   */
  private static formatSingleListing(listing: FormattedListing): string {
    return [
      `*${listing.price}*`,
      listing.specs,
      listing.location,
      listing.postedBy,
      listing.url
    ].join('\n');
  }

  /**
   * Convert a listing object to FormattedListing
   */
  static formatListingData(
    listing: Listing,
    shortCode?: string,
    sectionBy?: 'bedrooms' | 'property_type' | null
  ): FormattedListing {
    // Format price
    const price = listing.call_for_price
      ? 'Call for Price'
      : `$${listing.price?.toLocaleString()}`;

    // Format specs
    const specs: string[] = [];

    // Bedrooms
    if (listing.bedrooms === 0) {
      specs.push('Studio');
    } else {
      specs.push(`${listing.bedrooms} bed`);
    }

    // Bathrooms
    specs.push(`${listing.bathrooms} bath`);

    // Broker fee
    specs.push(listing.broker_fee ? 'Fee' : 'No Fee');

    // Property type
    if (listing.property_type) {
      const propertyTypeLabel = this.formatPropertyType(listing.property_type);
      specs.push(propertyTypeLabel);
    }

    // Format location
    const location = listing.neighborhood && listing.street
      ? `${listing.neighborhood}, ${listing.street}`
      : listing.location || 'Location not specified';

    // Format posted by
    const ownerName = (listing as any).owner?.full_name || 'Unknown';
    const ownerAgency = (listing as any).owner?.agency;
    const postedBy = ownerAgency
      ? `Posted by ${ownerAgency}`
      : `Posted by ${ownerName}`;

    // Format URL
    const url = shortCode
      ? `https://hadirot.com/l/${shortCode}`
      : `https://hadirot.com/listing/${listing.id}`;

    // Determine section key and label if sectioning
    let sectionKey: string | undefined;
    let sectionLabel: string | undefined;

    if (sectionBy === 'bedrooms') {
      if (listing.bedrooms === 0) {
        sectionKey = 'studio';
        sectionLabel = 'Studio';
      } else if (listing.bedrooms >= 4) {
        sectionKey = '4plus';
        sectionLabel = '4+ Bedrooms';
      } else {
        sectionKey = listing.bedrooms.toString();
        sectionLabel = `${listing.bedrooms} Bedroom${listing.bedrooms > 1 ? 's' : ''}`;
      }
    } else if (sectionBy === 'property_type' && listing.property_type) {
      sectionKey = listing.property_type;
      sectionLabel = this.formatPropertyType(listing.property_type);
    }

    return {
      price,
      specs: specs.join(' | '),
      location,
      postedBy,
      url,
      sectionKey,
      sectionLabel
    };
  }

  /**
   * Format property type for display in WhatsApp digest
   */
  private static formatPropertyType(type: string): string {
    const typeMap: Record<string, string> = {
      'apartment_building': 'Apartment',
      'apartment_house': 'Apartment',
      'full_house': 'Full House',
      'duplex': 'Duplex',
      'basement': 'Basement',
      'townhouse': 'Townhouse',
      'condo': 'Condo',
      'studio': 'Studio'
    };
    return typeMap[type.toLowerCase()] || type;
  }

  /**
   * Get section label for a section key
   */
  static getSectionLabel(sectionKey: string, sectionBy: 'bedrooms' | 'property_type'): string {
    if (sectionBy === 'bedrooms') {
      if (sectionKey === 'studio') return 'Studio';
      if (sectionKey === '4plus') return '4+ Bedrooms';
      const num = parseInt(sectionKey);
      if (!isNaN(num)) {
        return `${num} Bedroom${num > 1 ? 's' : ''}`;
      }
    } else if (sectionBy === 'property_type') {
      return this.formatPropertyType(sectionKey);
    }
    return sectionKey;
  }

  /**
   * Calculate character and line counts for WhatsApp
   */
  static getStats(text: string): { characters: number; lines: number } {
    return {
      characters: text.length,
      lines: text.split('\n').length
    };
  }
}
