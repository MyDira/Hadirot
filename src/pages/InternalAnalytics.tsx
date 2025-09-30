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

interface AbandonmentDetails {
  started_not_submitted: number;
  submitted_not_completed: number;
  avg_time_before_abandon_minutes: number;
  total_abandoned: number;
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
  const [abandonmentDetails, setAbandonmentDetails] = useState<AbandonmentDetails | null>(null);
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

  type KpisRow = {
    daily_active: number;
    unique_visitors: number;
    avg_session_minutes: number;
    listing_views: number;
    sparkline_dau?: number[];
  };

  type AgencyMetricsRow = {
    agency_page_views: number;
    agency_filter_applies: number;
    agency_shares: number;
  };

  type SummaryRow = {
    post_starts: number;
    post_submits: number;
    post_successes: number;
    post_abandoned: number;
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // today only
        const [kpisArr, funnelArr, agencyArr] = await Promise.all([
          rpc<KpisRow[]>('analytics_kpis_with_sparkline', { tz: 'America/New_York' }),
          rpc<SummaryRow[]>('analytics_summary', { days_back: 0, tz: 'America/New_York' }),
          rpc<AgencyMetricsRow[]>('analytics_agency_metrics', { days_back: 0, tz: 'America/New_York' }),
        ]);

        const k = kpisArr?.[0] ?? { daily_active: 0, unique_visitors: 0, avg_session_minutes: 0, listing_views: 0, sparkline_dau: [] };
        const f = funnelArr?.[0] ?? { post_starts: 0, post_submits: 0, post_successes: 0, post_abandoned: 0 };
        const a = agencyArr?.[0] ?? { agency_page_views: 0, agency_filter_applies: 0, agency_shares: 0 };

        if (!alive) return;

        setDailyActive(numOr0(k.daily_active));
        setUniqueVisitors(numOr0(k.unique_visitors));
        setAvgSession(Math.round(numOr0(k.avg_session_minutes)));
        setListingViews(numOr0(k.listing_views));
        setDauSparkline(Array.isArray(k.sparkline_dau) ? k.sparkline_dau : []);

        setAgencyMetrics({
          pageViews: numOr0(a.agency_page_views),
          filterApplies: numOr0(a.agency_filter_applies),
          shares: numOr0(a.agency_shares),
        });

        setFunnel({
          starts: numOr0(f.post_starts),
          submits: numOr0(f.post_submits),
          successes: numOr0(f.post_successes),
          abandoned: numOr0(f.post_abandoned),
          successRate: f.post_starts > 0 ? Math.round((f.post_successes / f.post_starts) * 100) : 0,
          abandonRate: f.post_starts > 0 ? Math.round((f.post_abandoned / f.post_starts) * 100) : 0,
        });

        setDateStr(
          new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' })
        );
      } catch (err) {
        console.error('Error loading analytics (top half):', err);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const loadAnalyticsData = async () => {
    try {
      setDataLoading(true);
      setError(null);
      setError(null);

      // Load all analytics data in parallel
      const [kpisResult, summaryResult, listingsResult, detailedListingsResult, filtersResult, agencyResult, abandonmentResult] = await Promise.all([
        supabase.rpc('analytics_kpis_with_sparkline', { tz: 'America/New_York' }),
        supabase.rpc('analytics_summary', { days_back: 0, tz: 'America/New_York' }),
        supabase.rpc('analytics_top_listings', { days_back: 0, limit_count: 10, tz: 'America/New_York' }),
        supabase.rpc('analytics_top_listings_detailed', { days_back: 0, limit_count: 10, tz: 'America/New_York' }),
        supabase.rpc('analytics_top_filters', { days_back: 0, limit_count: 10, tz: 'America/New_York' }),
        supabase.rpc('analytics_agency_metrics', { days_back: 0, tz: 'America/New_York' }),
        supabase.rpc('analytics_funnel_abandonment_details', { days_back: 0, tz: 'America/New_York' })
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

      // Handle abandonment details
      if (abandonmentResult.error) {
        console.error('Error loading abandonment details:', abandonmentResult.error);
      } else {
        setAbandonmentDetails(abandonmentResult.data?.[0] || null);
      }

      // Handle top filters
      if (filtersResult.error) {
        console.error('Error loading top filters:', filtersResult.error);
      } else {
        setTopFilters(filtersResult.data || []);
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

      {/* Funnel Drop-off Analysis */}
      {abandonmentDetails && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-semibold text-[#273140] mb-6 flex items-center">
            <TrendingUp className="w-6 h-6 mr-2" />
            Funnel Drop-off Analysis
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-red-50 border border-red-100 rounded-lg p-4">
              <div className="text-3xl font-bold text-red-800 mb-2">
                {abandonmentDetails.started_not_submitted}
              </div>
              <div className="text-sm font-medium text-red-700 mb-1">
                Started but Didn't Submit
              </div>
              <div className="text-xs text-red-600">
                Users who began filling the form but never clicked submit
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
              <div className="text-3xl font-bold text-orange-800 mb-2">
                {abandonmentDetails.submitted_not_completed}
              </div>
              <div className="text-sm font-medium text-orange-700 mb-1">
                Submitted but Didn't Complete
              </div>
              <div className="text-xs text-orange-600">
                Users who submitted the form but listing creation failed
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <div className="text-3xl font-bold text-blue-800 mb-2">
                {abandonmentDetails.avg_time_before_abandon_minutes
                  ? Math.round(abandonmentDetails.avg_time_before_abandon_minutes)
                  : 0}m
              </div>
              <div className="text-sm font-medium text-blue-700 mb-1">
                Avg Time Before Abandoning
              </div>
              <div className="text-xs text-blue-600">
                Average minutes spent before leaving the form
              </div>
            </div>
          </div>

          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-700">
              <span className="font-semibold">Total Abandoned Today:</span> {abandonmentDetails.total_abandoned}
              {abandonmentDetails.total_abandoned > 0 && abandonmentDetails.started_not_submitted > abandonmentDetails.submitted_not_completed && (
                <span className="ml-2 text-orange-700">
                  Most users abandon before submitting - consider simplifying the form or adding auto-save.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-[#273140] mb-6 flex items-center">
            <FileText className="w-6 h-6 mr-2" />
            Top Listings by Views
          </h2>

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