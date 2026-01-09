import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Activity, Layers, Home, MessageSquare, ShieldCheck } from 'lucide-react';
import { useAuth, AUTH_CONTEXT_ID } from '@/hooks/useAuth';
import { supabase } from '../config/supabase';
import {
  DateRangePicker,
  DateRange,
  GlobalSnapshot,
  ListingDrilldown,
  TrafficTab,
  EngagementTab,
  ListingsTab,
  InquiriesTab,
  ValidationTab,
} from '../components/analytics';

type TabId = 'traffic' | 'engagement' | 'listings' | 'inquiries' | 'validation';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: TabConfig[] = [
  { id: 'traffic', label: 'Traffic & Retention', icon: Activity },
  { id: 'engagement', label: 'Engagement', icon: Layers },
  { id: 'listings', label: 'Listings', icon: Home },
  { id: 'inquiries', label: 'Inquiries', icon: MessageSquare },
  { id: 'validation', label: 'Validation', icon: ShieldCheck },
];

export function InternalAnalytics() {
  const navigate = useNavigate();
  const { user, profile, loading, authContextId } = useAuth();
  const isAdmin = profile?.is_admin === true;

  const [activeTab, setActiveTab] = useState<TabId>('traffic');
  const [dateRange, setDateRange] = useState<DateRange>(1);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drilldownListingId, setDrilldownListingId] = useState<string | null>(null);

  const [globalSnapshot, setGlobalSnapshot] = useState({
    sessions: 0,
    sessionsPrev: 0,
    uniqueVisitors: 0,
    uniqueVisitorsPrev: 0,
    returningRate: 0,
    returningRatePrev: 0,
    activeListings: 0,
    inquiries: 0,
    inquiriesPrev: 0,
  });

  const [sessionQuality, setSessionQuality] = useState<any>(null);
  const [dauSparkline, setDauSparkline] = useState<number[]>([]);
  const [engagementFunnel, setEngagementFunnel] = useState<any>(null);
  const [topFilters, setTopFilters] = useState<any[]>([]);
  const [supplyStats, setSupplyStats] = useState<any>(null);
  const [listingsPerformance, setListingsPerformance] = useState<any[]>([]);
  const [zeroInquiryListings, setZeroInquiryListings] = useState<any[]>([]);
  const [postingFunnel, setPostingFunnel] = useState<any>(null);
  const [inquiryQuality, setInquiryQuality] = useState<any>(null);
  const [inquiryTrend, setInquiryTrend] = useState<any[]>([]);
  const [velocity, setVelocity] = useState<any[]>([]);
  const [topInquired, setTopInquired] = useState<any[]>([]);
  const [demand, setDemand] = useState<any>(null);
  const [timing, setTiming] = useState<any[]>([]);
  const [abuseSignals, setAbuseSignals] = useState<any[]>([]);

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
    }
    if (!loading && profile === undefined) {
      console.warn('[InternalAnalytics] profile undefined after loading');
    }
  }, [loading, user, profile, isAdmin, authContextId]);

  useEffect(() => {
    if (loading || (user && profile === undefined)) return;
    if (!user || !profile || !isAdmin) {
      navigate('/', { replace: true });
    }
  }, [loading, user, profile, isAdmin, navigate]);

  const loadAnalyticsData = useCallback(async () => {
    if (!user || !isAdmin) return;

    try {
      setDataLoading(true);
      setError(null);

      const tz = 'America/New_York';
      const prevRange = dateRange;

      const results = await Promise.all([
        supabase.rpc('analytics_session_quality', { days_back: dateRange, tz }),
        supabase.rpc('analytics_session_quality', { days_back: dateRange * 2, tz }),
        supabase.rpc('analytics_kpis_with_sparkline', { tz }),
        supabase.rpc('analytics_engagement_funnel', { days_back: dateRange, tz }),
        supabase.rpc('analytics_top_filters', { days_back: dateRange, tz, limit_count: 15 }),
        supabase.rpc('analytics_supply_stats', { days_back: dateRange, tz }),
        supabase.rpc('analytics_listings_performance', { days_back: dateRange, tz, limit_count: 20 }),
        supabase.rpc('analytics_zero_inquiry_listings', { days_back: dateRange, tz, min_views: 10 }),
        supabase.rpc('analytics_summary', { days_back: dateRange, tz }),
        supabase.rpc('analytics_inquiry_quality', { days_back: dateRange, tz }),
        supabase.rpc('analytics_inquiry_quality', { days_back: dateRange * 2, tz }),
        supabase.rpc('analytics_inquiry_trend', { days_back: dateRange, tz }),
        supabase.rpc('analytics_inquiry_velocity', { days_back: dateRange, tz }),
        supabase.rpc('analytics_top_inquired_listings', { days_back: dateRange, tz, limit_count: 10 }),
        supabase.rpc('analytics_inquiry_demand', { days_back: dateRange, tz }),
        supabase.rpc('analytics_inquiry_timing', { days_back: dateRange, tz }),
        supabase.rpc('analytics_abuse_signals', { days_back: dateRange, tz, mild_threshold: 6, extreme_threshold: 15 }),
        supabase.rpc('analytics_contact_submissions_summary', { days_back: dateRange, tz }),
        supabase.rpc('analytics_contact_submissions_summary', { days_back: dateRange * 2, tz }),
      ]);

      const firstError = results.find(r => r.error);
      if (firstError?.error) {
        const errorMessage = firstError.error.message || 'Unknown error';
        if (errorMessage.includes('Admin access required') || errorMessage.includes('Authentication required')) {
          setError('You do not have permission to view analytics data.');
        } else {
          setError(`Failed to load analytics: ${errorMessage}`);
        }
        return;
      }

      const [
        sessionQualityResult,
        sessionQualityPrevResult,
        kpisResult,
        engagementResult,
        filtersResult,
        supplyResult,
        performanceResult,
        zeroInquiryResult,
        summaryResult,
        inquiryQualityResult,
        inquiryQualityPrevResult,
        inquiryTrendResult,
        velocityResult,
        topInquiredResult,
        demandResult,
        timingResult,
        abuseResult,
        contactSummaryResult,
        contactSummaryPrevResult,
      ] = results;

      if (sessionQualityResult.data?.[0]) {
        setSessionQuality(sessionQualityResult.data[0]);
      }

      if (kpisResult.data?.[0]) {
        const kpi = kpisResult.data[0];
        setDauSparkline(Array.isArray(kpi.sparkline_dau) ? kpi.sparkline_dau : []);
      }

      const currentSession = sessionQualityResult.data?.[0];
      const prevSession = sessionQualityPrevResult.data?.[0];
      const currentContact = contactSummaryResult.data?.[0];
      const prevContact = contactSummaryPrevResult.data?.[0];

      setGlobalSnapshot({
        sessions: currentSession?.total_sessions || 0,
        sessionsPrev: prevSession?.total_sessions || 0,
        uniqueVisitors: currentSession?.unique_visitors || 0,
        uniqueVisitorsPrev: prevSession?.unique_visitors || 0,
        returningRate: currentSession?.returning_visitor_rate || 0,
        returningRatePrev: prevSession?.returning_visitor_rate || 0,
        activeListings: supplyResult.data?.[0]?.active_count || 0,
        inquiries: currentContact?.total_submissions || 0,
        inquiriesPrev: prevContact?.total_submissions || 0,
      });

      if (engagementResult.data?.[0]) {
        const raw = engagementResult.data[0];
        setEngagementFunnel({
          sessions: raw.total_sessions ?? 0,
          impressions: raw.total_impressions ?? 0,
          listing_views: raw.total_views ?? 0,
          contact_attempts: raw.total_inquiries ?? 0,
        });
      }

      setTopFilters(filtersResult.data || []);

      if (supplyResult.data?.[0]) {
        setSupplyStats(supplyResult.data[0]);
      }

      setListingsPerformance(performanceResult.data || []);
      setZeroInquiryListings(zeroInquiryResult.data || []);

      if (summaryResult.data?.[0]) {
        const summary = summaryResult.data[0];
        setPostingFunnel({
          starts: summary.post_starts || 0,
          submits: summary.post_submits || 0,
          successes: summary.post_successes || 0,
          abandoned: summary.post_abandoned || 0,
          successRate: summary.post_starts > 0 ? Math.round((summary.post_successes / summary.post_starts) * 100) : 0,
          abandonRate: summary.post_starts > 0 ? Math.round((summary.post_abandoned / summary.post_starts) * 100) : 0,
        });
      }

      if (inquiryQualityResult.data?.[0]) {
        setInquiryQuality(inquiryQualityResult.data[0]);
      }

      setInquiryTrend(inquiryTrendResult.data || []);
      setVelocity(velocityResult.data || []);
      setTopInquired(topInquiredResult.data || []);

      if (demandResult.data?.[0]) {
        setDemand(demandResult.data[0]);
      }

      setTiming(timingResult.data || []);
      setAbuseSignals(abuseResult.data || []);

    } catch (err) {
      console.error('Error loading analytics:', err);
      setError('Failed to load analytics data. Please try again.');
    } finally {
      setDataLoading(false);
    }
  }, [user, isAdmin, dateRange]);

  useEffect(() => {
    if (user && isAdmin) {
      loadAnalyticsData();
    }
  }, [user, isAdmin, dateRange, loadAnalyticsData]);

  const handleListingClick = (listingId: string) => {
    setDrilldownListingId(listingId);
  };

  if (loading || (user && profile === undefined)) {
    return <div className="p-4 text-center text-sm text-gray-500">Checking access...</div>;
  }

  if (!user || !profile || !isAdmin) {
    return null;
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#273140] flex items-center">
            <BarChart3 className="w-8 h-8 mr-3" />
            Analytics Hub
          </h1>
        </div>
        <div className="text-center py-12">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
            <p className="text-red-800">{error}</p>
            <button
              onClick={() => loadAnalyticsData()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#273140] flex items-center">
            <BarChart3 className="w-8 h-8 mr-3" />
            Analytics Hub
          </h1>
          <p className="text-gray-600 mt-1">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'America/New_York',
            })}
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <GlobalSnapshot data={globalSnapshot} loading={dataLoading} />

      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-[#273140] text-[#273140]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'traffic' && (
        <TrafficTab
          sessionQuality={sessionQuality}
          sparklineData={dauSparkline}
          loading={dataLoading}
        />
      )}

      {activeTab === 'engagement' && (
        <EngagementTab
          funnelData={engagementFunnel}
          topFilters={topFilters}
          loading={dataLoading}
        />
      )}

      {activeTab === 'listings' && (
        <ListingsTab
          supplyStats={supplyStats}
          listingsPerformance={listingsPerformance}
          zeroInquiryListings={zeroInquiryListings}
          postingFunnel={postingFunnel}
          onListingClick={handleListingClick}
          loading={dataLoading}
        />
      )}

      {activeTab === 'inquiries' && (
        <InquiriesTab
          inquiryQuality={inquiryQuality}
          inquiryTrend={inquiryTrend}
          velocity={velocity}
          topInquired={topInquired}
          demand={demand}
          timing={timing}
          abuseSignals={abuseSignals}
          onListingClick={handleListingClick}
          loading={dataLoading}
        />
      )}

      {activeTab === 'validation' && (
        <ValidationTab loading={dataLoading} />
      )}

      <ListingDrilldown
        listingId={drilldownListingId}
        onClose={() => setDrilldownListingId(null)}
        daysBack={dateRange}
      />
    </div>
  );
}
