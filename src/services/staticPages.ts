import { supabase } from '../config/supabase';

export interface StaticPage {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}

export const staticPagesService = {
  async getStaticPage(id: string): Promise<StaticPage | null> {
    const { data, error } = await supabase
      .from('static_pages')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error(`Error fetching static page ${id}:`, error);
      return null;
    }

    return data;
  },

  async updateStaticPage(id: string, updates: { title?: string; content?: string }): Promise<StaticPage | null> {
    const { data, error } = await supabase
      .from('static_pages')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`Error updating static page ${id}:`, error);
      throw error;
    }

    return data;
  },

  async getAllStaticPages(): Promise<StaticPage[]> {
    const { data, error } = await supabase
      .from('static_pages')
      .select('*')
      .order('id');

    if (error) {
      console.error('Error fetching all static pages:', error);
      return [];
    }

    return data || [];
  }

  ,

  async createStaticPage(pageData: { id: string; title: string; content: string }): Promise<StaticPage | null> {
    const { data, error } = await supabase
      .from('static_pages')
      .insert({
        id: pageData.id,
        title: pageData.title,
        content: pageData.content,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating static page:', error);
      throw error;
    }

    return data;
  },

  async deleteStaticPage(id: string): Promise<void> {
    const { error } = await supabase
      .from('static_pages')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`Error deleting static page ${id}:`, error);
      throw error;
    }
  }
};