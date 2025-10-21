import { supabase } from '../config/supabase';

export interface KnowledgeBaseCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  article_count?: number;
}

export interface KnowledgeBaseArticle {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  sort_order: number;
  is_published: boolean;
  read_time_minutes: number;
  created_at: string;
  updated_at: string;
  category?: KnowledgeBaseCategory;
}

export interface ArticleFeedback {
  id: string;
  article_id: string;
  user_id?: string;
  is_helpful: boolean;
  feedback_text?: string;
  created_at: string;
}

export const knowledgeBaseService = {
  // Get all active categories with article counts
  async getCategories(): Promise<KnowledgeBaseCategory[]> {
    const { data, error } = await supabase
      .from('knowledge_base_categories')
      .select(`
        *,
        knowledge_base_articles(count)
      `)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((cat: any) => ({
      ...cat,
      article_count: cat.knowledge_base_articles?.[0]?.count || 0,
      knowledge_base_articles: undefined,
    }));
  },

  // Get a single category by slug
  async getCategoryBySlug(slug: string): Promise<KnowledgeBaseCategory | null> {
    const { data, error } = await supabase
      .from('knowledge_base_categories')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  // Get articles for a category
  async getArticlesByCategory(categoryId: string): Promise<KnowledgeBaseArticle[]> {
    const { data, error } = await supabase
      .from('knowledge_base_articles')
      .select(`
        *,
        category:knowledge_base_categories(*)
      `)
      .eq('category_id', categoryId)
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Get a single article by slug
  async getArticleBySlug(slug: string): Promise<KnowledgeBaseArticle | null> {
    const { data, error } = await supabase
      .from('knowledge_base_articles')
      .select(`
        *,
        category:knowledge_base_categories(*)
      `)
      .eq('slug', slug)
      .eq('is_published', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  },

  // Increment view count for an article
  async incrementViewCount(articleId: string): Promise<void> {
    const { error } = await supabase.rpc('increment_article_views', {
      article_id: articleId,
    });

    if (error) {
      console.error('Error incrementing view count:', error);
    }
  },

  // Submit feedback for an article
  async submitFeedback(
    articleId: string,
    isHelpful: boolean,
    feedbackText?: string,
    userId?: string
  ): Promise<void> {
    const { error } = await supabase.from('knowledge_base_feedback').insert({
      article_id: articleId,
      user_id: userId || null,
      is_helpful: isHelpful,
      feedback_text: feedbackText || null,
    });

    if (error) throw error;
  },

  // Check if user has already given feedback for an article
  async hasUserProvidedFeedback(
    articleId: string,
    userId?: string
  ): Promise<boolean> {
    if (!userId) return false;

    const { data, error } = await supabase
      .from('knowledge_base_feedback')
      .select('id')
      .eq('article_id', articleId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error checking feedback:', error);
      return false;
    }

    return !!data;
  },

  // Get related articles by tags
  async getRelatedArticles(
    articleId: string,
    tags: string[],
    limit: number = 3
  ): Promise<KnowledgeBaseArticle[]> {
    if (!tags || tags.length === 0) return [];

    const { data, error } = await supabase
      .from('knowledge_base_articles')
      .select(`
        *,
        category:knowledge_base_categories(*)
      `)
      .neq('id', articleId)
      .eq('is_published', true)
      .overlaps('tags', tags)
      .limit(limit);

    if (error) {
      console.error('Error fetching related articles:', error);
      return [];
    }

    return data || [];
  },

  // Get popular articles
  async getPopularArticles(limit: number = 5): Promise<KnowledgeBaseArticle[]> {
    const { data, error } = await supabase
      .from('knowledge_base_articles')
      .select(`
        *,
        category:knowledge_base_categories(*)
      `)
      .eq('is_published', true)
      .order('view_count', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching popular articles:', error);
      return [];
    }

    return data || [];
  },

  // Get recently updated articles
  async getRecentArticles(limit: number = 5): Promise<KnowledgeBaseArticle[]> {
    const { data, error } = await supabase
      .from('knowledge_base_articles')
      .select(`
        *,
        category:knowledge_base_categories(*)
      `)
      .eq('is_published', true)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching recent articles:', error);
      return [];
    }

    return data || [];
  },

  // Admin: Get all categories (including inactive)
  async getAllCategories(): Promise<KnowledgeBaseCategory[]> {
    const { data, error } = await supabase
      .from('knowledge_base_categories')
      .select(`
        *,
        knowledge_base_articles(count)
      `)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((cat: any) => ({
      ...cat,
      article_count: cat.knowledge_base_articles?.[0]?.count || 0,
      knowledge_base_articles: undefined,
    }));
  },

  // Admin: Get all articles (including unpublished)
  async getAllArticles(categoryId?: string): Promise<KnowledgeBaseArticle[]> {
    let query = supabase
      .from('knowledge_base_articles')
      .select(`
        *,
        category:knowledge_base_categories(*)
      `)
      .order('category_id', { ascending: true })
      .order('sort_order', { ascending: true });

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  // Admin: Toggle article published status
  async toggleArticlePublished(articleId: string, isPublished: boolean): Promise<void> {
    const { error } = await supabase
      .from('knowledge_base_articles')
      .update({ is_published: isPublished })
      .eq('id', articleId);

    if (error) throw error;
  },

  // Admin: Toggle category active status
  async toggleCategoryActive(categoryId: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('knowledge_base_categories')
      .update({ is_active: isActive })
      .eq('id', categoryId);

    if (error) throw error;
  },

  // Admin: Get article analytics
  async getArticleAnalytics(articleId: string) {
    const { data: article, error: articleError } = await supabase
      .from('knowledge_base_articles')
      .select('view_count, helpful_count, not_helpful_count')
      .eq('id', articleId)
      .single();

    if (articleError) throw articleError;

    const { data: feedback, error: feedbackError } = await supabase
      .from('knowledge_base_feedback')
      .select('*')
      .eq('article_id', articleId)
      .order('created_at', { ascending: false });

    if (feedbackError) throw feedbackError;

    const totalFeedback = article.helpful_count + article.not_helpful_count;
    const helpfulRatio =
      totalFeedback > 0 ? (article.helpful_count / totalFeedback) * 100 : 0;

    return {
      view_count: article.view_count,
      helpful_count: article.helpful_count,
      not_helpful_count: article.not_helpful_count,
      helpful_ratio: helpfulRatio,
      recent_feedback: feedback || [],
    };
  },
};
