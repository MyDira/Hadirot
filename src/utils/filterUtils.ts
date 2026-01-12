export interface MapPin {
  id: string;
  latitude: number;
  longitude: number;
  price: number | null;
  asking_price: number | null;
  listing_type: string | null;
  bedrooms: number;
  bathrooms?: number | null;
  property_type: string | null;
  broker_fee: boolean | null;
  parking: string | null;
  neighborhood: string | null;
  owner: { role: string; agency: string | null } | null;
}

interface MapBoundsFilter {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface FilterState {
  bedrooms?: number[];
  min_bathrooms?: number;
  poster_type?: string;
  agency_name?: string;
  property_type?: string;
  property_types?: string[];
  building_types?: string[];
  min_price?: number;
  max_price?: number;
  parking_included?: boolean;
  no_fee_only?: boolean;
  neighborhoods?: string[];
  lease_terms?: string[];
  sort?: string;
  searchBounds?: MapBoundsFilter | null;
  searchLocationName?: string;
}

export interface FilterableListing {
  id: string;
  listing_type?: string | null;
  price: number | null;
  asking_price?: number | null;
  bedrooms: number;
  bathrooms?: number | null;
  property_type: string | null;
  building_type?: string | null;
  broker_fee: boolean | null;
  parking: string | null;
  neighborhood: string | null;
  lease_length?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  owner?: { role: string; agency?: string | null } | null;
}

export function normalizePropertyTypes(filters: FilterState): string[] {
  if (filters.property_types && filters.property_types.length > 0) {
    return filters.property_types;
  }
  if (filters.property_type) {
    return [filters.property_type];
  }
  return [];
}

function isWithinBounds(lat: number, lng: number, bounds: MapBoundsFilter): boolean {
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}

export function applyFilters<T extends FilterableListing>(
  listings: T[],
  filters: FilterState
): T[] {
  if (!listings || listings.length === 0) return [];

  const propertyTypes = normalizePropertyTypes(filters);
  const hasPropertyTypeFilter = propertyTypes.length > 0;
  const hasBuildingTypeFilter = filters.building_types && filters.building_types.length > 0;
  const hasBedroomFilter = filters.bedrooms && filters.bedrooms.length > 0;
  const hasMinBathroomsFilter = filters.min_bathrooms != null && filters.min_bathrooms > 0;
  const hasNeighborhoodFilter = filters.neighborhoods && filters.neighborhoods.length > 0;
  const hasLeaseTermFilter = filters.lease_terms && filters.lease_terms.length > 0;
  const hasMinPrice = filters.min_price != null;
  const hasMaxPrice = filters.max_price != null;
  const hasBoundsFilter = filters.searchBounds != null;

  const hasAnyFilter =
    hasBedroomFilter ||
    hasMinBathroomsFilter ||
    hasMinPrice ||
    hasMaxPrice ||
    hasPropertyTypeFilter ||
    hasBuildingTypeFilter ||
    filters.parking_included ||
    filters.no_fee_only ||
    hasNeighborhoodFilter ||
    hasLeaseTermFilter ||
    filters.poster_type ||
    filters.agency_name ||
    hasBoundsFilter;

  if (!hasAnyFilter) return listings;

  return listings.filter((listing) => {
    const isSale = listing.listing_type === 'sale';
    const price = isSale ? listing.asking_price : listing.price;

    if (hasMinPrice && price != null && price < filters.min_price!) {
      return false;
    }

    if (hasMaxPrice && price != null && price > filters.max_price!) {
      return false;
    }

    if (hasBedroomFilter && !filters.bedrooms!.includes(listing.bedrooms)) {
      return false;
    }

    if (hasMinBathroomsFilter && (listing.bathrooms == null || listing.bathrooms < filters.min_bathrooms!)) {
      return false;
    }

    if (hasPropertyTypeFilter) {
      if (!listing.property_type || !propertyTypes.includes(listing.property_type)) {
        return false;
      }
    }

    if (hasBuildingTypeFilter) {
      if (!listing.building_type || !filters.building_types!.includes(listing.building_type)) {
        return false;
      }
    }

    if (filters.parking_included) {
      if (listing.parking !== 'yes' && listing.parking !== 'included') {
        return false;
      }
    }

    if (filters.no_fee_only) {
      if (listing.broker_fee !== false) {
        return false;
      }
    }

    if (hasNeighborhoodFilter) {
      if (!listing.neighborhood || !filters.neighborhoods!.includes(listing.neighborhood)) {
        return false;
      }
    }

    if (hasLeaseTermFilter) {
      const selectedTerms = filters.lease_terms!;
      const hasLongTermSelected = selectedTerms.includes('long_term_annual');
      const specialTerms = selectedTerms.filter(t => t !== 'long_term_annual');
      const hasSpecialTermsSelected = specialTerms.length > 0;
      const listingLeaseLength = listing.lease_length;
      const isNullOrLongTerm = !listingLeaseLength || listingLeaseLength === 'long_term_annual';

      if (hasLongTermSelected && hasSpecialTermsSelected) {
        if (!isNullOrLongTerm && !specialTerms.includes(listingLeaseLength!)) {
          return false;
        }
      } else if (hasLongTermSelected) {
        if (!isNullOrLongTerm) {
          return false;
        }
      } else if (hasSpecialTermsSelected) {
        if (!listingLeaseLength || !specialTerms.includes(listingLeaseLength)) {
          return false;
        }
      }
    }

    if (filters.poster_type === 'owner') {
      if (!listing.owner || (listing.owner.role !== 'landlord' && listing.owner.role !== 'tenant')) {
        return false;
      }
    }

    if (filters.poster_type === 'agent') {
      if (!listing.owner || listing.owner.role !== 'agent') {
        return false;
      }
      if (filters.agency_name && listing.owner.agency !== filters.agency_name) {
        return false;
      }
    }

    if (hasBoundsFilter && listing.latitude != null && listing.longitude != null) {
      if (!isWithinBounds(listing.latitude, listing.longitude, filters.searchBounds!)) {
        return false;
      }
    }

    return true;
  });
}

export function doesPinMatchFilters(pin: MapPin, filters: FilterState): boolean {
  const isSale = pin.listing_type === 'sale';
  const price = isSale ? pin.asking_price : pin.price;

  if (filters.min_price != null && price != null && price < filters.min_price) {
    return false;
  }

  if (filters.max_price != null && price != null && price > filters.max_price) {
    return false;
  }

  if (filters.bedrooms && filters.bedrooms.length > 0) {
    if (!filters.bedrooms.includes(pin.bedrooms)) {
      return false;
    }
  }

  if (filters.min_bathrooms != null && filters.min_bathrooms > 0) {
    if (pin.bathrooms == null || pin.bathrooms < filters.min_bathrooms) {
      return false;
    }
  }

  if (filters.property_type && pin.property_type !== filters.property_type) {
    return false;
  }

  if (filters.property_types && filters.property_types.length > 0) {
    if (!pin.property_type || !filters.property_types.includes(pin.property_type)) {
      return false;
    }
  }

  if (filters.parking_included) {
    if (pin.parking !== 'yes' && pin.parking !== 'included') {
      return false;
    }
  }

  if (filters.no_fee_only) {
    if (pin.broker_fee !== false) {
      return false;
    }
  }

  if (filters.neighborhoods && filters.neighborhoods.length > 0) {
    if (!pin.neighborhood || !filters.neighborhoods.includes(pin.neighborhood)) {
      return false;
    }
  }

  if (filters.poster_type === 'owner') {
    if (!pin.owner || (pin.owner.role !== 'landlord' && pin.owner.role !== 'tenant')) {
      return false;
    }
  }

  if (filters.poster_type === 'agent') {
    if (!pin.owner || pin.owner.role !== 'agent') {
      return false;
    }
    if (filters.agency_name && pin.owner.agency !== filters.agency_name) {
      return false;
    }
  }

  return true;
}

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

function isPinWithinBounds(pin: MapPin, bounds: MapBounds): boolean {
  return (
    pin.latitude >= bounds.south &&
    pin.latitude <= bounds.north &&
    pin.longitude >= bounds.west &&
    pin.longitude <= bounds.east
  );
}

export function getVisiblePinIds(
  pins: MapPin[],
  filters: FilterState,
  searchBounds?: MapBounds | null
): Set<string> {
  const visibleIds = new Set<string>();
  const effectiveBounds = searchBounds ?? filters.searchBounds;

  for (const pin of pins) {
    if (!doesPinMatchFilters(pin, filters)) {
      continue;
    }

    if (effectiveBounds && !isPinWithinBounds(pin, effectiveBounds)) {
      continue;
    }

    visibleIds.add(pin.id);
  }

  return visibleIds;
}
