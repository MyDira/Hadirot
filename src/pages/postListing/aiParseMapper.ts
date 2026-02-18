import type { MapboxFeature } from "../../components/listing/MapboxStreetAutocomplete";
import type { ListingFormData } from "./types";

export interface AIParseMappingResult {
  updatedFormData: Partial<ListingFormData>;
  crossStreetA: MapboxFeature | null;
  crossStreetB: MapboxFeature | null;
}

export function mapAIParsedDataToFormFields(
  parsedData: any,
  currentListingType: string
): AIParseMappingResult {
  const data = parsedData.listing || parsedData.data || parsedData;

  console.log('========== EXTRACTED DATA ==========');
  console.log('Data to map:', JSON.stringify(data, null, 2));
  console.log('Data Keys:', Object.keys(data));
  console.log('====================================');

  const updatedFormData: Partial<ListingFormData> = {};
  let crossStreetA: MapboxFeature | null = null;
  let crossStreetB: MapboxFeature | null = null;

  if (data.listing_type) updatedFormData.listing_type = data.listing_type;
  if (data.title) updatedFormData.title = data.title;
  if (data.description) updatedFormData.description = data.description;

  const listingType = data.listing_type || currentListingType || 'rental';

  console.log('🔍 Detected listing type:', listingType);
  console.log('🔍 Has cross_streets?', !!data.cross_streets);
  console.log('🔍 Has location?', !!data.location);

  if (listingType === 'rental') {
    if (data.cross_streets) {
      console.log('📍 Processing data.cross_streets:', data.cross_streets);
      updatedFormData.location = data.cross_streets;

      const streets = data.cross_streets.split(' & ');
      if (streets.length === 2) {
        crossStreetA = {
          id: 'ai-parsed-street-a',
          text: streets[0].trim(),
          place_name: streets[0].trim(),
          center: [0, 0],
          place_type: ['address']
        };
        crossStreetB = {
          id: 'ai-parsed-street-b',
          text: streets[1].trim(),
          place_name: streets[1].trim(),
          center: [0, 0],
          place_type: ['address']
        };
        console.log('✅ Set cross street A from cross_streets:', streets[0].trim());
        console.log('✅ Set cross street B from cross_streets:', streets[1].trim());
      } else {
        updatedFormData.location = data.cross_streets;
      }
    } else if (data.location) {
      console.log('📍 Processing data.location:', data.location);
      updatedFormData.location = data.location;
      const streets = data.location.split(' & ');
      if (streets.length === 2) {
        crossStreetA = {
          id: 'ai-parsed-street-a',
          text: streets[0].trim(),
          place_name: streets[0].trim(),
          center: [0, 0],
          place_type: ['address']
        };
        crossStreetB = {
          id: 'ai-parsed-street-b',
          text: streets[1].trim(),
          place_name: streets[1].trim(),
          center: [0, 0],
          place_type: ['address']
        };
        console.log('✅ Set cross street A from location:', streets[0].trim());
        console.log('✅ Set cross street B from location:', streets[1].trim());
      }
    }

    if (data.cross_street_a && data.cross_street_b) {
      console.log('📍 Processing separate cross_street_a/b fields');
      updatedFormData.location = `${data.cross_street_a} & ${data.cross_street_b}`;
      crossStreetA = {
        id: 'ai-parsed-street-a',
        text: data.cross_street_a,
        place_name: data.cross_street_a,
        center: [0, 0],
        place_type: ['address']
      };
      crossStreetB = {
        id: 'ai-parsed-street-b',
        text: data.cross_street_b,
        place_name: data.cross_street_b,
        center: [0, 0],
        place_type: ['address']
      };
      console.log('✅ Set cross street A from cross_street_a:', data.cross_street_a);
      console.log('✅ Set cross street B from cross_street_b:', data.cross_street_b);
    }

    if (data.neighborhood) updatedFormData.neighborhood = data.neighborhood;

  } else if (listingType === 'sale') {
    console.log('🏢 Processing sales listing address fields');
    if (data.street_address) updatedFormData.street_address = data.street_address;
    if (data.unit_number) updatedFormData.unit_number = data.unit_number;
    if (data.city) updatedFormData.city = data.city;
    if (data.state) updatedFormData.state = data.state;
    if (data.zip_code) updatedFormData.zip_code = data.zip_code;
  }

  if (data.bedrooms !== undefined) updatedFormData.bedrooms = Number(data.bedrooms) || 1;
  if (data.bathrooms !== undefined) updatedFormData.bathrooms = Number(data.bathrooms) || 1;
  if (data.floor !== undefined) updatedFormData.floor = Number(data.floor);
  if (data.additional_rooms !== undefined) updatedFormData.additional_rooms = Number(data.additional_rooms) || 0;

  if (data.price !== undefined && data.price !== null) {
    const priceNum = Number(data.price);
    updatedFormData.price = isNaN(priceNum) ? null : priceNum;
  } else if (data.rent !== undefined && data.rent !== null) {
    const rentNum = Number(data.rent);
    updatedFormData.price = isNaN(rentNum) ? null : rentNum;
  } else if (data.monthly_rent !== undefined && data.monthly_rent !== null) {
    const monthlyRentNum = Number(data.monthly_rent);
    updatedFormData.price = isNaN(monthlyRentNum) ? null : monthlyRentNum;
  }

  if (data.asking_price !== undefined) updatedFormData.asking_price = Number(data.asking_price) || null;
  if (data.square_footage !== undefined) updatedFormData.square_footage = Number(data.square_footage);
  if (data.property_age !== undefined) updatedFormData.property_age = Number(data.property_age);
  if (data.year_built !== undefined) updatedFormData.year_built = Number(data.year_built);
  if (data.year_renovated !== undefined) updatedFormData.year_renovated = Number(data.year_renovated);
  if (data.hoa_fees !== undefined) updatedFormData.hoa_fees = Number(data.hoa_fees);
  if (data.property_taxes !== undefined) updatedFormData.property_taxes = Number(data.property_taxes);
  if (data.lot_size_sqft !== undefined) updatedFormData.lot_size_sqft = Number(data.lot_size_sqft);
  if (data.building_size_sqft !== undefined) updatedFormData.building_size_sqft = Number(data.building_size_sqft);
  if (data.unit_count !== undefined) updatedFormData.unit_count = Number(data.unit_count);
  if (data.number_of_floors !== undefined) updatedFormData.number_of_floors = Number(data.number_of_floors);

  let hasWasherDryer = false;
  let hasDishwasher = false;
  let cleanedInteriorFeatures: string[] = [];

  if (data.interior_features && Array.isArray(data.interior_features)) {
    hasWasherDryer = data.interior_features.includes("washer_dryer_in_unit");
    hasDishwasher = data.interior_features.includes("dishwasher");

    cleanedInteriorFeatures = data.interior_features.filter(
      (f: string) => !["washer_dryer_in_unit", "dishwasher"].includes(f)
    );
  }

  if (data.call_for_price !== undefined) updatedFormData.call_for_price = Boolean(data.call_for_price);
  if (hasWasherDryer || data.washer_dryer_hookup !== undefined) {
    updatedFormData.washer_dryer_hookup = hasWasherDryer || Boolean(data.washer_dryer_hookup);
  }
  if (hasDishwasher || data.dishwasher !== undefined) {
    updatedFormData.dishwasher = hasDishwasher || Boolean(data.dishwasher);
  }
  if (data.broker_fee !== undefined) updatedFormData.broker_fee = Boolean(data.broker_fee);
  if (data.is_featured !== undefined) updatedFormData.is_featured = Boolean(data.is_featured);

  if (data.parking !== undefined) {
    if (typeof data.parking === 'boolean') {
      updatedFormData.parking = data.parking ? 'yes' : 'no';
      console.log(`✅ Mapped parking: [${data.parking}] → [${updatedFormData.parking}]`);
    } else if (typeof data.parking === 'string') {
      const validParkingRental = ['no', 'yes', 'included', 'optional'];
      const validParkingSale = ['no', 'yes', 'included', 'optional', 'carport'];
      const validParking = listingType === 'sale' ? validParkingSale : validParkingRental;

      if (validParking.includes(data.parking)) {
        updatedFormData.parking = data.parking;
        console.log(`✅ Mapped parking: [${data.parking}] → [${updatedFormData.parking}]`);
      } else {
        console.warn(`Invalid parking value: ${data.parking}, defaulting to 'no'`);
        updatedFormData.parking = 'no';
      }
    }
  }
  if (data.heat) updatedFormData.heat = data.heat;
  if (data.heating_type) updatedFormData.heating_type = data.heating_type;
  if (data.property_type) updatedFormData.property_type = data.property_type;
  if (data.building_type) updatedFormData.building_type = data.building_type;
  if (data.lease_length) updatedFormData.lease_length = data.lease_length;
  if (data.ac_type) updatedFormData.ac_type = data.ac_type;
  if (data.property_condition) updatedFormData.property_condition = data.property_condition;
  if (data.occupancy_status) updatedFormData.occupancy_status = data.occupancy_status;
  if (data.delivery_condition) updatedFormData.delivery_condition = data.delivery_condition;
  if (data.laundry_type) updatedFormData.laundry_type = data.laundry_type;
  if (data.basement_type) updatedFormData.basement_type = data.basement_type;

  if (data.apartment_conditions && Array.isArray(data.apartment_conditions)) {
    const validConditions = ['modern', 'renovated', 'large_rooms', 'high_ceilings', 'large_closets'];

    const normalized = data.apartment_conditions.map((condition: string) =>
      condition.toLowerCase().replace(/\s+/g, '_')
    ).filter((condition: string) => validConditions.includes(condition));

    updatedFormData.apartment_conditions = normalized;
    console.log(`✅ Mapped apartment_conditions: [${data.apartment_conditions}] → [${normalized}]`);
  }
  if (data.outdoor_space && Array.isArray(data.outdoor_space)) {
    const validOutdoorSpaces = ['balcony', 'terrace', 'patio', 'backyard', 'roof_deck', 'shared_yard'];

    const normalized = data.outdoor_space.map((space: string) => {
      const cleaned = space.toLowerCase().replace(/\s+/g, '_');
      if (cleaned === 'backyard_access') return 'backyard';
      if (cleaned === 'rooftop' || cleaned === 'rooftop_deck') return 'roof_deck';
      if (cleaned === 'deck') return 'roof_deck';
      if (cleaned === 'garden') return 'backyard';
      if (cleaned === 'yard') return 'shared_yard';
      return cleaned;
    }).filter((space: string) => validOutdoorSpaces.includes(space));

    updatedFormData.outdoor_space = normalized;
    console.log(`✅ Mapped outdoor_space: [${data.outdoor_space}] → [${normalized}]`);
  }
  if (cleanedInteriorFeatures.length > 0) {
    const validInteriorFeatures = [
      'modern', 'renovated', 'large_rooms', 'high_ceilings_10ft', 'large_closets',
      'hardwood_floors', 'crown_molding', 'fireplace', 'walk_in_closet',
      'built_in_storage', 'exposed_brick', 'herringbone_floors', 'coffered_ceilings'
    ];

    const filteredOut: string[] = [];

    const normalized = cleanedInteriorFeatures.map(feature => {
      const cleaned = feature.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

      if (cleaned === 'high_ceilings') return 'high_ceilings_10ft';

      if (['modern_kitchen', 'stainless_steel_appliances', 'central_ac', 'dishwasher'].includes(cleaned)) {
        filteredOut.push(feature);
        return null;
      }

      return cleaned;
    }).filter(feature => feature !== null && validInteriorFeatures.includes(feature));

    updatedFormData.interior_features = normalized;
    console.log(`✅ Mapped interior_features: [${cleanedInteriorFeatures}] → [${normalized}]`);
    if (filteredOut.length > 0) {
      console.log(`🔍 Filtered out invalid values: [${filteredOut}]`);
    }
  }
  if (data.utilities_included && Array.isArray(data.utilities_included)) {
    const normalizedUtilities = data.utilities_included.map((utility: string) =>
      utility.toLowerCase().replace('/', '_').replace(/\s+/g, '_')
    );
    updatedFormData.utilities_included = normalizedUtilities;

    if (listingType === 'rental') {
      if (normalizedUtilities.includes('heat')) {
        updatedFormData.heat = 'included';
      } else if (!data.heat) {
        updatedFormData.heat = 'tenant_pays';
      }
    }
  }

  if (data.contact_name) updatedFormData.contact_name = data.contact_name;
  if (data.contact_phone) updatedFormData.contact_phone = data.contact_phone;

  if (data.latitude !== undefined) updatedFormData.latitude = Number(data.latitude);
  if (data.longitude !== undefined) updatedFormData.longitude = Number(data.longitude);

  if (data.basement_notes) updatedFormData.basement_notes = data.basement_notes;
  if (data.tenant_notes) updatedFormData.tenant_notes = data.tenant_notes;

  console.log(`📊 Mapping Summary: ${Object.keys(updatedFormData).length} fields updated successfully`);

  console.log('========== MAPPED FORM DATA ==========');
  console.log('Fields to update:', Object.keys(updatedFormData));
  console.log('Updated form data:', JSON.stringify(updatedFormData, null, 2));
  console.log('======================================');

  return { updatedFormData, crossStreetA, crossStreetB };
}

export function validatePrice(
  listingType: string,
  callForPrice: boolean,
  price: number | null,
  askingPrice: number | null
): string | null {
  if (callForPrice) {
    return null;
  }

  if (listingType === 'rental') {
    if (price === null || price === undefined || price <= 0) {
      return "Please enter a valid monthly rent greater than $0";
    }
  } else if (listingType === 'sale') {
    if (askingPrice === null || askingPrice === undefined || askingPrice <= 0) {
      return "Please enter a valid asking price greater than $0";
    }
  }

  return null;
}
