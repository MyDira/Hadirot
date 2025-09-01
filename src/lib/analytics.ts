import React from 'react';
import { useAuth } from '../hooks/useAuth';

interface TrackProperties {
  [key: string]: any;
}

interface SessionData {
  session_id: string;
}

class AnalyticsTracker {
  private sessionData: SessionData | null = null;
  private postingStarted = false;
  private postingSucceeded = false;
  private impressionCache = new Map<string, number>();
  private readonly IMPRESSION_THROTTLE_MS = 4000; // 4 seconds
  private utmSentFallback = new Map<string, boolean>();
  private missingAnonKeyWarned = false;

  private getSessionData(): SessionData {
    if (this.sessionData) {
      return this.sessionData;
    }

    // Try to load existing session from localStorage
    try {
      const stored = localStorage.getItem('analytics_session');
      if (stored) {
        this.sessionData = JSON.parse(stored);
        if (this.sessionData?.session_id) {
          return this.sessionData;
        }
      }
    } catch (error) {
      console.warn('Failed to load analytics session from localStorage:', error);
    }

    // Generate new session
    const session_id = crypto.randomUUID();

    this.sessionData = {
      session_id,
    };

    // Persist to localStorage
    try {
      localStorage.setItem('analytics_session', JSON.stringify(this.sessionData));
    } catch (error) {
      console.warn('Failed to save analytics session to localStorage:', error);
    }

    return this.sessionData;
  }

  private getCurrentUserId(): string | undefined {
    // This is a bit tricky since we can't use hooks here
    // We'll need to access the auth state differently
    try {
      // Try to get user from the auth context if available
      const authData = (window as any).__auth_user_id;
      return authData || undefined;
    } catch {
      return undefined;
    }
  }

  async track(eventName: string, properties: TrackProperties = {}): Promise<void> {
    try {
      const sessionData = this.getSessionData();
      const userId = this.getCurrentUserId();
      
      // Prepare base event data
      const eventData = {
        event_name: eventName,
        session_id: sessionData.session_id,
        user_id: userId,
        page: window.location.pathname,
        referrer: document.referrer || undefined,
        props: {
          ...properties,
          schema_version: 1,
        },
      };

      // Attach UTM parameters only on first page_view of the session
      if (eventName === 'page_view') {
        const flagKey = `had_utm_sent_v1:${sessionData.session_id}`;
        let utmAlreadySent = false;
        try {
          utmAlreadySent = localStorage.getItem(flagKey) === '1';
        } catch {
          utmAlreadySent = this.utmSentFallback.get(sessionData.session_id) === true;
        }

        if (!utmAlreadySent) {
          const urlParams = new URLSearchParams(window.location.search);
          const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
          const utmParams: Record<string, string> = {};

          for (const key of utmKeys) {
            const value = urlParams.get(key);
            if (value) {
              utmParams[key] = value;
            }
          }

          if (Object.keys(utmParams).length > 0) {
            eventData.props.attribution = utmParams;
          }

          try {
            localStorage.setItem(flagKey, '1');
          } catch {
            this.utmSentFallback.set(sessionData.session_id, true);
          }
        }
      }

      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      if (!anonKey && !this.missingAnonKeyWarned) {
        console.warn('VITE_SUPABASE_ANON_KEY is missing');
        this.missingAnonKeyWarned = true;
      }

      // Send to Edge Function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify(eventData),
        keepalive: true, // Ensure events send even during page unload
      });

