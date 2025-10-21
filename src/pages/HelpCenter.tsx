import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HelpCircle,
  Rocket,
  Home as HomeIcon,
  Search,
  User,
  Star,
  Heart,
  Building2,
  Shield,
  Settings,
  BookOpen,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { knowledgeBaseService, KnowledgeBaseCategory, KnowledgeBaseArticle } from '../services/knowledgeBase';

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

export function HelpCenter() {
  const [categories, setCategories] = useState<KnowledgeBaseCategory[]>([]);
  const [popularArticles, setPopularArticles] = useState<KnowledgeBaseArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [cats, popular] = await Promise.all([
        knowledgeBaseService.getCategories(),
        knowledgeBaseService.getPopularArticles(4),
      ]);
      setCategories(cats);
      setPopularArticles(popular);
    } catch (error) {
      console.error('Error loading help center data:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalArticles = categories.reduce((sum, cat) => sum + (cat.article_count || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-accent-50">
      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-200/30 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent-200/30 rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl mb-6 shadow-lg">
            <HelpCircle className="w-10 h-10 text-white" />
          </div>

          <h1 className="text-5xl md:text-6xl font-bold font-brand text-brand-700 mb-6">
            How Can We Help You?
          </h1>

          <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Find answers, learn how to use our platform, and get the most out of your rental experience
          </p>

          {/* Stats */}
          <div className="flex flex-wrap justify-center gap-8 mt-12">
            <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm px-6 py-3 rounded-full shadow-sm">
              <BookOpen className="w-5 h-5 text-brand-600" />
              <span className="text-sm font-medium text-gray-700">
                {totalArticles} Articles
              </span>
            </div>
            <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm px-6 py-3 rounded-full shadow-sm">
              <HomeIcon className="w-5 h-5 text-brand-600" />
              <span className="text-sm font-medium text-gray-700">
                {categories.length} Categories
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Grid */}
      <section className="py-16 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <h2 className="text-3xl font-bold font-brand text-brand-700 mb-3">
              Browse by Topic
            </h2>
            <p className="text-lg text-gray-600">
              Select a category to explore related articles
            </p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-white rounded-2xl p-6 shadow-sm animate-pulse">
                  <div className="w-12 h-12 bg-gray-200 rounded-xl mb-4"></div>
                  <div className="h-6 bg-gray-200 rounded mb-2 w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map((category) => {
                const Icon = iconMap[category.icon] || HelpCircle;
                return (
                  <Link
                    key={category.id}
                    to={`/help/${category.slug}`}
                    className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-brand-200 hover:-translate-y-1"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
                        <Icon className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-brand-700 mb-2 group-hover:text-brand-600 transition-colors">
                          {category.name}
                        </h3>
                        <p className="text-gray-600 text-sm leading-relaxed mb-3">
                          {category.description}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <BookOpen className="w-4 h-4" />
                          <span>
                            {category.article_count || 0} {category.article_count === 1 ? 'article' : 'articles'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Popular Articles */}
      {popularArticles.length > 0 && (
        <section className="py-16 bg-white/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-8">
              <TrendingUp className="w-6 h-6 text-brand-600" />
              <h2 className="text-3xl font-bold font-brand text-brand-700">
                Popular Articles
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {popularArticles.map((article) => (
                <Link
                  key={article.id}
                  to={`/help/${article.category?.slug}/${article.slug}`}
                  className="group bg-white rounded-xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 hover:border-brand-200"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <h3 className="text-lg font-semibold text-brand-700 group-hover:text-brand-600 transition-colors flex-1">
                      {article.title}
                    </h3>
                    <div className="flex items-center gap-1 text-sm text-gray-500 flex-shrink-0">
                      <Clock className="w-4 h-4" />
                      <span>{article.read_time_minutes} min</span>
                    </div>
                  </div>

                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                    {article.excerpt}
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-brand-600 font-medium group-hover:underline">
                      Read article →
                    </span>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{article.view_count} views</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Contact CTA */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-3xl p-12 text-center shadow-xl">
            <h2 className="text-3xl font-bold text-white mb-4">
              Still Need Help?
            </h2>
            <p className="text-brand-100 text-lg mb-8 max-w-2xl mx-auto">
              Can't find what you're looking for? Our support team is here to assist you with any questions or concerns.
            </p>
            <Link
              to="/contact"
              className="inline-flex items-center justify-center bg-white text-brand-700 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-brand-50 transition-colors shadow-lg hover:shadow-xl"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
