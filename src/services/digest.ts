import { supabase } from '../config/supabase';

// Type definitions matching database schema
export interface CollectionConfig {
  id: string;
  enabled: boolean;
  label: string;
  filters: Record<string, any>;
  cta_format: string;
  order: number;
}

export interface ListingGroup {
  id: string;
  enabled: boolean;
  limit: number;
  filters: Record<string, any>;
  time_filter: string;
}

export interface DigestTemplate {
  id: string;
  name: string;
  description?: string;
  template_type: 'unsent_only' | 'recent_by_category' | 'filter_links' | 'custom_query' | 'mixed_layout' | 'all_active';
  filter_config: Record<string, any>;
  category_limits: Record<string, number>;
  sort_preference: 'newest_first' | 'price_asc' | 'price_desc' | 'featured_first';
  allow_resend: boolean;
  resend_after_days: number;
  ignore_send_history: boolean;
  subject_template: string;
  include_filter_links: boolean;
  filter_preset_ids: string[];
  whatsapp_intro_text?: string;
  whatsapp_outro_text?: string;
  include_collections?: boolean;
  collection_configs?: CollectionConfig[];
  listings_time_filter?: string;
  listings_filter_config?: Record<string, any>;
  section_by_filter?: 'bedrooms' | 'property_type' | null;
  output_format?: 'whatsapp' | 'email';
  use_global_header?: boolean;
  use_global_footer?: boolean;
  custom_header_override?: string;
  custom_footer_override?: string;
  category?: 'marketing' | 'internal' | 'scheduled' | 'one_time';
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

export interface DigestSend {
  id: string;
  template_id?: string;
  template_name: string;
  template_type: string;
  sent_by?: string;
  recipient_emails: string[];
  recipient_count: number;
  total_listings_sent: number;
  listings_by_category: Record<string, number>;
  filter_links_included: any[];
  execution_time_ms?: number;
  success: boolean;
  error_message?: string;
  config_snapshot: any;
  sent_at: string;
  created_at: string;
}

export interface DigestResponse {
  success: boolean;
  dry_run?: boolean;
  listingCount: number;
  adminCount: number;
  template_name?: string;
  template_type?: string;
  listings_by_category?: Record<string, number>;
  filter_links?: any[];
  digest_send_id?: string;
  message?: string;
}

export const digestService = {
  // ============================================================================
  // TEMPLATES
  // ============================================================================

  async getTemplates(): Promise<DigestTemplate[]> {
    const { data, error } = await supabase
      .from('digest_templates')
      .select('*')
      .order('is_default', { ascending: false })
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('name');

    if (error) {
      console.error('Error fetching digest templates:', error);
      throw new Error(`Failed to fetch templates: ${error.message}`);
    }

    return data || [];
  },

  async getTemplate(id: string): Promise<DigestTemplate | null> {
    const { data, error } = await supabase
      .from('digest_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching digest template:', error);
      throw new Error(`Failed to fetch template: ${error.message}`);
    }

    return data;
  },

  async createTemplate(template: Partial<DigestTemplate>): Promise<DigestTemplate> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('digest_templates')
      .insert({
        ...template,
        created_by: user?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating digest template:', error);
      throw new Error(`Failed to create template: ${error.message}`);
    }

    return data;
  },

  async updateTemplate(id: string, updates: Partial<DigestTemplate>): Promise<DigestTemplate> {
    const { data, error } = await supabase
      .from('digest_templates')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating digest template:', error);
      throw new Error(`Failed to update template: ${error.message}`);
    }

