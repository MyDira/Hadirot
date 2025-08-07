import { supabase, FooterSection, FooterContentType } from '../config/supabase';

export const footerService = {
  async getFooterSections(): Promise<FooterSection[]> {
    const { data, error } = await supabase
      .from('footer_sections')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      console.error('Error fetching footer sections:', error);
      return [];
    }

    return data || [];
  },

  async getAllFooterSections(): Promise<FooterSection[]> {
    const { data, error } = await supabase
      .from('footer_sections')
      .select('*')
      .order('sort_order');

    if (error) {
      console.error('Error fetching all footer sections:', error);
      return [];
    }

    return data || [];
  },

  async getFooterSection(sectionKey: string): Promise<FooterSection | null> {
    const { data, error } = await supabase
      .from('footer_sections')
      .select('*')
      .eq('section_key', sectionKey)
      .single();

    if (error) {
      console.error(`Error fetching footer section ${sectionKey}:`, error);
      return null;
    }

    return data;
  },

  async createFooterSection(sectionData: {
    section_key: string;
    title: string;
    content_type: FooterContentType;
    content_data: any;
    sort_order?: number;
  }): Promise<FooterSection | null> {
    const { data, error } = await supabase
      .from('footer_sections')
      .insert({
        section_key: sectionData.section_key,
        title: sectionData.title,
        content_type: sectionData.content_type,
        content_data: sectionData.content_data,
        sort_order: sectionData.sort_order || 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating footer section:', error);
      throw error;
    }

    return data;
  },

  async updateFooterSection(id: string, updates: {
    title?: string;
    content_data?: any;
    sort_order?: number;
    is_active?: boolean;
  }): Promise<FooterSection | null> {
    const { data, error } = await supabase
      .from('footer_sections')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating footer section:', error);
      throw error;
    }

    return data;
  },

  async deleteFooterSection(id: string): Promise<void> {
    const { error } = await supabase
      .from('footer_sections')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting footer section:', error);
      throw error;
    }
  },

  async reorderFooterSections(sections: { id: string; sort_order: number }[]): Promise<void> {
    const updates = sections.map(section => 
      supabase
        .from('footer_sections')
        .update({ sort_order: section.sort_order })
        .eq('id', section.id)
    );

    const results = await Promise.all(updates);
    
    for (const result of results) {
      if (result.error) {
        console.error('Error reordering footer sections:', result.error);
        throw result.error;
      }
    }
  }
};