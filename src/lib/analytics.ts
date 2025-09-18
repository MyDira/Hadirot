import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/config/supabase';

// Simple debug flag controlled by env (off by default)
// Vite exposes env vars on import.meta.env
const ANALYTICS_DEBUG = ((import.meta as any)?.env?.VITE_ANALYTICS_DEBUG ?? 'false') === 'true';
const SUPABASE_URL = ((import.meta as any)?.env?.VITE_SUPABASE_URL) as string | undefined;
const TRACK_FN_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/track` : undefined;

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
  private postingFlags = new Set<string>();

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

  private hasFlag(key: string): boolean {
    return this.postingFlags.has(key) || this.sessionGet(key) === 'true';
  }

  private setFlag(key: string): void {
    this.postingFlags.add(key);
    this.sessionSet(key, 'true');
  }

  private clearFlag(key: string): void {
    this.postingFlags.delete(key);
    this.sessionRemove(key);
  }

  private flagKey(flag: string, id: string): string {
    return `posting_${flag}_${id}`;
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

  private beacon(eventName: string, properties: TrackProperties = {}): void {
    try {
      if (!TRACK_FN_URL) return;
      const sessionData = this.getSessionData();
      const userId = this.getCurrentUserId();
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
      const payload = JSON.stringify(eventData);

      if (ANALYTICS_DEBUG) {
        console.log('[analytics] beacon', eventName, properties);
      }

      if (navigator.sendBeacon) {
        navigator.sendBeacon(TRACK_FN_URL, payload);
      } else {
        fetch(TRACK_FN_URL, {
          method: 'POST',
          body: payload,
          headers: { 'Content-Type': 'text/plain' },
          keepalive: true,
        }).catch(() => {});
      }
    } catch (err) {
      console.debug('[analytics.beacon] error (swallowed):', err);
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

  async trackAgencyPageView(agencyId: string, slug?: string): Promise<void> {
    if (!agencyId) {
      return;
    }

    const viewKey = `agency_page_view_tracked_${agencyId}`;
    if (this.sessionGet(viewKey)) {
      return;
    }

    const props: Record<string, any> = { agency_id: agencyId };
    if (slug) {
      props.agency_slug = slug;
    }

    await this.track('agency_page_view', props);
    this.sessionSet(viewKey, 'true');
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

  // Allow external callers to initialize a posting attempt without
  // emitting any events (e.g., first interaction before we know if the
  // user has a draft). Returns the current attempt id.
  initPostingAttempt(): string {
    return this.ensurePostingSession();
  }

  private clearPostingSession(): void {
    const id = this.getPostingSessionId();
    if (id) {
      ['started', 'submitted', 'succeeded', 'abandoned'].forEach((flag) =>
        this.clearFlag(this.flagKey(flag, id!)),
      );
      this.sessionRemove('posting_session_id');
    }
    this.postingSessionId = null;
  }

  async trackPostStart(): Promise<void> {
    const sessionId = this.ensurePostingSession();
    const startedKey = this.flagKey('started', sessionId);
    if (!this.hasFlag(startedKey)) {
      if (ANALYTICS_DEBUG) console.log('[analytics] post_start');
      this.setFlag(startedKey);
      ['succeeded', 'submitted', 'abandoned'].forEach((flag) =>
        this.clearFlag(this.flagKey(flag, sessionId)),
      );
      await this.track('listing_post_start', { attempt_id: sessionId });
    }
  }

  async trackPostSubmit(): Promise<void> {
    const sessionId = this.ensurePostingSession();
    const submitKey = this.flagKey('submitted', sessionId);
    if (!this.hasFlag(submitKey)) {
      if (ANALYTICS_DEBUG) console.log('[analytics] post_submit');
      this.setFlag(submitKey);
      await this.track('listing_post_submit', { attempt_id: sessionId });
    }
  }

  async trackPostSuccess(listingId: string): Promise<void> {
    const sessionId = this.getPostingSessionId();
    if (!sessionId) return;
    const successKey = this.flagKey('succeeded', sessionId);
    if (!this.hasFlag(successKey)) {
      if (ANALYTICS_DEBUG) console.log('[analytics] post_success');
      this.setFlag(successKey);
      await this.track('listing_post_success', { listing_id: listingId, attempt_id: sessionId });
      this.clearPostingSession();
    }
  }

  async trackPostAbandoned(): Promise<void> {
    const sessionId = this.getPostingSessionId();
    if (!sessionId) return;
    const started = this.hasFlag(this.flagKey('started', sessionId));
    const succeeded = this.hasFlag(this.flagKey('succeeded', sessionId));
    const abandonedKey = this.flagKey('abandoned', sessionId);

    if (started && !succeeded && !this.hasFlag(abandonedKey)) {
      if (ANALYTICS_DEBUG) console.log('[analytics] post_abandoned');
      this.setFlag(abandonedKey);
      this.beacon('listing_post_abandoned', { attempt_id: sessionId });
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
export const trackEvent = analytics.track.bind(analytics); // Alias for compatibility
export const trackPageView = analytics.trackPageView.bind(analytics);
export const trackListingView = analytics.trackListingView.bind(analytics);
export const trackListingImpressionBatch = analytics.trackListingImpressionBatch.bind(analytics);
export const trackFilterApply = analytics.trackFilterApply.bind(analytics);
export const trackSearchQuery = analytics.trackSearchQuery.bind(analytics);
export const trackAgencyPageView = analytics.trackAgencyPageView.bind(analytics);
export const ensurePostAttempt = analytics.initPostingAttempt.bind(analytics);
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

// Setup page hide tracking for post abandonment (bind once)
let postingListenersBound = false;
if (typeof window !== 'undefined' && !postingListenersBound) {
  postingListenersBound = true;
  const handlePageHide = () => {
    analytics.trackPostAbandoned();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      analytics.trackPostAbandoned();
    }
  };

  window.addEventListener('pagehide', handlePageHide);
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

export default analytics;