    return data;
  },

  async deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase
      .from('digest_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting digest template:', error);
      throw new Error(`Failed to delete template: ${error.message}`);
    }
  },

  async duplicateTemplate(id: string, newName: string): Promise<DigestTemplate> {
    const original = await this.getTemplate(id);
    if (!original) {
      throw new Error('Template not found');
    }

    const { data: { user } } = await supabase.auth.getUser();

    const duplicate = {
      ...original,
      id: undefined as any,
      name: newName,
      created_by: user?.id,
      is_default: false,
      usage_count: 0,
      last_used_at: undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return this.createTemplate(duplicate);
  },

  // ============================================================================
  // FILTER PRESETS
  // ============================================================================

  async getFilterPresets(category?: string): Promise<FilterPreset[]> {
    let query = supabase
      .from('filter_presets')
      .select('*')
      .eq('is_active', true);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query.order('display_order').order('name');

    if (error) {
      console.error('Error fetching filter presets:', error);
      throw new Error(`Failed to fetch presets: ${error.message}`);
    }

    return data || [];
  },

  async getFilterPreset(id: string): Promise<FilterPreset | null> {
    const { data, error } = await supabase
      .from('filter_presets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching filter preset:', error);
      throw new Error(`Failed to fetch preset: ${error.message}`);
    }

    return data;
  },

  async createFilterPreset(preset: Partial<FilterPreset>): Promise<FilterPreset> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('filter_presets')
      .insert({
        ...preset,
        created_by: user?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating filter preset:', error);
      throw new Error(`Failed to create preset: ${error.message}`);
    }

    return data;
  },

  async updateFilterPreset(id: string, updates: Partial<FilterPreset>): Promise<FilterPreset> {
    const { data, error } = await supabase
      .from('filter_presets')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating filter preset:', error);
      throw new Error(`Failed to update preset: ${error.message}`);
    }

    return data;
  },

  async deleteFilterPreset(id: string): Promise<void> {
    const { error } = await supabase
      .from('filter_presets')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting filter preset:', error);
      throw new Error(`Failed to delete preset: ${error.message}`);
    }
  },

  // ============================================================================
  // SENDING DIGESTS
  // ============================================================================

  async sendDigest(params: {
    template_id?: string;
    template_config?: Partial<DigestTemplate>;
    dry_run?: boolean;
    recipient_emails?: string[];
  }): Promise<DigestResponse> {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase.functions.invoke('send-enhanced-digest', {
      body: params,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      console.error('Error sending digest:', error);
      throw new Error(`Failed to send digest: ${error.message}`);
    }

    return data as DigestResponse;
  },

  // ============================================================================
  // HISTORY
  // ============================================================================

  async getDigestHistory(filters?: {
    startDate?: string;
    endDate?: string;
    templateId?: string;
    limit?: number;
  }): Promise<DigestSend[]> {
    let query = supabase
      .from('digest_sends')
      .select('*')
      .order('sent_at', { ascending: false });

    if (filters?.startDate) {
      query = query.gte('sent_at', filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte('sent_at', filters.endDate);
    }

    if (filters?.templateId) {
      query = query.eq('template_id', filters.templateId);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching digest history:', error);
      throw new Error(`Failed to fetch history: ${error.message}`);
    }

    return data || [];
  },

  async getDigestSendDetails(sendId: string): Promise<DigestSend | null> {
    const { data, error } = await supabase
      .from('digest_sends')
      .select('*')
      .eq('id', sendId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching digest send details:', error);
      throw new Error(`Failed to fetch send details: ${error.message}`);
    }

    return data;
  },

  async getDigestSentListings(digestSendId: string) {
    const { data, error } = await supabase
      .from('digest_sent_listings')
      .select(`
        *,
        listing:listings(id, title, price, bedrooms, location)
      `)
      .eq('digest_send_id', digestSendId);

    if (error) {
      console.error('Error fetching sent listings:', error);
      throw new Error(`Failed to fetch sent listings: ${error.message}`);
    }

    return data || [];
  },

  // ============================================================================
  // COLLECTION LINK HELPERS
  // ============================================================================

  async getCollectionCount(filters: Record<string, any>): Promise<number> {
    try {
      let query = supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('approved', true)
        .eq('is_active', true);

      // Apply filters
      if (filters.bedrooms !== undefined) {
        if (Array.isArray(filters.bedrooms)) {
          query = query.in('bedrooms', filters.bedrooms);
        } else {
          query = query.eq('bedrooms', filters.bedrooms);
        }
      }

      if (filters.property_type) {
        if (Array.isArray(filters.property_type)) {
          query = query.in('property_type', filters.property_type);
        } else {
          query = query.eq('property_type', filters.property_type);
        }
      }

      if (filters.price_min !== undefined) {
        query = query.gte('price', filters.price_min);
      }

      if (filters.price_max !== undefined) {
        query = query.lte('price', filters.price_max);
      }

      if (filters.broker_fee !== undefined) {
        query = query.eq('broker_fee', filters.broker_fee);
      }

      if (filters.parking !== undefined) {
        query = query.eq('parking', filters.parking);
      }

      if (filters.location) {
        if (Array.isArray(filters.location)) {
          query = query.in('location', filters.location);
        } else {
          query = query.eq('location', filters.location);
        }
      }

      if (filters.neighborhood) {
        if (Array.isArray(filters.neighborhood)) {
          query = query.in('neighborhood', filters.neighborhood);
        } else {
          query = query.eq('neighborhood', filters.neighborhood);
        }
      }

      const { count } = await query;
      return count || 0;
    } catch (error) {
      console.error('Error getting collection count:', error);
      return 0;
    }
  },

  formatCollectionCount(count: number): string {
    if (count < 10) {
      return count.toString();
    }
    const rounded = Math.round(count / 5) * 5;
    return `${rounded}+`;
  },

  formatCollectionCTA(template: string, label: string, count: number): string {
    const formattedCount = this.formatCollectionCount(count);
    return template
      .replace('{count}', formattedCount)
      .replace('{label}', label);
  },

  // ============================================================================
  // LISTING GROUP HELPERS
  // ============================================================================

  async fetchListingsByGroup(group: ListingGroup): Promise<any[]> {
    try {
      let query = supabase
        .from('listings')
        .select(`
          *,
          owner:profiles!listings_user_id_fkey(full_name, agency),
          short_url:short_urls!short_urls_listing_id_fkey(short_code)
        `)
        .eq('approved', true)
        .eq('is_active', true);

      // Apply time filter
      if (group.time_filter && group.time_filter !== 'all') {
        const hours = {
          '24h': 24,
          '48h': 48,
          '3d': 72,
          '7d': 168,
          '14d': 336,
          '30d': 720
        }[group.time_filter] || 0;

        if (hours > 0) {
          const cutoffDate = new Date();
          cutoffDate.setHours(cutoffDate.getHours() - hours);
          query = query.gte('created_at', cutoffDate.toISOString());
        }
      }

      // Apply filters
      const filters = group.filters;

      // Listing type filter (rental, sale, or undefined for both)
      if (filters.listing_type) {
        query = query.eq('listing_type', filters.listing_type);
      }

      if (filters.bedrooms !== undefined) {
        if (Array.isArray(filters.bedrooms)) {
          query = query.in('bedrooms', filters.bedrooms);
        } else {
          query = query.eq('bedrooms', filters.bedrooms);
        }
      }

      if (filters.property_type) {
        if (Array.isArray(filters.property_type)) {
          query = query.in('property_type', filters.property_type);
        } else {
          query = query.eq('property_type', filters.property_type);
        }
      }

      // Price filters - handle both rental (price) and sale (asking_price) listings
      if (filters.price_min !== undefined) {
        if (filters.listing_type === 'sale') {
          query = query.gte('asking_price', filters.price_min);
        } else if (filters.listing_type === 'rental') {
          query = query.gte('price', filters.price_min);
        } else {
          // If no listing_type specified, filter on both fields (OR condition via filter)
          query = query.or(`price.gte.${filters.price_min},asking_price.gte.${filters.price_min}`);
        }
      }

      if (filters.price_max !== undefined) {
        if (filters.listing_type === 'sale') {
          query = query.lte('asking_price', filters.price_max);
        } else if (filters.listing_type === 'rental') {
          query = query.lte('price', filters.price_max);
        } else {
          // If no listing_type specified, filter on both fields (OR condition via filter)
          query = query.or(`price.lte.${filters.price_max},asking_price.lte.${filters.price_max}`);
        }
      }

      if (filters.broker_fee !== undefined) {
        query = query.eq('broker_fee', filters.broker_fee);
      }

      if (filters.parking !== undefined && filters.parking !== null && filters.parking !== '') {
        query = query.eq('parking', filters.parking);
      }

      if (filters.location) {
        if (Array.isArray(filters.location)) {
          query = query.in('location', filters.location);
        } else {
          query = query.eq('location', filters.location);
        }
      }

      if (filters.neighborhood) {
        if (Array.isArray(filters.neighborhood)) {
          query = query.in('neighborhood', filters.neighborhood);
        } else {
          query = query.eq('neighborhood', filters.neighborhood);
        }
      }

      // Order by newest first and limit
      query = query.order('created_at', { ascending: false });
      query = query.limit(group.limit || 20);

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching listings by group:', error);
      return [];
    }
  },

  // ============================================================================
  // SHORT URL HELPERS
  // ============================================================================

  async createShortUrlForListing(listingId: string, source: string = 'whatsapp_digest'): Promise<string | null> {
    try {
      const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://hadirot.com';
      const originalUrl = `${siteUrl}/listing/${listingId}`;

      const { data: shortCode, error } = await supabase.rpc('create_short_url', {
        p_listing_id: listingId,
        p_original_url: originalUrl,
        p_source: source,
        p_expires_days: 90
      });

      if (error) {
        console.error('Error creating short URL:', error);
        return null;
      }

      return shortCode as string;
    } catch (error) {
      console.error('Exception creating short URL:', error);
      return null;
    }
  },

  async ensureListingsHaveShortUrls(listings: any[], source: string = 'whatsapp_digest'): Promise<any[]> {
    const listingsWithShortUrls = await Promise.all(
      listings.map(async (listing) => {
        // Check if listing already has a short_url
        let shortCode = null;

        if (listing.short_url) {
          // short_url might be an array or object from the relationship
          if (Array.isArray(listing.short_url) && listing.short_url.length > 0) {
            shortCode = listing.short_url[0]?.short_code;
          } else if (typeof listing.short_url === 'object') {
            shortCode = listing.short_url.short_code;
          }
        }

        // If no short URL exists, create one
        if (!shortCode) {
          shortCode = await this.createShortUrlForListing(listing.id, source);
        }

        // Return listing with short_code attached
        return {
          ...listing,
          short_code: shortCode
        };
      })
    );

    return listingsWithShortUrls;
  },

  // ============================================================================
  // VALIDATION HELPERS
  // ============================================================================

  validateCollectionConfigs(configs: CollectionConfig[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (configs.length > 20) {
      errors.push('Maximum 20 collection links allowed');
    }

    configs.forEach((config, index) => {
      if (!config.label || config.label.trim() === '') {
        errors.push(`Collection ${index + 1}: Label is required`);
      }
      if (!config.cta_format || config.cta_format.trim() === '') {
        errors.push(`Collection ${index + 1}: CTA format is required`);
      }
      if (!config.filters || Object.keys(config.filters).length === 0) {
        errors.push(`Collection ${index + 1}: At least one filter is required`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  },

  validateListingGroups(groups: ListingGroup[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    groups.forEach((group, index) => {
      if (!group.limit || group.limit < 1) {
        errors.push(`Group ${index + 1}: Limit must be at least 1`);
      }
      if (group.limit > 50) {
        errors.push(`Group ${index + 1}: Limit cannot exceed 50`);
      }
      if (!group.filters || Object.keys(group.filters).length === 0) {
        errors.push(`Group ${index + 1}: At least one filter is required`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  },
};
