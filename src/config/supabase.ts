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
export type PropertyType = 'apartment_building' | 'apartment_house' | 'full_house';
export type ParkingType = 'yes' | 'included' | 'optional' | 'no';
export type HeatType = 'included' | 'tenant_pays';
export type LeaseLength = 'short_term' | '1_year' | '18_months' | '2_years';

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
  max_featured_listings_per_user?: number;
  created_at: string;
  updated_at: string;
}

export interface Listing {
  id: string;
  user_id: string;
  agency_id?: string | null;
  title: string;
  description?: string;
  location: string;
  neighborhood?: string;
  bedrooms: number;
  bathrooms: number;
  floor?: number;
  price: number | null;
  call_for_price?: boolean;
  square_footage?: number;
  parking: ParkingType;
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
  owner?: Profile;
  listing_images?: ListingImage[];
  is_favorited?: boolean;
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

export interface ImpersonationSession {
  id: string;
  admin_user_id: string;
  impersonated_user_id: string;
  session_token: string;
  started_at: string;
  ended_at: string | null;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface ImpersonationAuditLog {
  id: string;
  session_id: string;
  admin_user_id: string;
  impersonated_user_id: string;
  action_type: string;
  action_details: Record<string, any>;
  page_path: string | null;
  timestamp: string;
}
