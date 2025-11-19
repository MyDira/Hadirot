import { supabase } from '../config/supabase';

export interface DigestGlobalSettings {
  id: string;
  default_header_text: string;
  default_footer_text: string;
  whatsapp_character_limit: number;
  updated_at: string;
  updated_by?: string;
  created_at: string;
}

class DigestGlobalSettingsService {
  private cache: DigestGlobalSettings | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async getSettings(): Promise<DigestGlobalSettings> {
    // Check cache first
    if (this.cache && Date.now() < this.cacheExpiry) {
      return this.cache;
    }

    // Fetch from database
    const { data, error } = await supabase
      .from('digest_global_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching global digest settings:', error);
      throw new Error(`Failed to fetch global settings: ${error.message}`);
    }

    // If no settings exist, create default
    if (!data) {
      return this.createDefaultSettings();
    }

    // Update cache
    this.cache = data;
    this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;

    return data;
  }

  async updateSettings(updates: Partial<DigestGlobalSettings>): Promise<DigestGlobalSettings> {
    const { data: { user } } = await supabase.auth.getUser();

    // First, get the current settings to get the ID
    const current = await this.getSettings();

    const { data, error } = await supabase
      .from('digest_global_settings')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      })
      .eq('id', current.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating global digest settings:', error);
      throw new Error(`Failed to update global settings: ${error.message}`);
    }

    // Clear cache to force refresh
    this.clearCache();

    return data;
  }

  private async createDefaultSettings(): Promise<DigestGlobalSettings> {
    const { data: { user } } = await supabase.auth.getUser();

    const defaultSettings = {
      default_header_text: 'Here are the latest apartments posted on Hadirot:',
      default_footer_text: 'Join the Hadirot WhatsApp Community:\nhttps://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt',
      whatsapp_character_limit: 4000,
      updated_by: user?.id,
    };

    const { data, error } = await supabase
      .from('digest_global_settings')
      .insert(defaultSettings)
      .select()
      .single();

    if (error) {
      console.error('Error creating default global settings:', error);
      throw new Error(`Failed to create default settings: ${error.message}`);
    }

    // Update cache
    this.cache = data;
    this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;

    return data;
  }

  clearCache(): void {
    this.cache = null;
    this.cacheExpiry = 0;
  }

  async resetToDefaults(): Promise<DigestGlobalSettings> {
    return this.updateSettings({
      default_header_text: 'Here are the latest apartments posted on Hadirot:',
      default_footer_text: 'Join the Hadirot WhatsApp Community:\nhttps://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt',
      whatsapp_character_limit: 4000,
    });
  }
}

export const digestGlobalSettingsService = new DigestGlobalSettingsService();
