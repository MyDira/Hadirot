import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/config/supabase';

// Simple debug flag controlled by env (off by default)
// Vite exposes env vars on import.meta.env
const ANALYTICS_DEBUG = ((import.meta as any)?.env?.VITE_ANALYTICS_DEBUG ?? 'false') === 'true';

interface TrackProperties {
  [key: string]: any;
}

interface SessionData {
  session_id: string;
}

class AnalyticsTracker {
  private sessionData: SessionData | null = null;
  private utmSentFallback = new Map<string, boolean>();
  private postingSessionId: string | null = null;

  private sessionGet(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private sessionSet(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }

  private sessionRemove(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

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

      if (ANALYTICS_DEBUG) {
        console.log('[analytics] emit', eventName, properties);
      }

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

      // Send to Edge Function using Supabase client
      const { data, error } = await supabase.functions.invoke('track', {
        body: eventData,
      });

      if (error) {
        console.debug('[analytics.track] error (swallowed):', error);
        return;
      }

      if (data?.skipped) {
        console.log('Analytics event skipped:', data.skipped);
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
    // Prevent duplicate tracking within the same session
    const viewKey = `listing_view_tracked_${listingId}`;
    const hasTracked = this.sessionGet(viewKey);

    if (!hasTracked) {
      await this.track('listing_view', { listing_id: listingId });
      this.sessionSet(viewKey, 'true');
    }
  }

  async trackListingImpressionBatch(listingIds: string[]): Promise<void> {
    if (!listingIds.length) return;

    const newIds = listingIds.filter((id) => !this.sessionGet(`listing_impression_${id}`));
    if (!newIds.length) return;

    await this.track('listing_impression_batch', { ids: newIds });
    newIds.forEach((id) => this.sessionSet(`listing_impression_${id}`, 'true'));
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
  private getPostingSessionId(): string | null {
    if (this.postingSessionId) return this.postingSessionId;
    const id = this.sessionGet('posting_session_id');
    this.postingSessionId = id;
    return id;
  }

  private ensurePostingSession(): string {
    let id = this.getPostingSessionId();
    if (!id) {
      id = Date.now().toString();
      this.postingSessionId = id;
      this.sessionSet('posting_session_id', id);
    }
    return id;
  }

  private clearPostingSession(): void {
    const id = this.getPostingSessionId();
    if (id) {
      ['started', 'submitted', 'succeeded', 'abandoned'].forEach((flag) =>
        this.sessionRemove(`posting_${flag}_${id}`),
      );
      this.sessionRemove('posting_session_id');
    }
    this.postingSessionId = null;
  }

  async trackPostStart(): Promise<void> {
    const sessionId = this.ensurePostingSession();
    const startedKey = `posting_started_${sessionId}`;
    if (!this.sessionGet(startedKey)) {
      if (ANALYTICS_DEBUG) console.log('[analytics] post_start');
      this.sessionSet(startedKey, 'true');
      this.sessionRemove(`posting_succeeded_${sessionId}`);
      this.sessionRemove(`posting_submitted_${sessionId}`);
      this.sessionRemove(`posting_abandoned_${sessionId}`);
      await this.track('listing_post_start');
    }
  }

  async trackPostSubmit(): Promise<void> {
    const sessionId = this.getPostingSessionId();
    if (!sessionId) return;
    const hasStarted = this.sessionGet(`posting_started_${sessionId}`);
    const hasSubmitted = this.sessionGet(`posting_submitted_${sessionId}`);
    if (hasStarted === 'true' && hasSubmitted !== 'true') {
      if (ANALYTICS_DEBUG) console.log('[analytics] post_submit');
      this.sessionSet(`posting_submitted_${sessionId}`, 'true');
      await this.track('listing_post_submit');
    }
  }

  async trackPostSuccess(listingId: string): Promise<void> {
    const sessionId = this.getPostingSessionId();
    if (!sessionId) return;
    const hasStarted = this.sessionGet(`posting_started_${sessionId}`);
    const hasSucceeded = this.sessionGet(`posting_succeeded_${sessionId}`);
    if (hasStarted === 'true' && hasSucceeded !== 'true') {
      if (ANALYTICS_DEBUG) console.log('[analytics] post_success');
      this.sessionSet(`posting_succeeded_${sessionId}`, 'true');
      await this.track('listing_post_submit_success', { listing_id: listingId });
      this.clearPostingSession();
    }
  }

  async trackPostAbandoned(): Promise<void> {
    const sessionId = this.getPostingSessionId();
    if (!sessionId) return;
    const hasStarted = this.sessionGet(`posting_started_${sessionId}`);
    const hasSucceeded = this.sessionGet(`posting_succeeded_${sessionId}`);
    const hasAbandoned = this.sessionGet(`posting_abandoned_${sessionId}`);

    // Only track abandonment if posting was started but not succeeded
    if (hasStarted === 'true' && hasSucceeded !== 'true' && hasAbandoned !== 'true') {
      if (ANALYTICS_DEBUG) console.log('[analytics] post_abandoned');
      this.sessionSet(`posting_abandoned_${sessionId}`, 'true');
      await this.track('listing_post_abandoned');
      this.clearPostingSession();
    }
  }

  // Reset posting state (useful for cleanup)
  resetPostingState(): void {
    this.clearPostingSession();
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

// Setup page unload tracking for post abandonment (bind once)
let postingListenersBound = false;
if (typeof window !== 'undefined' && !postingListenersBound) {
  postingListenersBound = true;
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
