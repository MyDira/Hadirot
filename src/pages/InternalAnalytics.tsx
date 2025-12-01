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
  MessageSquare,
  Phone as PhoneIcon,
} from 'lucide-react';
import { useAuth, AUTH_CONTEXT_ID } from '@/hooks/useAuth';
import { supabase } from '../config/supabase';

// Uniform RPC helper with console trace
async function rpc<T>(name: string, args: any) {
  const { data, error } = await supabase.rpc(name, args);
  console.log('[Analytics RPC]', name, { args, data, error });
  if (error) throw new Error(`${name}: ${error.code} ${error.message}`);
  return data as T;
}

// Small guard to avoid NaN in UI
const numOr0 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

interface TopListing {
  listing_id: string;
  views: number;
  impressions: number;
  ctr: number;
}

interface DetailedTopListing {
  listing_id: string;
  property_location: string;
  bedrooms: number;
  monthly_rent: string;
  posted_by: string;
  views: number;
  impressions: number;
  ctr: number;
  is_featured: boolean;
}

interface TopFilter {
  filter_key: string;
  filter_value: string;
  uses: number;
}

interface ContactSubmission {
  submission_id: string;
  submission_date: string;
  user_name: string;
  user_phone: string;
  consent_to_followup: boolean;
  listing_id: string;
  listing_title: string;
  listing_location: string;
  listing_neighborhood: string;
  bedrooms: number;
  price: number;
  contact_name: string;
  contact_phone: string;
}

interface ContactSummary {
  total_submissions: number;
  submissions_with_consent: number;
  unique_listings: number;
  consent_rate: number;
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
  const [dailyActive, setDailyActive] = useState(0);
  const [uniqueVisitors, setUniqueVisitors] = useState(0);
  const [avgSession, setAvgSession] = useState(0);
  const [listingViews, setListingViews] = useState(0);
  const [funnel, setFunnel] = useState({
    starts: 0,
    submits: 0,
    successes: 0,
    abandoned: 0,
    successRate: 0,
    abandonRate: 0,
  });
  const [dateStr, setDateStr] = useState('');
  const [dauSparkline, setDauSparkline] = useState<number[]>([]);
  const [agencyMetrics, setAgencyMetrics] = useState({ pageViews: 0, filterApplies: 0, shares: 0 });
  const [topListings, setTopListings] = useState<TopListing[]>([]);
  const [detailedTopListings, setDetailedTopListings] = useState<DetailedTopListing[]>([]);
  const [topFilters, setTopFilters] = useState<TopFilter[]>([]);
  const [contactSubmissions, setContactSubmissions] = useState<ContactSubmission[]>([]);
  const [contactSummary, setContactSummary] = useState<ContactSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'contacts'>('overview');
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
      setError(null);

      // Load all analytics data in parallel
      const [kpisResult, summaryResult, listingsResult, detailedListingsResult, filtersResult, agencyResult, contactsResult, contactSummaryResult] = await Promise.all([
        supabase.rpc('analytics_kpis_with_sparkline', { tz: 'America/New_York' }),
        supabase.rpc('analytics_summary', { days_back: 0, tz: 'America/New_York' }),
        supabase.rpc('analytics_top_listings', { days_back: 0, limit_count: 10, tz: 'America/New_York' }),
        supabase.rpc('analytics_top_listings_detailed', { days_back: 0, limit_count: 10, tz: 'America/New_York' }),
        supabase.rpc('analytics_top_filters', { days_back: 0, limit_count: 10, tz: 'America/New_York' }),
        supabase.rpc('analytics_agency_metrics', { days_back: 0, tz: 'America/New_York' }),
        supabase.rpc('analytics_contact_submissions', { days_back: 0, limit_count: 100, tz: 'America/New_York' }),
        supabase.rpc('analytics_contact_submissions_summary', { days_back: 0, tz: 'America/New_York' })
      ]);

