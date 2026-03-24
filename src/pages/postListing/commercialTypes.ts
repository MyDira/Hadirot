import type {
  CommercialSpaceType,
  CommercialSubtype,
  LeaseType,
  BuildOutCondition,
  BuildingClass,
  TenancyType,
} from '../../config/supabase';

export interface CommercialListingFormData {
  listing_type: 'rental' | 'sale' | '';
  commercial_space_type: CommercialSpaceType | '';
  commercial_subtype: CommercialSubtype | null;
  title: string;
  description: string;
  available_sf: number | null;
  price: number | null;
  asking_price: number | null;
  price_per_sf_year: number | null;
  call_for_price: boolean;
  lease_type: LeaseType | null;
  build_out_condition: BuildOutCondition | null;
  floor_level: string;
  ceiling_height_ft: number | null;
  frontage_ft: number | null;
  clear_height_ft: number | null;
  loading_docks: number | null;
  drive_in_doors: number | null;
  building_class: BuildingClass | null;
  exam_rooms: number | null;
  kitchen_exhaust: boolean;
  grease_trap: boolean;
  corner_location: boolean;
  three_phase_power: boolean;
  private_offices: number | null;
  ada_accessible: boolean;
  separate_entrance: boolean;
  previous_use: string;
  seating_capacity: number | null;
  gas_line: boolean;
  total_building_sf: number | null;
  construction_type: string;
  parking_spaces: number | null;
  parking_type: string;
  parking_ratio: string;
  signage_rights: boolean;
  private_entrance: boolean;
  elevator_count: number | null;
  freight_elevator_count: number | null;
  zoning_code: string;
  sprinkler_type: string;
  electrical_amps: number | null;
  electrical_voltage: string;
  rail_access: boolean;
  column_spacing: string;
  hvac_type: string;
  foot_traffic_vpd: number | null;
  liquor_license_transferable: boolean;
  conference_rooms: number | null;
  capacity_min: number | null;
  capacity_max: number | null;
  layout_type: string;
  plumbing_wet_columns: boolean;
  waiting_room: boolean;
  natural_light: boolean;
  ventilation: boolean;
  moisture_waterproofing: boolean;
  outdoor_space: string;
  permitted_uses_commercial: string;
  use_restrictions: string;
  occupancy_limit: number | null;
  office_warehouse_ratio: string;
  floor_load_capacity: string;
  truck_court_depth: string;
  crane_capacity: string;
  use_breakdown: string;
  current_rental_income: number | null;
  year_built: number | null;
  year_renovated: number | null;
  number_of_floors: number | null;
  unit_count: number | null;
  lease_term_text: string;
  cam_per_sf: number | null;
  expense_stop_per_sf: number | null;
  ti_allowance_per_sf: number | null;
  renewal_options: string;
  escalation: string;
  sublease: boolean;
  security_deposit: string;
  available_date: string;
  cap_rate: number | null;
  noi: number | null;
  property_taxes_annual: number | null;
  tenancy_type: TenancyType | null;
  current_lease_tenant: string;
  current_lease_expiration: string;
  current_lease_rent: number | null;
  video_url: string;
  contact_name: string;
  contact_phone: string;
  full_address: string;
  cross_street_a: string;
  cross_street_b: string;
  neighborhood: string;
  latitude: number | null;
  longitude: number | null;
  city: string;
  state: string;
  zip_code: string;
  unit_number: string;
  is_featured: boolean;
  terms_agreed: boolean;
}

export const INITIAL_COMMERCIAL_FORM_DATA: CommercialListingFormData = {
  listing_type: '',
  commercial_space_type: '',
  commercial_subtype: null,
  title: '',
  description: '',
  available_sf: null,
  price: null,
  asking_price: null,
  price_per_sf_year: null,
  call_for_price: false,
  lease_type: null,
  build_out_condition: null,
  floor_level: '',
  ceiling_height_ft: null,
  frontage_ft: null,
  clear_height_ft: null,
  loading_docks: null,
  drive_in_doors: null,
  building_class: null,
  exam_rooms: null,
  kitchen_exhaust: false,
  grease_trap: false,
  corner_location: false,
  three_phase_power: false,
  private_offices: null,
  ada_accessible: false,
  separate_entrance: false,
  previous_use: '',
  seating_capacity: null,
  gas_line: false,
  total_building_sf: null,
  construction_type: '',
  parking_spaces: null,
  parking_type: '',
  parking_ratio: '',
  signage_rights: false,
  private_entrance: false,
  elevator_count: null,
  freight_elevator_count: null,
  zoning_code: '',
  sprinkler_type: '',
  electrical_amps: null,
  electrical_voltage: '',
  rail_access: false,
  column_spacing: '',
  hvac_type: '',
  foot_traffic_vpd: null,
  liquor_license_transferable: false,
  conference_rooms: null,
  capacity_min: null,
  capacity_max: null,
  layout_type: '',
  plumbing_wet_columns: false,
  waiting_room: false,
  natural_light: false,
  ventilation: false,
  moisture_waterproofing: false,
  outdoor_space: '',
  permitted_uses_commercial: '',
  use_restrictions: '',
  occupancy_limit: null,
  office_warehouse_ratio: '',
  floor_load_capacity: '',
  truck_court_depth: '',
  crane_capacity: '',
  use_breakdown: '',
  current_rental_income: null,
  year_built: null,
  year_renovated: null,
  number_of_floors: null,
  unit_count: null,
  lease_term_text: '',
  cam_per_sf: null,
  expense_stop_per_sf: null,
  ti_allowance_per_sf: null,
  renewal_options: '',
  escalation: '',
  sublease: false,
  security_deposit: '',
  available_date: '',
  cap_rate: null,
  noi: null,
  property_taxes_annual: null,
  tenancy_type: null,
  current_lease_tenant: '',
  current_lease_expiration: '',
  current_lease_rent: null,
  video_url: '',
  contact_name: '',
  contact_phone: '',
  full_address: '',
  cross_street_a: '',
  cross_street_b: '',
  neighborhood: '',
  latitude: null,
  longitude: null,
  city: 'Brooklyn',
  state: 'NY',
  zip_code: '',
  unit_number: '',
  is_featured: false,
  terms_agreed: false,
};
