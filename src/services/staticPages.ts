import { supabase } from '@/config/supabase';

export type StaticPage = {
  id: string;
  slug: string;
  title: string;
  content: string; // HTML
  published: boolean;
  created_at?: string;
  updated_at?: string;
};

async function getStaticPage(slug: string): Promise<StaticPage | null> {
  const { data, error, status } = await supabase
    .from('static_pages')
    .select('id, slug, title, content, published')
    .eq('slug', slug)
    .eq('published', true)
    .single();

  if (status === 404 || status === 406) return null;
  if (error) {
    console.error('[staticPagesService.getStaticPage] error', error);
    return null;
  }
  return data;
}

async function updateStaticPage(id: string, updates: { title?: string; content?: string; slug?: string; published?: boolean }): Promise<StaticPage | null> {
  const { data, error } = await supabase
    .from('static_pages')
    .update(updates)
    .eq('id', id)
    .select('id, slug, title, content, published')
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
    .select('id, slug, title, content, published')
    .order('id');

  if (error) {
    console.error('Error fetching all static pages:', error);
    return [];
  }

  return data || [];
}

async function createStaticPage(pageData: { id: string; slug: string; title: string; content: string; published?: boolean }): Promise<StaticPage | null> {
  const { data, error } = await supabase
    .from('static_pages')
    .insert({
      id: pageData.id,
      slug: pageData.slug,
      title: pageData.title,
      content: pageData.content,
      published: pageData.published ?? false,
    })
    .select('id, slug, title, content, published')
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