      // Handle KPIs
      if (kpisResult.error) {
        console.error('Error loading KPIs:', kpisResult.error);
        throw new Error(`KPIs: ${kpisResult.error.message}`);
      } else {
        const kpi = kpisResult.data?.[0];
        if (kpi) {
          setDailyActive(numOr0(kpi.daily_active));
          setUniqueVisitors(numOr0(kpi.unique_visitors));
          setAvgSession(Math.round(numOr0(kpi.avg_session_minutes)));
          setListingViews(numOr0(kpi.listing_views));
          setDauSparkline(Array.isArray(kpi.sparkline_dau) ? kpi.sparkline_dau : []);
        }
      }

      // Handle agency metrics
      if (agencyResult.error) {
        console.error('Error loading agency metrics:', agencyResult.error);
      } else {
        const agency = agencyResult.data?.[0];
        if (agency) {
          setAgencyMetrics({
            pageViews: numOr0(agency.agency_page_views),
            filterApplies: numOr0(agency.agency_filter_applies),
            shares: numOr0(agency.agency_shares),
          });
        }
      }

      // Handle summary/funnel
      if (summaryResult.error) {
        console.error('Error loading summary:', summaryResult.error);
      } else {
        const summary = summaryResult.data?.[0];
        if (summary) {
          setFunnel({
            starts: numOr0(summary.post_starts),
            submits: numOr0(summary.post_submits),
            successes: numOr0(summary.post_successes),
            abandoned: numOr0(summary.post_abandoned),
            successRate: summary.post_starts > 0 ? Math.round((summary.post_successes / summary.post_starts) * 100) : 0,
            abandonRate: summary.post_starts > 0 ? Math.round((summary.post_abandoned / summary.post_starts) * 100) : 0,
          });
        }
      }

      // Handle top listings
      if (listingsResult.error) {
        console.error('Error loading top listings:', listingsResult.error);
      } else {
        setTopListings(listingsResult.data || []);
      }

      // Handle detailed top listings
      if (detailedListingsResult.error) {
        console.error('Error loading detailed top listings:', detailedListingsResult.error);
      } else {
        setDetailedTopListings(detailedListingsResult.data || []);
      }

      // Handle top filters
      if (filtersResult.error) {
        console.error('Error loading top filters:', filtersResult.error);
      } else {
        setTopFilters(filtersResult.data || []);
      }

      // Handle contact submissions
      if (contactsResult.error) {
        console.error('Error loading contact submissions:', contactsResult.error);
      } else {
        setContactSubmissions(contactsResult.data || []);
      }

      // Handle contact summary
      if (contactSummaryResult.error) {
        console.error('Error loading contact summary:', contactSummaryResult.error);
      } else {
        setContactSummary(contactSummaryResult.data?.[0] || null);
      }

      // Set current date for display
      setDateStr(
        new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' })
      );

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#273140] flex items-center">
          <BarChart3 className="w-8 h-8 mr-3" />
          Analytics Dashboard
        </h1>
        <p className="text-gray-600 mt-2">
          Today • {dateStr}
        </p>