      if (response.status === 401) {
        console.debug('analytics track 401; likely missing anon key or function policy');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn('Analytics tracking failed:', {
          status: response.status,
          error: errorData,
          eventName,
        });
      } else {
        const result = await response.json();
        if (result.skipped) {
          console.log('Analytics event skipped:', result.skipped);
        }
      }
    } catch (error) {
      console.warn('Analytics tracking error:', error);
      // Don't throw - analytics failures shouldn't break the app
    }
  }

  // Specialized methods for common events
  async trackPageView(): Promise<void> {
    await this.track('page_view');
  }

  async trackListingView(listingId: string): Promise<void> {
    await this.track('listing_view', { listing_id: listingId });
  }

  async trackListingImpressionBatch(listingIds: string[]): Promise<void> {
    if (!listingIds.length) return;

    // Create cache key from sorted IDs
    const cacheKey = [...listingIds].sort().join(',');
    const now = Date.now();
    const lastSent = this.impressionCache.get(cacheKey);

    // Throttle duplicate impressions
    if (lastSent && (now - lastSent) < this.IMPRESSION_THROTTLE_MS) {
      return;
    }

    this.impressionCache.set(cacheKey, now);
    
    // Clean old cache entries (keep only last 10 minutes)
    const tenMinutesAgo = now - (10 * 60 * 1000);
    for (const [key, timestamp] of this.impressionCache.entries()) {
      if (timestamp < tenMinutesAgo) {
        this.impressionCache.delete(key);
      }
    }

    await this.track('listing_impression_batch', { ids: listingIds });
  }

  async trackFilterApply(filters: Record<string, any>): Promise<void> {
    // Standardize filter properties
    const standardizedFilters: Record<string, any> = {};
    
    if (filters.bedrooms !== undefined) standardizedFilters.beds = filters.bedrooms;
    if (filters.min_price !== undefined) standardizedFilters.price_min = filters.min_price;
    if (filters.max_price !== undefined) standardizedFilters.price_max = filters.max_price;
    if (filters.neighborhoods) standardizedFilters.neighborhood = filters.neighborhoods;
    if (filters.poster_type) standardizedFilters.role = filters.poster_type;
    if (filters.property_type) standardizedFilters.property_type = filters.property_type;
    if (filters.parking_included) standardizedFilters.parking_included = filters.parking_included;
    if (filters.no_fee_only) standardizedFilters.no_fee_only = filters.no_fee_only;

    await this.track('filter_apply', { filters: standardizedFilters });
  }

  async trackSearchQuery(query: string): Promise<void> {
    await this.track('search_query', { q: query });
  }

  // Post funnel tracking with state management
  async trackPostStart(): Promise<void> {
    this.postingStarted = true;
    this.postingSucceeded = false;
    await this.track('listing_post_start');
  }

  async trackPostSubmit(): Promise<void> {
    await this.track('listing_post_submit');
  }

  async trackPostSuccess(listingId: string): Promise<void> {
    this.postingSucceeded = true;
    await this.track('listing_post_submit_success', { listing_id: listingId });
  }

  async trackPostAbandoned(): Promise<void> {
    // Only track abandonment if posting was started but not succeeded
    if (this.postingStarted && !this.postingSucceeded) {
      await this.track('listing_post_abandoned');
      this.postingStarted = false;
    }
  }

  // Reset posting state (useful for cleanup)
  resetPostingState(): void {
    this.postingStarted = false;
    this.postingSucceeded = false;
  }
}

// Create singleton instance
const analytics = new AnalyticsTracker();

// Export the main track function and specialized methods
export const track = analytics.track.bind(analytics);
export const trackPageView = analytics.trackPageView.bind(analytics);
export const trackListingView = analytics.trackListingView.bind(analytics);
export const trackListingImpressionBatch = analytics.trackListingImpressionBatch.bind(analytics);
export const trackFilterApply = analytics.trackFilterApply.bind(analytics);
export const trackSearchQuery = analytics.trackSearchQuery.bind(analytics);
export const trackPostStart = analytics.trackPostStart.bind(analytics);
export const trackPostSubmit = analytics.trackPostSubmit.bind(analytics);
export const trackPostSuccess = analytics.trackPostSuccess.bind(analytics);
export const trackPostAbandoned = analytics.trackPostAbandoned.bind(analytics);
export const resetPostingState = analytics.resetPostingState.bind(analytics);

// Hook to provide user ID to analytics
export function useAnalyticsAuth() {
  const { user } = useAuth();
  
  React.useEffect(() => {
    // Store user ID globally so analytics can access it
    (window as any).__auth_user_id = user?.id;
    
    return () => {
      (window as any).__auth_user_id = undefined;
    };
  }, [user?.id]);
}

// Setup page unload tracking for post abandonment
if (typeof window !== 'undefined') {
  // Track post abandonment on page unload
  const handleBeforeUnload = () => {
    analytics.trackPostAbandoned();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      analytics.trackPostAbandoned();
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

export default analytics;