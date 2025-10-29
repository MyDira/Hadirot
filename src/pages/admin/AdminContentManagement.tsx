import React, { useState, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Shield, FileText, Star, MessageSquare } from 'lucide-react';

const StaticPagesTab = lazy(() => import('./tabs/StaticPagesTab'));
const FeaturedSettingsTab = lazy(() => import('./tabs/FeaturedSettingsTab'));
const ModalManagementTab = lazy(() => import('./tabs/ModalManagementTab'));

const CONTENT_TAB_KEYS = ['static-pages', 'featured', 'modals'] as const;
type ContentTabKey = (typeof CONTENT_TAB_KEYS)[number];

const isValidContentTab = (value: string | null): value is ContentTabKey =>
  value !== null && CONTENT_TAB_KEYS.includes(value as ContentTabKey);

const CONTENT_TABS: { id: ContentTabKey; label: string; icon: React.ElementType }[] = [
  { id: 'static-pages', label: 'Static Pages', icon: FileText },
  { id: 'featured', label: 'Featured Settings', icon: Star },
  { id: 'modals', label: 'Modals', icon: MessageSquare },
];

export function AdminContentManagement() {
  const [params, setParams] = useSearchParams();
  const rawTabParam = params.get('tab');
  const initialTab: ContentTabKey = isValidContentTab(rawTabParam) ? rawTabParam : 'static-pages';
  const [activeTab, setActiveTab] = useState<ContentTabKey>(initialTab);

  React.useEffect(() => {
    const normalized: ContentTabKey = isValidContentTab(rawTabParam) ? rawTabParam : 'static-pages';
    if (normalized !== activeTab) {
      setActiveTab(normalized);
    }
    if (normalized !== rawTabParam) {
      setParams(prev => {
        const search = new URLSearchParams(prev);
        search.set('tab', normalized);
        return search;
      }, { replace: true });
    }
  }, [rawTabParam]);

  const handleTabChange = (nextTab: ContentTabKey) => {
    setActiveTab(nextTab);
    setParams(prev => {
      const search = new URLSearchParams(prev);
      search.set('tab', nextTab);
      return search;
    }, { replace: true });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          to="/admin"
          className="inline-flex items-center text-sm text-gray-600 hover:text-[#4E4B43] mb-4"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Admin Panel
        </Link>

        <div className="flex items-center mb-2">
          <Shield className="w-8 h-8 mr-3 text-[#4E4B43]" />
          <h1 className="text-3xl font-bold text-[#4E4B43]">Content Management</h1>
        </div>
        <p className="text-gray-600">Manage static pages, featured settings, and modal popups</p>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-8">
        <nav className="flex space-x-2 sm:space-x-4 lg:space-x-8 border-b border-gray-200 overflow-x-auto pb-px scrollbar-hide">
          {CONTENT_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`flex items-center px-2 sm:px-3 py-2 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap transition-colors flex-shrink-0 ${
                activeTab === id
                  ? 'border-[#4E4B43] text-[#4E4B43]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4 mr-1 sm:mr-2" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <Suspense fallback={
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4E4B43] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading...</p>
        </div>
      }>
        {activeTab === 'static-pages' && <StaticPagesTab />}
        {activeTab === 'featured' && <FeaturedSettingsTab />}
        {activeTab === 'modals' && <ModalManagementTab />}
      </Suspense>
    </div>
  );
}
