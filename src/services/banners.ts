import { supabase, HeroBanner, BannerButton } from '../config/supabase';

export interface CreateBannerInput {
  name: string;
  heading: string;
  subheading?: string;
  background_color?: string;
  text_color?: 'light' | 'dark';
  is_active?: boolean;
  display_order?: number;
}

export interface UpdateBannerInput {
  name?: string;
  heading?: string;
  subheading?: string;
  background_color?: string;
  text_color?: 'light' | 'dark';
  is_active?: boolean;
  display_order?: number;
}

export interface CreateButtonInput {
  banner_id: string;
  button_text: string;
  button_url: string;
  button_style?: 'primary' | 'secondary' | 'outline';
  icon_name?: string;
  display_order?: number;
}

export interface UpdateButtonInput {
  button_text?: string;
  button_url?: string;
  button_style?: 'primary' | 'secondary' | 'outline';
  icon_name?: string;
  display_order?: number;
}

class BannersService {
  async getActiveBanners(): Promise<HeroBanner[]> {
    const { data, error } = await supabase
      .from('hero_banners')
      .select(`
        *,
        buttons:banner_buttons(*)
      `)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching active banners:', error);
      throw error;
    }

    return (data || []).map(banner => ({
      ...banner,
      buttons: (banner.buttons || []).sort((a: BannerButton, b: BannerButton) => a.display_order - b.display_order)
    }));
  }

  async getAllBanners(): Promise<HeroBanner[]> {
    const { data, error } = await supabase
      .from('hero_banners')
      .select(`
        *,
        buttons:banner_buttons(*)
      `)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching all banners:', error);
      throw error;
    }

    return (data || []).map(banner => ({
      ...banner,
      buttons: (banner.buttons || []).sort((a: BannerButton, b: BannerButton) => a.display_order - b.display_order)
    }));
  }

  async getBannerById(id: string): Promise<HeroBanner | null> {
    const { data, error } = await supabase
      .from('hero_banners')
      .select(`
        *,
        buttons:banner_buttons(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching banner:', error);
      throw error;
    }

    if (!data) return null;

    return {
      ...data,
      buttons: (data.buttons || []).sort((a: BannerButton, b: BannerButton) => a.display_order - b.display_order)
    };
  }

  async createBanner(input: CreateBannerInput): Promise<HeroBanner> {
    const { data, error } = await supabase
      .from('hero_banners')
      .insert({
        ...input,
        background_color: input.background_color || '#273140',
        text_color: input.text_color || 'light',
        is_active: input.is_active !== undefined ? input.is_active : false,
        display_order: input.display_order || 0,
        is_default: false,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating banner:', error);
      throw error;
    }

    return data;
  }

  async updateBanner(id: string, input: UpdateBannerInput): Promise<void> {
    const { error } = await supabase
      .from('hero_banners')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error updating banner:', error);
      throw error;
    }
  }

  async deleteBanner(id: string): Promise<void> {
    const { error } = await supabase
      .from('hero_banners')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting banner:', error);
      throw error;
    }
  }

  async createButton(input: CreateButtonInput): Promise<BannerButton> {
    const { data, error } = await supabase
      .from('banner_buttons')
      .insert({
        ...input,
        button_style: input.button_style || 'primary',
        display_order: input.display_order || 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating button:', error);
      throw error;
    }

    return data;
  }

  async updateButton(id: string, input: UpdateButtonInput): Promise<void> {
    const { error } = await supabase
      .from('banner_buttons')
      .update(input)
      .eq('id', id);

    if (error) {
      console.error('Error updating button:', error);
      throw error;
    }
  }

  async deleteButton(id: string): Promise<void> {
    const { error } = await supabase
      .from('banner_buttons')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting button:', error);
      throw error;
    }
  }

  async deleteButtonsByBannerId(bannerId: string): Promise<void> {
    const { error } = await supabase
      .from('banner_buttons')
      .delete()
      .eq('banner_id', bannerId);

    if (error) {
      console.error('Error deleting buttons:', error);
      throw error;
    }
  }
}

export const bannersService = new BannersService();
