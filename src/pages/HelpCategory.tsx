import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Home as HomeIcon,
  HelpCircle,
  Rocket,
  Search,
  User,
  Star,
  Heart,
  Building2,
  Shield,
  Settings,
  Clock,
  BookOpen,
  ArrowLeft,
} from 'lucide-react';
import {
  knowledgeBaseService,
  KnowledgeBaseCategory,
  KnowledgeBaseArticle,
} from '../services/knowledgeBase';

const iconMap: Record<string, React.ElementType> = {
  Rocket,
  Home: HomeIcon,
  Search,
  User,
  Star,
  Heart,
  Building2,
  Shield,
  Settings,
  HelpCircle,
};

export function HelpCategory() {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const navigate = useNavigate();
  const [category, setCategory] = useState<KnowledgeBaseCategory | null>(null);
  const [articles, setArticles] = useState<KnowledgeBaseArticle[]>([]);
  const [otherCategories, setOtherCategories] = useState<KnowledgeBaseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [categorySlug]);

  const loadData = async () => {
    if (!categorySlug) return;

    try {
      setLoading(true);
      const [cat, allCats] = await Promise.all([
        knowledgeBaseService.getCategoryBySlug(categorySlug),
        knowledgeBaseService.getCategories(),
      ]);

      if (!cat) {
        navigate('/help');
        return;
      }

      setCategory(cat);

      const arts = await knowledgeBaseService.getArticlesByCategory(cat.id);
      setArticles(arts);

      const others = allCats.filter((c) => c.id !== cat.id);
      setOtherCategories(others);
    } catch (error) {
      console.error('Error loading category:', error);
      navigate('/help');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-8"></div>
            <div className="h-12 bg-gray-200 rounded w-96 mb-4"></div>
            <div className="h-6 bg-gray-200 rounded w-full max-w-2xl mb-12"></div>
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-xl p-6">
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
                  <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!category) return null;

  const Icon = iconMap[category.icon] || HelpCircle;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav className="flex items-center gap-2 text-sm">
            <Link
              to="/help"
              className="text-gray-600 hover:text-brand-600 transition-colors"
            >
              Help Center
            </Link>
            <ChevronRight className="w-4 h-4 text-gray-400" />
            <span className="text-brand-700 font-medium">{category.name}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              <Link
                to="/help"
                className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Help Center
              </Link>

              {otherCategories.length > 0 && (
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-4">Other Topics</h3>
                  <div className="space-y-2">
                    {otherCategories.slice(0, 5).map((cat) => {
                      const OtherIcon = iconMap[cat.icon] || HelpCircle;
                      return (
                        <Link
                          key={cat.id}
                          to={`/help/${cat.slug}`}
                          className="flex items-center gap-3 text-sm text-gray-600 hover:text-brand-600 transition-colors p-2 rounded-lg hover:bg-brand-50"
                        >
                          <OtherIcon className="w-4 h-4 flex-shrink-0" />
                          <span className="flex-1">{cat.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Category Header */}
            <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl p-8 md:p-12 mb-8 shadow-lg">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-16 h-16 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
                    {category.name}
                  </h1>
                  <p className="text-brand-100 text-lg leading-relaxed mb-4">
                    {category.description}
                  </p>
                  <div className="flex items-center gap-2 text-white/90">
                    <BookOpen className="w-5 h-5" />
                    <span className="font-medium">
                      {articles.length} {articles.length === 1 ? 'article' : 'articles'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Articles List */}
            {articles.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center shadow-sm">
                <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No Articles Yet
                </h3>
                <p className="text-gray-600">
                  Articles for this category are coming soon.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {articles.map((article) => (
                  <Link
                    key={article.id}
                    to={`/help/${category.slug}/${article.slug}`}
                    className="group block bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 hover:border-brand-200"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h2 className="text-xl font-semibold text-brand-700 group-hover:text-brand-600 transition-colors flex-1">
                        {article.title}
                      </h2>
                      <div className="flex items-center gap-2 text-sm text-gray-500 flex-shrink-0">
                        <Clock className="w-4 h-4" />
                        <span>{article.read_time_minutes} min read</span>
                      </div>
                    </div>

                    <p className="text-gray-600 leading-relaxed mb-4">
                      {article.excerpt}
                    </p>

                    <div className="flex items-center justify-between">
                      <span className="text-brand-600 font-medium text-sm group-hover:underline">
                        Read full article →
                      </span>

                      {article.view_count > 0 && (
                        <span className="text-xs text-gray-500">
                          {article.view_count} views
                        </span>
                      )}
                    </div>

                    {article.tags && article.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        {article.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
