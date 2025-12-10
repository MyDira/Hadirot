import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseFunctionDomain = import.meta.env.VITE_SUPABASE_FUNCTION_DOMAIN;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  functions: supabaseFunctionDomain && supabaseFunctionDomain.trim() ? {
    url: `https://${supabaseFunctionDomain}`
  } : undefined
});

export type UserRole = 'tenant' | 'landlord' | 'agent';
export type PropertyType = 'apartment_building' | 'apartment_house' | 'full_house' | 'duplex' | 'basement' | 'detached_house' | 'semi_attached_house' | 'fully_attached_townhouse' | 'condo' | 'co_op';
export type ParkingType = 'yes' | 'included' | 'optional' | 'no' | 'carport';
export type HeatType = 'included' | 'tenant_pays';
export type LeaseLength = 'short_term' | '1_year' | '18_months' | '2_years';
export type ACType = 'central' | 'split_unit' | 'window';
export type ApartmentCondition = 'modern' | 'renovated' | 'large_rooms' | 'high_ceilings' | 'large_closets';
export type ListingType = 'rental' | 'sale';
export type PermissionRequestStatus = 'pending' | 'approved' | 'denied';
export type DrivewayStatus = 'private' | 'easement' | 'shared' | 'carport' | 'none';
export type HeatingType = 'forced_air' | 'radiator' | 'baseboard' | 'heat_pump' | 'other';
export type CoolingType = 'central_ac' | 'split_units' | 'window_units' | 'none';
export type PropertyCondition = 'excellent' | 'good' | 'fair' | 'needs_work';
export type OccupancyStatus = 'owner_occupied' | 'tenant_occupied' | 'vacant';
export type DeliveryCondition = 'vacant_at_closing' | 'subject_to_lease' | 'negotiable';
export type BasementType = 'finished' | 'unfinished' | 'partially_finished' | 'walkout' | 'none';
export type LaundryType = 'in_unit' | 'hookups_only' | 'common_area' | 'none';
export type BuildingType = 'detached' | 'semi_attached' | 'fully_attached' | 'apartment';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  email?: string;
  agency?: string;
  is_admin: boolean;
  is_banned?: boolean;
  can_feature_listings?: boolean;
  can_manage_agency?: boolean;
  can_post_sales?: boolean;
  max_featured_listings_per_user?: number;
  created_at: string;
  updated_at: string;
}

export interface Listing {
  id: string;
  user_id: string;
  agency_id?: string | null;
  listing_type: ListingType;
  title: string;
  description?: string;
  location: string;
  cross_streets?: string | null;
  neighborhood: string;
  bedrooms: number;
  bathrooms: number;
  floor?: number;
  price: number | null;
  call_for_price?: boolean;
  asking_price?: number | null;
  property_age?: number | null;
  year_built?: number | null;
  hoa_fees?: number | null;
  property_taxes?: number | null;
  lot_size_sqft?: number | null;
  property_length_ft?: number | null;
  property_width_ft?: number | null;
  building_size_sqft?: number | null;
  building_length_ft?: number | null;
  building_width_ft?: number | null;
  square_footage?: number;
  parking: ParkingType;
  driveway_status?: DrivewayStatus | null;
  multi_family?: boolean;
  unit_count?: number | null;
  number_of_floors?: number | null;
  heating_type?: HeatingType | null;
  cooling_type?: CoolingType | null;
  appliances?: string[] | null;
  washer_dryer_hookup: boolean;
  dishwasher: boolean;
  broker_fee: boolean;
  lease_length?: LeaseLength | null;
  heat: HeatType;
  property_type: PropertyType;
  contact_name: string;
  contact_phone: string;
  is_featured: boolean;
  featured_until?: string;
  is_active: boolean;
  views: number;
  posted_at?: string | null;
  impressions?: number;
  direct_views?: number;
  created_at: string;
  updated_at: string;
  last_published_at: string;
  approved: boolean;
  ac_type?: ACType | null;
  apartment_conditions?: string[] | null;
  additional_rooms?: number | null;
  video_url?: string | null;
  video_thumbnail_url?: string | null;
  year_renovated?: number | null;
  property_condition?: PropertyCondition | null;
  occupancy_status?: OccupancyStatus | null;
  delivery_condition?: DeliveryCondition | null;
  outdoor_space?: string[] | null;
  interior_features?: string[] | null;
  laundry_type?: LaundryType | null;
  basement_type?: BasementType | null;
  basement_notes?: string | null;
  building_type?: BuildingType | null;
  rent_roll_total?: number | null;
  rent_roll_data?: RentRollUnit[] | null;
  utilities_included?: string[] | null;
  tenant_notes?: string | null;
  full_address?: string | null;
  owner?: Profile;
  listing_images?: ListingImage[];
  is_favorited?: boolean;
}

export interface RentRollUnit {
  unit: string;
  bedrooms: number;
  rent: number;
}

export interface ListingImage {
  id: string;
  listing_id: string;
  image_url: string;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
}

export interface TempListingImage {
  filePath: string;
  publicUrl: string;
  is_featured: boolean;
  originalName: string;
}

export interface Favorite {
  id: string;
  user_id: string;
  listing_id: string;
  created_at: string;
  listings?: Listing;
}

export type FooterContentType = 'rich_text' | 'links';

export interface FooterSection {
  id: string;
  section_key: string;
  title: string;
  content_type: FooterContentType;
  content_data: any; // JSONB data - can be rich text object or links array
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FooterRichTextData {
  tagline: string;
  description: string;
}

export interface FooterLinkData {
  text: string;
  url: string;
}

export interface Agency {
  id: string;
  name: string;
  slug: string;
  owner_profile_id: string;
  owner_profile?: Profile | null;
  logo_url?: string | null;
  banner_url?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  about_html?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModalPopup {
  id: string;
  name: string;
  heading: string;
  subheading?: string;
  additional_text_lines: string[];
  button_text: string;
  button_url: string;
  is_active: boolean;
  trigger_pages: string[];
  display_frequency: 'once_per_session' | 'once_per_day' | 'once_per_lifetime' | 'until_clicked' | 'custom_interval';
  custom_interval_hours?: number;
  delay_seconds: number;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface ModalUserInteraction {
  id: string;
  modal_id: string;
  user_fingerprint: string;
  user_id?: string;
  interaction_type: 'shown' | 'dismissed' | 'clicked';
  interaction_timestamp: string;
  session_id: string;
  page_path: string;
}

export type BannerButtonStyle = 'primary' | 'secondary' | 'outline';
export type BannerTextColor = 'light' | 'dark';

export interface HeroBanner {
  id: string;
  name: string;
  heading: string;
  subheading?: string;
  background_color: string;
  text_color: BannerTextColor;
  is_active: boolean;
  display_order: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  buttons?: BannerButton[];
}

export interface BannerButton {
  id: string;
  banner_id: string;
  button_text: string;
  button_url: string;
  button_style: BannerButtonStyle;
  icon_name?: string;
  display_order: number;
  created_at: string;
}

export interface SalesPermissionRequest {
  id: string;
  user_id: string;
  request_message: string;
  status: PermissionRequestStatus;
  requested_at: string;
  responded_at?: string;
  responded_by_admin_id?: string;
  admin_notes?: string;
  created_at: string;
  updated_at: string;
  user?: Profile;
  admin?: Profile;
}

export interface AdminSettings {
  id: string;
  max_featured_listings: number;
  featured_duration_days: number;
  sales_feature_enabled: boolean;
  sales_universal_access: boolean;
  max_featured_sales: number;
  updated_at: string;
}
