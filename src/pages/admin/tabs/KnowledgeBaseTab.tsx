import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Eye,
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  ExternalLink,
  CheckCircle,
  XCircle,
  BarChart3,
} from 'lucide-react';
import {
  knowledgeBaseService,
  KnowledgeBaseCategory,
  KnowledgeBaseArticle,
} from '../../../services/knowledgeBase';

export default function KnowledgeBaseTab() {
  const [categories, setCategories] = useState<KnowledgeBaseCategory[]>([]);
  const [articles, setArticles] = useState<KnowledgeBaseArticle[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadArticles();
  }, [selectedCategoryId]);

  const loadData = async () => {
    try {
      const cats = await knowledgeBaseService.getAllCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadArticles = async () => {
    try {
      const categoryId = selectedCategoryId === 'all' ? undefined : selectedCategoryId;
      const arts = await knowledgeBaseService.getAllArticles(categoryId);
      setArticles(arts);
    } catch (error) {
      console.error('Error loading articles:', error);
    }
  };

  const handleToggleArticlePublished = async (articleId: string, currentStatus: boolean) => {
    try {
      setUpdating(articleId);
      await knowledgeBaseService.toggleArticlePublished(articleId, !currentStatus);
      await loadArticles();
    } catch (error) {
      console.error('Error toggling article status:', error);
      alert('Failed to update article status');
    } finally {
      setUpdating(null);
    }
  };

  const handleToggleCategoryActive = async (categoryId: string, currentStatus: boolean) => {
    try {
      setUpdating(categoryId);
      await knowledgeBaseService.toggleCategoryActive(categoryId, !currentStatus);
      await loadData();
    } catch (error) {
      console.error('Error toggling category status:', error);
      alert('Failed to update category status');
    } finally {
      setUpdating(null);
    }
  };

  const calculateHelpfulRatio = (helpful: number, notHelpful: number) => {
    const total = helpful + notHelpful;
    if (total === 0) return 0;
    return Math.round((helpful / total) * 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-700 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading knowledge base...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-brand-600" />
            <h2 className="text-2xl font-bold text-brand-700">Knowledge Base Management</h2>
          </div>
          <Link
            to="/help"
            target="_blank"
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium"
          >
            <ExternalLink className="w-4 h-4" />
            View Help Center
          </Link>
        </div>
        <p className="text-gray-600">
          Manage help center categories and articles. Toggle visibility and track performance metrics.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-600">Total Articles</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{articles.length}</div>
          <div className="text-sm text-gray-500 mt-1">
            {articles.filter((a) => a.is_published).length} published
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <Eye className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-gray-600">Total Views</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {articles.reduce((sum, a) => sum + a.view_count, 0).toLocaleString()}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <ThumbsUp className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-medium text-gray-600">Helpful Feedback</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {articles.reduce((sum, a) => sum + a.helpful_count, 0)}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="w-5 h-5 text-orange-600" />
            <span className="text-sm font-medium text-gray-600">Categories</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{categories.length}</div>
          <div className="text-sm text-gray-500 mt-1">
            {categories.filter((c) => c.is_active).length} active
          </div>
        </div>
      </div>

      {/* Categories Section */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Categories</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Articles
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {categories.map((category) => (
                <tr key={category.id}>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {category.name}
                        </div>
                        <div className="text-sm text-gray-500">{category.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900">{category.article_count || 0}</span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {category.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <XCircle className="w-3 h-3" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => handleToggleCategoryActive(category.id, category.is_active)}
                      disabled={updating === category.id}
                      className="text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
                    >
                      {updating === category.id
                        ? 'Updating...'
                        : category.is_active
                        ? 'Deactivate'
                        : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Articles Section */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Articles</h3>
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Article
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Views
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Helpful
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {articles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No articles found
                  </td>
                </tr>
              ) : (
                articles.map((article) => {
                  const helpfulRatio = calculateHelpfulRatio(
                    article.helpful_count,
                    article.not_helpful_count
                  );
                  return (
                    <tr key={article.id}>
                      <td className="px-4 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {article.title}
                          </div>
                          <div className="text-sm text-gray-500 line-clamp-1">
                            {article.excerpt}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {article.category?.name}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-gray-900">
                          <Eye className="w-4 h-4 text-gray-400" />
                          {article.view_count}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 text-sm">
                            <ThumbsUp className="w-4 h-4 text-green-600" />
                            <span className="text-gray-900">{article.helpful_count}</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm">
                            <ThumbsDown className="w-4 h-4 text-red-600" />
                            <span className="text-gray-900">{article.not_helpful_count}</span>
                          </div>
                          {(article.helpful_count + article.not_helpful_count) > 0 && (
                            <span className="text-xs text-gray-500">({helpfulRatio}%)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {article.is_published ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3" />
                            Published
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            <XCircle className="w-3 h-3" />
                            Draft
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() =>
                              handleToggleArticlePublished(article.id, article.is_published)
                            }
                            disabled={updating === article.id}
                            className="text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
                          >
                            {updating === article.id
                              ? 'Updating...'
                              : article.is_published
                              ? 'Unpublish'
                              : 'Publish'}
                          </button>
                          {article.is_published && (
                            <Link
                              to={`/help/${article.category?.slug}/${article.slug}`}
                              target="_blank"
                              className="text-gray-600 hover:text-gray-700"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Managing Content</h3>
        <p className="text-blue-800 text-sm mb-4">
          Content is managed through the codebase. To add or edit articles, update the seed script at{' '}
          <code className="bg-blue-100 px-2 py-1 rounded">scripts/seed-knowledge-base.ts</code> and run it.
        </p>
        <ul className="text-blue-800 text-sm space-y-2">
          <li>• Toggle category and article visibility using the controls above</li>
          <li>• Monitor article performance with views and feedback metrics</li>
          <li>• Use the Help Center link to preview the public-facing pages</li>
        </ul>
      </div>
    </div>
  );
}
