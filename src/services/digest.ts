import { supabase } from '../config/supabase';

// Type definitions matching database schema
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
  collection_configs?: any[];
  listings_time_filter?: string;
  listings_filter_config?: Record<string, any>;
  section_by_filter?: 'bedrooms' | 'property_type' | null;
  output_format?: 'whatsapp' | 'email';
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
};