        {/* Tab Navigation */}
        <div className="flex gap-4 mt-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 px-4 font-medium transition-colors border-b-2 ${
              activeTab === 'overview'
                ? 'border-[#273140] text-[#273140]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`pb-3 px-4 font-medium transition-colors border-b-2 flex items-center ${
              activeTab === 'contacts'
                ? 'border-[#273140] text-[#273140]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Contact Submissions
            {contactSummary && contactSummary.total_submissions > 0 && (
              <span className="ml-2 bg-accent-500 text-white text-xs px-2 py-0.5 rounded-full">
                {contactSummary.total_submissions}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
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
          <div className="text-2xl font-bold text-gray-900 mb-2">{Number.isFinite(dailyActive) ? dailyActive : 0}</div>
          <div className="text-blue-600">
            <Sparkline data={dauSparkline} />
          </div>
        </div>

        {/* Unique Visitors */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-2">
            <Users className="w-5 h-5 text-green-600 mr-2" />
            <h3 className="text-sm font-medium text-gray-700">Unique Visitors</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900">{Number.isFinite(uniqueVisitors) ? uniqueVisitors : 0}</div>
          <div className="text-sm text-gray-500">&nbsp;</div>
        </div>

        {/* Average Session Length */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-2">
            <Clock className="w-5 h-5 text-purple-600 mr-2" />
            <h3 className="text-sm font-medium text-gray-700">Avg Session</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {Number.isFinite(avgSession) ? avgSession : 0}m
          </div>
          <div className="text-sm text-gray-500">minutes</div>
        </div>

        {/* Listing Views */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-2">
            <Eye className="w-5 h-5 text-orange-600 mr-2" />
            <h3 className="text-sm font-medium text-gray-700">Listing Views</h3>
          </div>
          <div className="text-2xl font-bold text-gray-900">{Number.isFinite(listingViews) ? listingViews : 0}</div>
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
              <div className="text-2xl font-bold text-blue-800">{Number.isFinite(funnel.starts) ? funnel.starts : 0}</div>
              <div className="text-sm text-blue-600">Started</div>
            </div>
          </div>
          
          <div className="text-center">
            <div className="bg-yellow-100 rounded-lg p-4 mb-2">
              <div className="text-2xl font-bold text-yellow-800">{Number.isFinite(funnel.submits) ? funnel.submits : 0}</div>
              <div className="text-sm text-yellow-600">Submitted</div>
            </div>
          </div>
          
          <div className="text-center">
            <div className="bg-green-100 rounded-lg p-4 mb-2">
              <div className="text-2xl font-bold text-green-800">{Number.isFinite(funnel.successes) ? funnel.successes : 0}</div>
              <div className="text-sm text-green-600">Success</div>
            </div>
          </div>

          <div className="text-center">
            <div className="bg-red-100 rounded-lg p-4 mb-2">
              <div className="text-2xl font-bold text-red-800">{Number.isFinite(funnel.abandoned) ? funnel.abandoned : 0}</div>
              <div className="text-sm text-red-600">Abandoned</div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-sm text-gray-600">
          Success Rate: <span className="font-semibold text-green-600">{Number.isFinite(funnel.successRate) ? funnel.successRate : 0}%</span>
          {' • '}
          Abandon Rate: <span className="font-semibold text-red-600">{Number.isFinite(funnel.abandonRate) ? funnel.abandonRate : 0}%</span>
        </div>
      </div>

      {/* Agency Metrics */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-xl font-semibold text-[#273140] mb-6 flex items-center">
          <TrendingUp className="w-6 h-6 mr-2" />
          Agency Performance
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-800">{agencyMetrics.pageViews}</div>
              <div className="text-sm text-blue-600">Page Views</div>
            </div>
          </div>
          <div className="text-center">
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-800">{agencyMetrics.filterApplies}</div>
              <div className="text-sm text-green-600">Filter Applies</div>
            </div>
          </div>
          <div className="text-center">
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-orange-800">{agencyMetrics.shares}</div>
              <div className="text-sm text-orange-600">Shares</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Listings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col" style={{ height: '600px' }}>
          {/* Fixed header - stays visible while content scrolls */}
          <h2 className="text-xl font-semibold text-[#273140] mb-6 flex items-center flex-shrink-0">
            <FileText className="w-6 h-6 mr-2" />
            Top Listings by Views
          </h2>

          {/* Scrollable content area with fixed height */}
          <div className="flex-1 overflow-y-auto pr-2" style={{ minHeight: 0 }}>
            {detailedTopListings.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No listing data yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {detailedTopListings.map((listing) => (
                  <div
                    key={listing.listing_id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-accent-400 hover:shadow-md transition-all cursor-pointer"
                    onClick={() => navigate(`/listing/${listing.listing_id}`)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">
                            {listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} BR`}
                          </h3>
                          {listing.is_featured && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-accent-100 text-accent-800">
                              Featured
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{listing.property_location}</p>
                      </div>
                      <div className="text-right ml-4">
                        <div className="font-semibold text-gray-900">{listing.monthly_rent}</div>
                        <div className="text-xs text-gray-500 mt-1">by {listing.posted_by}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Views:</span>
                          <span className="ml-1 font-semibold text-gray-900">{listing.views}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Impressions:</span>
                          <span className="ml-1 font-semibold text-gray-900">{listing.impressions}</span>
                        </div>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-500">CTR:</span>
                        <span className={`ml-1 font-semibold ${listing.ctr >= 5 ? 'text-green-600' : listing.ctr >= 2 ? 'text-blue-600' : 'text-gray-600'}`}>
                          {listing.ctr}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col" style={{ height: '600px' }}>
          {/* Fixed header - stays visible while content scrolls */}
          <h2 className="text-xl font-semibold text-[#273140] mb-6 flex items-center flex-shrink-0">
            <Filter className="w-6 h-6 mr-2" />
            Most Used Filters
          </h2>

          {/* Scrollable content area with fixed height */}
          <div className="flex-1 overflow-y-auto pr-2" style={{ minHeight: 0 }}>
            {topFilters.length === 0 ? (
              <div className="text-center py-8">
                <Filter className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No filter data yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="sticky top-0 bg-white z-10">
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
        </>
      )}

      {/* Contact Submissions Tab */}
      {activeTab === 'contacts' && (
        <>
          {/* Summary Cards */}
          {contactSummary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center mb-2">
                  <MessageSquare className="w-5 h-5 text-blue-600 mr-2" />
                  <h3 className="text-sm font-medium text-gray-700">Total Today</h3>
                </div>
                <div className="text-2xl font-bold text-gray-900">{contactSummary.total_submissions || 0}</div>
                <div className="text-sm text-gray-500">submissions</div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center mb-2">
                  <PhoneIcon className="w-5 h-5 text-green-600 mr-2" />
                  <h3 className="text-sm font-medium text-gray-700">With Consent</h3>
                </div>
                <div className="text-2xl font-bold text-gray-900">{contactSummary.submissions_with_consent || 0}</div>
                <div className="text-sm text-gray-500">opted in</div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center mb-2">
                  <FileText className="w-5 h-5 text-purple-600 mr-2" />
                  <h3 className="text-sm font-medium text-gray-700">Unique Listings</h3>
                </div>
                <div className="text-2xl font-bold text-gray-900">{contactSummary.unique_listings || 0}</div>
                <div className="text-sm text-gray-500">listings contacted</div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center mb-2">
                  <TrendingUp className="w-5 h-5 text-orange-600 mr-2" />
                  <h3 className="text-sm font-medium text-gray-700">Consent Rate</h3>
                </div>
                <div className="text-2xl font-bold text-gray-900">{contactSummary.consent_rate || 0}%</div>
                <div className="text-sm text-gray-500">WhatsApp opt-in</div>
              </div>
            </div>
          )}

          {/* Contact Submissions Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-[#273140] mb-6 flex items-center">
              <MessageSquare className="w-6 h-6 mr-2" />
              Recent Contact Submissions
            </h2>

            {contactSubmissions.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No contact submissions yet today</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date/Time</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Contact</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Phone</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Listing</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Consent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contactSubmissions.map((submission) => (
                      <tr
                        key={submission.submission_id}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => navigate(`/listing/${submission.listing_id}`)}
                      >
                        <td className="py-3 px-4 text-sm text-gray-900">
                          {new Date(submission.submission_date).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-900 font-medium">
                          {submission.user_name}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-900">
                          {submission.user_phone}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <div className="text-gray-900 font-medium">
                            {submission.bedrooms === 0 ? 'Studio' : `${submission.bedrooms} BR`} - {submission.listing_location}
                          </div>
                          <div className="text-gray-500 text-xs mt-1">
                            ${submission.price?.toLocaleString() || 'N/A'}/mo
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {submission.consent_to_followup ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Yes
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              No
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}