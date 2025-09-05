import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Users,
  Eye,
  TrendingUp,
  Clock,
  FileText,
  Filter,
  ArrowLeft
} from 'lucide-react';
import { useAuth, AUTH_CONTEXT_ID } from '@/hooks/useAuth';
import { supabase } from '../config/supabase';

interface AnalyticsSummary {
  start_date: string;
  end_date: string;
  dau: number;
  visitors_7d: number;
  returns_7d: number;
  avg_session_minutes: number;
  listing_views_7d: number;
  post_starts_7d: number;
  post_submits_7d: number;
  post_success_7d: number;
  post_abandoned_7d: number;
  dau_sparkline: number[];
}

interface TopListing {
  listing_id: string;
  views: number;
  impressions: number;
  ctr: number;
}

interface TopFilter {
  filter_key: string;
  filter_value: string;
  uses: number;
}

// Simple SVG sparkline component
function Sparkline({ data, className = '' }: { data: number[]; className?: string }) {
  if (!data || data.length === 0) {
    return <div className={`h-8 bg-gray-100 rounded ${className}`} />;
  }

  const max = Math.max(...data, 1); // Avoid division by zero
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className={`h-8 w-full ${className}`} viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
}

export function InternalAnalytics() {
  const navigate = useNavigate();
  const { user, profile, loading, authContextId } = useAuth();
  const isAdmin = profile?.is_admin === true;
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [topListings, setTopListings] = useState<TopListing[]>([]);
  const [topFilters, setTopFilters] = useState<TopFilter[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const payload = {
      loading,
      userPresent: !!user,
      profilePresent: profile !== undefined,
      isAdmin,
      authContextId,
    };
    if (authContextId !== AUTH_CONTEXT_ID) {
      console.warn('[InternalAnalytics access] auth context mismatch', payload);
    } else {
      console.log('[InternalAnalytics access]', payload);
    }
    if (!loading && profile === undefined) {
      console.warn(
        '[InternalAnalytics] profile undefined after loading; route outside provider or duplicate hook import.',
      );
    }
  }, [loading, user, profile, isAdmin, authContextId]);

  useEffect(() => {
    if (loading || (user && profile === undefined)) return;
    if (!user || !profile || !isAdmin) {
      navigate('/', { replace: true });
    }
  }, [loading, user, profile, isAdmin, navigate]);

  useEffect(() => {
    if (user && isAdmin) {
      loadAnalyticsData();
    }
  }, [user, isAdmin]);

  const loadAnalyticsData = async () => {
    try {
      setDataLoading(true);
      setError(null);

      // Load summary data
      const { data: summaryData, error: summaryError } = await supabase
        .rpc('analytics_summary_v2', { days_back: 0 });

      if (summaryError) {
        console.error('Error loading summary:', summaryError);
        if (summaryError.message.includes('forbidden')) {
          setError('Access denied. Admin privileges required.');
          return;
        }
        throw summaryError;
      }

      setSummary(summaryData?.[0] || null);

      // Load top listings
      const { data: listingsData, error: listingsError } = await supabase
        .rpc('analytics_top_listings', { days_back: 1, limit_count: 10 });

      if (listingsError) {
        console.error('Error loading top listings:', listingsError);
      } else {
        setTopListings(listingsData || []);
      }

      // Load top filters
      const { data: filtersData, error: filtersError } = await supabase
        .rpc('analytics_top_filters', { days_back: 1, limit_count: 10 });

      if (filtersError) {
        console.error('Error loading top filters:', filtersError);
      } else {
        setTopFilters(filtersData || []);
      }

    } catch (error) {
      console.error('Error loading analytics data:', error);
      setError('Failed to load analytics data. Please try again.');
    } finally {
      setDataLoading(false);
    }
  };

  if (loading || (user && profile === undefined)) {
    return <div className="p-4 text-center text-sm text-gray-500">Checking access...</div>;
  }

  if (!user || !profile || !isAdmin) {
    return null; // Will redirect via useEffect
  }

  if (dataLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#273140] flex items-center">
            <BarChart3 className="w-8 h-8 mr-3" />
            Analytics Dashboard
          </h1>
        </div>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading analytics data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#273140] flex items-center">
            <BarChart3 className="w-8 h-8 mr-3" />
            Analytics Dashboard
          </h1>
        </div>
        <div className="text-center py-12">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#273140] flex items-center">
            <BarChart3 className="w-8 h-8 mr-3" />
            Analytics Dashboard
          </h1>
        </div>
        <div className="text-center py-12">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 max-w-md mx-auto">
            <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No analytics data available yet.</p>
            <p className="text-sm text-gray-500 mt-2">
              Data will appear as users interact with your site.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate funnel percentages
  const successRate = summary.post_submits_7d > 0 
    ? Math.round((summary.post_success_7d / summary.post_submits_7d) * 100)
    : 0;
  
  const abandonRate = summary.post_starts_7d > 0
    ? Math.round((summary.post_abandoned_7d / summary.post_starts_7d) * 100)
    : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#273140] flex items-center">
          <BarChart3 className="w-8 h-8 mr-3" />
          Analytics Dashboard
        </h1>
        <p className="text-gray-600 mt-2">
          Today • {summary.start_date}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Daily Active Users */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <Users className="w-5 h-5 text-blue-600 mr-2" />
              <h3 className="text-sm font-medium text-gray-700">Daily Active</h3>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-2">{summary.dau}</div>
          <div className="text-blue-600">
            <Sparkline data={summary.dau_sparkline} />
          </div>
        </div>

        {/* Unique Visitors */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-2">
            <Users className="w-5 h-5 text-green-600 mr-2" />
            <h3 className="text-sm font-medium text-gray-700">Unique Visitors</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900">{summary.visitors_7d}</div>
          <div className="text-sm text-gray-500">
            {summary.returns_7d} returning
          </div>
        </div>

        {/* Average Session Length */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-2">
            <Clock className="w-5 h-5 text-purple-600 mr-2" />
            <h3 className="text-sm font-medium text-gray-700">Avg Session</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {Math.round(summary.avg_session_minutes)}m
          </div>
          <div className="text-sm text-gray-500">minutes</div>
        </div>

        {/* Listing Views */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-2">
            <Eye className="w-5 h-5 text-orange-600 mr-2" />
            <h3 className="text-sm font-medium text-gray-700">Listing Views</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900">{summary.listing_views_7d}</div>
          <div className="text-sm text-gray-500">today</div>
        </div>
      </div>

      {/* Posting Funnel */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-xl font-semibold text-[#273140] mb-6 flex items-center">
          <TrendingUp className="w-6 h-6 mr-2" />
          Posting Funnel
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="bg-blue-100 rounded-lg p-4 mb-2">
              <div className="text-2xl font-bold text-blue-800">{summary.post_starts_7d}</div>
              <div className="text-sm text-blue-600">Started</div>
            </div>
          </div>
          
          <div className="text-center">
            <div className="bg-yellow-100 rounded-lg p-4 mb-2">
              <div className="text-2xl font-bold text-yellow-800">{summary.post_submits_7d}</div>
              <div className="text-sm text-yellow-600">Submitted</div>
            </div>
          </div>
          
          <div className="text-center">
            <div className="bg-green-100 rounded-lg p-4 mb-2">
              <div className="text-2xl font-bold text-green-800">{summary.post_success_7d}</div>
              <div className="text-sm text-green-600">Success</div>
            </div>
          </div>
          
          <div className="text-center">
            <div className="bg-red-100 rounded-lg p-4 mb-2">
              <div className="text-2xl font-bold text-red-800">{summary.post_abandoned_7d}</div>
              <div className="text-sm text-red-600">Abandoned</div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-sm text-gray-600">
          Success Rate: <span className="font-semibold text-green-600">{successRate}%</span>
          {' • '}
          Abandon Rate: <span className="font-semibold text-red-600">{abandonRate}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Listings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-[#273140] mb-6 flex items-center">
            <FileText className="w-6 h-6 mr-2" />
            Top Listings by Views
          </h2>
          
          {topListings.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No listing data yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-sm font-medium text-gray-700">Listing ID</th>
                    <th className="text-right py-2 text-sm font-medium text-gray-700">Views</th>
                    <th className="text-right py-2 text-sm font-medium text-gray-700">Impressions</th>
                    <th className="text-right py-2 text-sm font-medium text-gray-700">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {topListings.map((listing, index) => (
                    <tr key={listing.listing_id} className="border-b border-gray-100">
                      <td className="py-2 text-sm text-gray-900 font-mono">
                        {listing.listing_id.slice(0, 8)}...
                      </td>
                      <td className="py-2 text-sm text-gray-900 text-right">{listing.views}</td>
                      <td className="py-2 text-sm text-gray-900 text-right">{listing.impressions}</td>
                      <td className="py-2 text-sm text-gray-900 text-right">{listing.ctr}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-[#273140] mb-6 flex items-center">
            <Filter className="w-6 h-6 mr-2" />
            Most Used Filters
          </h2>
          
          {topFilters.length === 0 ? (
            <div className="text-center py-8">
              <Filter className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No filter data yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-sm font-medium text-gray-700">Filter</th>
                    <th className="text-left py-2 text-sm font-medium text-gray-700">Value</th>
                    <th className="text-right py-2 text-sm font-medium text-gray-700">Uses</th>
                  </tr>
                </thead>
                <tbody>
                  {topFilters.map((filter, index) => (
                    <tr key={`${filter.filter_key}-${filter.filter_value}-${index}`} className="border-b border-gray-100">
                      <td className="py-2 text-sm text-gray-900 capitalize">
                        {filter.filter_key.replace('_', ' ')}
                      </td>
                      <td className="py-2 text-sm text-gray-900">{filter.filter_value}</td>
                      <td className="py-2 text-sm text-gray-900 text-right">{filter.uses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}