import { supabase } from '@/config/supabase';

export interface StaticPage {
  id: string;
  title: string;
  content: string;
  updated_at?: string;
}

async function getStaticPage(id: string): Promise<StaticPage | null> {
  const { data, error, status } = await supabase
    .from('static_pages')
    .select('id, title, content, updated_at')
    .eq('id', id)
    .single();

  if (status === 404 || status === 406) return null;
  if (error) {
    console.error(`[staticPagesService.getStaticPage] ${id}`, error);
    return null;
  }
  return data;
}

async function updateStaticPage(
  id: string,
  updates: { title?: string; content?: string }
): Promise<StaticPage | null> {
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
}

async function getAllStaticPages(): Promise<StaticPage[]> {
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

async function createStaticPage(pageData: {
  id: string;
  title: string;
  content: string;
}): Promise<StaticPage | null> {
  const { data, error } = await supabase
    .from('static_pages')
    .insert({
      id: pageData.id,
      title: pageData.title,
      content: pageData.content,
      slug: pageData.id,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error creating static page:', error);
    throw error;
  }

  return data;
}

async function deleteStaticPage(id: string): Promise<void> {
  const { error } = await supabase
    .from('static_pages')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(`Error deleting static page ${id}:`, error);
    throw error;
  }
}

export const staticPagesService = {
  getStaticPage,
  updateStaticPage,
  getAllStaticPages,
  createStaticPage,
  deleteStaticPage,
};

