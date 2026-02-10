// Type definitions for the enhanced digest system

export type DigestTemplateType =
  | 'unsent_only'
  | 'recent_by_category'
  | 'filter_links'
  | 'custom_query'
  | 'mixed_layout'
  | 'all_active';

export type DigestSortOption =
  | 'newest_first'
  | 'price_asc'
  | 'price_desc'
  | 'featured_first';

export interface FilterConfig {
  bedrooms?: number[];
  price_min?: number;
  price_max?: number;
  locations?: string[];
  property_types?: string[];
  broker_fee?: boolean;
  date_range_days?: number;
  parking?: string;
  lease_length?: string;
}

export interface CategoryLimits {
  studio?: number;
  '1bed'?: number;
  '2bed'?: number;
  '3bed'?: number;
  '4plus'?: number;
  [key: string]: number | undefined;
}

export interface DigestTemplate {
  id: string;
  name: string;
  description?: string;
  template_type: DigestTemplateType;
  filter_config: FilterConfig;
  category_limits: CategoryLimits;
  sort_preference: DigestSortOption;
  allow_resend: boolean;
  resend_after_days: number;
  ignore_send_history: boolean;
  subject_template: string;
  include_filter_links: boolean;
  filter_preset_ids: string[];
  created_by?: string;
  is_default: boolean;
  usage_count: number;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
}

export interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  category: string;
  filter_params: Record<string, any>;
  display_label: string;
  display_order: number;
  short_code?: string;
  usage_count: number;
  last_used_at?: string;
  created_by?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Listing {
  id: string;
  title: string;
  price: number | null;
  call_for_price: boolean;
  bedrooms: number;
  bathrooms: number;
  parking: string;
  broker_fee: boolean;
  location: string;
  cross_streets: string | null;
  neighborhood: string | null;
  property_type: string;
  lease_length: string;
  is_featured: boolean;
  additional_rooms: number | null;
  created_at: string;
  updated_at: string;
  owner: {
    full_name: string;
    role: string;
    agency: string | null;
  };
}

export interface FilterLinkWithCount {
  preset_id: string;
  label: string;
  count: number;
  url: string;
  short_url?: string;
}

export interface DigestRequestBody {
  template_id?: string;
  template_config?: Partial<DigestTemplate>;
  dry_run?: boolean;
  force?: boolean;
  recipient_emails?: string[];
}

export interface DigestResponse {
  success: boolean;
  dry_run?: boolean;
  listingCount: number;
  adminCount: number;
  template_name?: string;
  template_type?: DigestTemplateType;
  listings_by_category?: Record<string, number>;
  filter_links?: FilterLinkWithCount[];
  digest_send_id?: string;
  message?: string;
}

export interface CategoryGroup {
  label: string;
  key: string;
  listings: Listing[];
  limit?: number;
}
