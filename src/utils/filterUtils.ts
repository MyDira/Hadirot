export interface MapPin {
  id: string;
  latitude: number;
  longitude: number;
  price: number | null;
  asking_price: number | null;
  listing_type: string | null;
  bedrooms: number;
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

interface FilterState {
  bedrooms?: number[];
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
  sort?: string;
  searchBounds?: MapBoundsFilter | null;
  searchLocationName?: string;
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
