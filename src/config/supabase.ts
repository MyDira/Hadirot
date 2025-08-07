import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'tenant' | 'landlord' | 'agent';
export type PropertyType = 'apartment_building' | 'apartment_house' | 'full_house';
export type ParkingType = 'yes' | 'included' | 'optional' | 'no';
export type HeatType = 'included' | 'tenant_pays';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  agency?: string;
  is_admin: boolean;
  is_banned?: boolean;
  can_feature_listings?: boolean;
  max_featured_listings_per_user?: number;
  is_banned?: boolean;
  max_featured_listings_per_user?: number;
  created_at: string;
  updated_at: string;
}

export interface Listing {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  location: string;
  neighborhood?: string;
  bedrooms: number;
  bathrooms: number;
  floor?: number;
  price: number;
  square_footage?: number;
  parking: ParkingType;
  washer_dryer_hookup: boolean;
  dishwasher: boolean;
  lease_length?: string;
  heat: HeatType;
  property_type: PropertyType;
  contact_name: string;
  contact_phone: string;
  is_featured: boolean;
  featured_until?: string;
  is_active: boolean;
  views: number;
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