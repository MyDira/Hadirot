import type {
  PropertyType,
  ParkingType,
  HeatType,
  LeaseLength,
  ACType,
  ListingType,
  PropertyCondition,
  OccupancyStatus,
  DeliveryCondition,
  BasementType,
  LaundryType,
  BuildingType,
  RentRollUnit,
  HeatingType,
} from "../../config/supabase";

export interface ListingFormData {
  listing_type: ListingType | '';
  title: string;
  description: string;
  location: string;
  neighborhood: string;
  bedrooms: number;
  bathrooms: number;
  floor?: number;
  price: number | null;
  call_for_price: boolean;
  asking_price?: number | null;
  property_age?: number | null;
  year_built?: number | null;
  year_renovated?: number | null;
  hoa_fees?: number | null;
  property_taxes?: number | null;
  lot_size_sqft?: number | null;
  property_length_ft?: number | null;
  property_width_ft?: number | null;
  square_footage?: number;
  building_size_sqft?: number | null;
  building_length_ft?: number | null;
  building_width_ft?: number | null;
  unit_count?: number | null;
  number_of_floors?: number | null;
  parking: ParkingType;
  washer_dryer_hookup: boolean;
  dishwasher: boolean;
  lease_length?: LeaseLength | null;
  heat: HeatType;
  heating_type?: HeatingType | null;
  property_type: PropertyType | '';
  building_type?: BuildingType | '';
  contact_name: string;
  contact_phone: string;
  is_featured: boolean;
  broker_fee: boolean;
  ac_type?: ACType | null;
  apartment_conditions: string[];
  additional_rooms: number;
  property_condition?: PropertyCondition | '';
  occupancy_status?: OccupancyStatus | '';
  delivery_condition?: DeliveryCondition | '';
  outdoor_space: string[];
  interior_features: string[];
  laundry_type?: LaundryType | '';
  basement_type?: BasementType | '';
  basement_notes?: string;
  rent_roll_total?: number | null;
  rent_roll_data: RentRollUnit[];
  utilities_included: string[];
  tenant_notes?: string;
  street_address?: string;
  unit_number?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  lot_size_input_mode: 'sqft' | 'dimensions';
  building_size_input_mode: 'sqft' | 'dimensions';
  terms_agreed: boolean;
  latitude: number | null;
  longitude: number | null;
}

export const INITIAL_FORM_DATA: ListingFormData = {
  listing_type: "",
  title: "",
  description: "",
  location: "",
  neighborhood: "",
  bedrooms: 1,
  bathrooms: 1,
  floor: undefined,
  price: null,
  call_for_price: false,
  asking_price: null,
  property_age: undefined,
  year_built: undefined,
  year_renovated: undefined,
  hoa_fees: undefined,
  property_taxes: undefined,
  lot_size_sqft: undefined,
  property_length_ft: undefined,
  property_width_ft: undefined,
  square_footage: undefined,
  building_size_sqft: undefined,
  building_length_ft: undefined,
  building_width_ft: undefined,
  unit_count: undefined,
  number_of_floors: undefined,
  parking: "no",
  washer_dryer_hookup: false,
  dishwasher: false,
  lease_length: null,
  heat: "tenant_pays",
  heating_type: null,
  property_type: "",
  building_type: "",
  contact_name: "",
  contact_phone: "",
  is_featured: false,
  broker_fee: false,
  ac_type: null,
  apartment_conditions: [],
  additional_rooms: 0,
  property_condition: "",
  occupancy_status: "",
  delivery_condition: "",
  outdoor_space: [],
  interior_features: [],
  laundry_type: "",
  basement_type: "",
  basement_notes: "",
  rent_roll_total: null,
  rent_roll_data: [],
  utilities_included: [],
  tenant_notes: "",
  street_address: "",
  unit_number: "",
  city: "Brooklyn",
  state: "NY",
  zip_code: "",
  lot_size_input_mode: 'sqft',
  building_size_input_mode: 'sqft',
  terms_agreed: false,
  latitude: null,
  longitude: null,
};
