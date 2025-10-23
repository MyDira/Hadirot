import React, { useEffect, useState, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Eye,
  ArrowLeft,
  CheckCircle,
  Share2,
} from 'lucide-react';
import {
  knowledgeBaseService,
  KnowledgeBaseArticle,
} from '../services/knowledgeBase';
import { useAuth } from '../hooks/useAuth';
import DOMPurify from 'dompurify';

export function HelpArticle() {
  const { categorySlug, articleSlug } = useParams<{
    categorySlug: string;
    articleSlug: string;
  }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [article, setArticle] = useState<KnowledgeBaseArticle | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<KnowledgeBaseArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'helpful' | 'not-helpful' | null>(null);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [tableOfContents, setTableOfContents] = useState<
    Array<{ id: string; text: string; level: number }>
  >([]);
  const [activeHeading, setActiveHeading] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [categorySlug, articleSlug]);

  useEffect(() => {
    if (article && contentRef.current) {
      // Increment view count
      knowledgeBaseService.incrementViewCount(article.id);

      // Generate table of contents
      const headings = contentRef.current.querySelectorAll('h2, h3');
      const toc = Array.from(headings).map((heading, index) => {
        const id = `heading-${index}`;
        heading.id = id;
        return {
          id,
          text: heading.textContent || '',
          level: parseInt(heading.tagName[1]),
        };
      });
      setTableOfContents(toc);

      // Check if user has already provided feedback
      if (user) {
        knowledgeBaseService
          .hasUserProvidedFeedback(article.id, user.id)
          .then((hasFeedback) => {
            if (hasFeedback) {
              setFeedbackSubmitted(true);
            }
          });
      }
    }
  }, [article, user]);

  // Scroll spy for table of contents
  useEffect(() => {
    const handleScroll = () => {
      if (!tableOfContents.length) return;

      const headingElements = tableOfContents.map((item) =>
        document.getElementById(item.id)
      );

      const visibleHeading = headingElements.find((el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.top <= 200;
      });

      if (visibleHeading) {
        setActiveHeading(visibleHeading.id);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [tableOfContents]);

  const loadData = async () => {
    if (!articleSlug) return;

    try {
      setLoading(true);
      const art = await knowledgeBaseService.getArticleBySlug(articleSlug);

      if (!art || art.category?.slug !== categorySlug) {
        navigate('/help');
        return;
      }

      setArticle(art);

      // Load related articles
      const related = await knowledgeBaseService.getRelatedArticles(
        art.id,
        art.tags,
        3
      );
      setRelatedArticles(related);
    } catch (error) {
      console.error('Error loading article:', error);
      navigate('/help');
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (isHelpful: boolean) => {
    if (!article || feedbackSubmitted) return;

    setFeedbackType(isHelpful ? 'helpful' : 'not-helpful');

    if (!isHelpful) {
      setShowFeedbackForm(true);
    } else {
      await submitFeedback(isHelpful);
    }
  };

  const submitFeedback = async (isHelpful: boolean, text?: string) => {
    if (!article) return;

    try {
      setSubmittingFeedback(true);
      await knowledgeBaseService.submitFeedback(
        article.id,
        isHelpful,
        text,
        user?.id
      );
      setFeedbackSubmitted(true);
      setShowFeedbackForm(false);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleFeedbackFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (feedbackType) {
      await submitFeedback(feedbackType === 'helpful', feedbackText);
    }
  };

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: article?.title,
          text: article?.excerpt,
          url: window.location.href,
        });
      } catch (error) {
        // User cancelled or error occurred
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-8"></div>
            <div className="h-12 bg-gray-200 rounded w-full mb-4"></div>
            <div className="h-6 bg-gray-200 rounded w-3/4 mb-8"></div>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!article) return null;

  const sanitizedContent = DOMPurify.sanitize(article.content);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav className="flex items-center gap-2 text-sm flex-wrap">
            <Link
              to="/help"
              className="text-gray-600 hover:text-brand-600 transition-colors"
            >
              Help Center
            </Link>
            <ChevronRight className="w-4 h-4 text-gray-400" />
            <Link
              to={`/help/${article.category?.slug}`}
              className="text-gray-600 hover:text-brand-600 transition-colors"
            >
              {article.category?.name}
            </Link>
            <ChevronRight className="w-4 h-4 text-gray-400" />
            <span className="text-brand-700 font-medium">{article.title}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar - Table of Contents */}
          <div className="lg:col-span-1 order-2 lg:order-1">
            <div className="lg:sticky lg:top-8 space-y-6">
              <Link
                to={`/help/${article.category?.slug}`}
                className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to {article.category?.name}
              </Link>

              {tableOfContents.length > 0 && (
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-4">
                    In this article
                  </h3>
                  <nav className="space-y-2">
                    {tableOfContents.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => scrollToHeading(item.id)}
                        className={`block text-left text-sm transition-colors w-full ${
                          item.level === 3 ? 'pl-4' : ''
                        } ${
                          activeHeading === item.id
                            ? 'text-brand-600 font-medium'
                            : 'text-gray-600 hover:text-brand-600'
                        }`}
                      >
                        {item.text}
                      </button>
                    ))}
                  </nav>
                </div>
              )}

              <button
                onClick={handleShare}
                className="flex items-center gap-2 text-gray-600 hover:text-brand-600 transition-colors text-sm font-medium"
              >
                <Share2 className="w-4 h-4" />
                Share article
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 order-1 lg:order-2">
            {/* Article Header */}
            <div className="bg-white rounded-2xl p-8 md:p-10 mb-8 shadow-sm border border-gray-200">
              <h1 className="text-4xl md:text-5xl font-bold text-brand-700 mb-4 leading-tight">
                {article.title}
              </h1>

              <p className="text-xl text-gray-600 leading-relaxed mb-6">
                {article.excerpt}
              </p>

              <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600 pt-6 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  <span>{article.read_time_minutes} min read</span>
                </div>
                {article.updated_at && (
                  <div className="text-gray-500">
                    Last updated: {new Date(article.updated_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>

            {/* Article Content */}
            <div className="bg-white rounded-2xl p-8 md:p-10 mb-8 shadow-sm border border-gray-200">
              <div
                ref={contentRef}
                className="prose prose-lg max-w-none
                  prose-headings:font-brand prose-headings:text-brand-700
                  prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:pb-3 prose-h2:border-b prose-h2:border-gray-200
                  prose-h3:text-2xl prose-h3:mt-8 prose-h3:mb-4
                  prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-6
                  prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline
                  prose-ul:my-6 prose-ul:space-y-2
                  prose-ol:my-6 prose-ol:space-y-2
                  prose-li:text-gray-700 prose-li:leading-relaxed
                  prose-strong:text-brand-700 prose-strong:font-semibold
                  prose-code:text-brand-600 prose-code:bg-brand-50 prose-code:px-2 prose-code:py-1 prose-code:rounded
                  prose-pre:bg-gray-900 prose-pre:text-gray-100"
                dangerouslySetInnerHTML={{ __html: sanitizedContent }}
              />

              {/* Tags */}
              {article.tags && article.tags.length > 0 && (
                <div className="mt-12 pt-8 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
                    Related topics
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {article.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1.5 bg-brand-50 text-brand-700 text-sm rounded-lg font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Feedback Widget */}
            <div className="bg-white rounded-2xl p-8 mb-8 shadow-sm border border-gray-200">
              {feedbackSubmitted ? (
                <div className="text-center py-4">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Thank you for your feedback!
                  </h3>
                  <p className="text-gray-600">
                    Your input helps us improve our help articles.
                  </p>
                </div>
              ) : showFeedbackForm ? (
                <form onSubmit={handleFeedbackFormSubmit}>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">
                    Help us improve this article
                  </h3>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="What could we do better? (optional)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
                    rows={4}
                  />
                  <div className="flex gap-3 mt-4">
                    <button
                      type="submit"
                      disabled={submittingFeedback}
                      className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium disabled:opacity-50"
                    >
                      {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                    </button>
                    <button
                      type="button"
                      onClick={() => submitFeedback(false)}
                      disabled={submittingFeedback}
                      className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors font-medium"
                    >
                      Skip
                    </button>
                  </div>
                </form>
              ) : (
                <div className="text-center">
                  <h3 className="text-xl font-semibold text-gray-900 mb-6">
                    Was this article helpful?
                  </h3>
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => handleFeedback(true)}
                      className="flex items-center gap-2 px-8 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium"
                    >
                      <ThumbsUp className="w-5 h-5" />
                      Yes, it helped
                    </button>
                    <button
                      onClick={() => handleFeedback(false)}
                      className="flex items-center gap-2 px-8 py-3 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
                    >
                      <ThumbsDown className="w-5 h-5" />
                      Could be better
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Related Articles */}
            {relatedArticles.length > 0 && (
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
                <h3 className="text-2xl font-bold text-brand-700 mb-6">
                  Related Articles
                </h3>
                <div className="space-y-4">
                  {relatedArticles.map((related) => (
                    <Link
                      key={related.id}
                      to={`/help/${related.category?.slug}/${related.slug}`}
                      className="block p-4 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
                    >
                      <h4 className="font-semibold text-brand-700 mb-2">
                        {related.title}
                      </h4>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {related.excerpt}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
