/**
 * Privacy-Preserving Analytics System
 *
 * This analytics library is designed with privacy as a core principle:
 * - IP addresses are pseudonymized via SHA-256 hashing on the server (never stored raw)
 * - Users are tracked using pseudonymous UUID identifiers (anon_id, session_id)
 * - No personally identifiable information (PII) is collected or stored
 * - All hashing is performed server-side in the track Edge Function
 * - Analytics data cannot be used to identify individual users
 *
 * For more details, see our Privacy Policy.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnalyticsEventName, AnalyticsEventPayload } from './analytics.types';

const ANALYTICS_DEBUG = ((import.meta as any)?.env?.VITE_ANALYTICS_DEBUG ?? 'false') === 'true';
const SUPABASE_URL = ((import.meta as any)?.env?.VITE_SUPABASE_URL) as string | undefined;
const TRACK_ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/track` : null;

const ANON_ID_KEY = 'ha_anon_id';
const SESSION_ID_KEY = 'ha_session_id';
const LAST_ACTIVITY_KEY = 'ha_session_last_activity';
const SESSION_FLAG_PREFIX = 'ha_flag:';
const POST_ATTEMPT_KEY = 'ha_post_attempt';
const POST_ATTEMPT_SESSION_KEY = 'ha_post_attempt_session';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const FLUSH_INTERVAL_MS = 3000; // 3 seconds
const FLUSH_BATCH_SIZE = 20;

type PendingEvent = AnalyticsEventPayload;

let supabaseClient: SupabaseClient | null = null;
let initialized = false;
let flushTimer: number | null = null;
let cachedAnonId: string | null = null;
let currentSessionId: string | null = null;
let lastActivityMs = 0;
let currentUserId: string | null = null;
const eventQueue: PendingEvent[] = [];
const sessionFlags = new Set<string>();

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function safeLocalGet(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore persistence failures
  }
}

function safeSessionGet(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeSessionRemove(key: string): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function readLastActivity(): number | null {
  const value = safeSessionGet(LAST_ACTIVITY_KEY);
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function persistLastActivity(ms: number): void {
  safeSessionSet(LAST_ACTIVITY_KEY, String(ms));
}

function getAnonId(): string {
  if (cachedAnonId) return cachedAnonId;
  const stored = safeLocalGet(ANON_ID_KEY);
  if (stored) {
    cachedAnonId = stored;
    return stored;
  }
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  cachedAnonId = id;
  safeLocalSet(ANON_ID_KEY, id);
  return id;
}

function getStoredSessionId(): string | null {
  return currentSessionId ?? safeSessionGet(SESSION_ID_KEY);
}

function setSessionId(id: string): void {
  currentSessionId = id;
  safeSessionSet(SESSION_ID_KEY, id);
}

function clearSessionState(): void {
  safeSessionRemove(SESSION_ID_KEY);
  safeSessionRemove(LAST_ACTIVITY_KEY);
  safeSessionRemove(POST_ATTEMPT_KEY);
  safeSessionRemove(POST_ATTEMPT_SESSION_KEY);
  clearSessionScopedFlags();
  currentSessionId = null;
  lastActivityMs = 0;
}

function clearSessionScopedFlags(): void {
  if (!isBrowser()) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith(SESSION_FLAG_PREFIX)) {
        keys.push(key);
      }
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // ignore
  }
  sessionFlags.clear();
}

function getFlag(key: string): boolean {
  if (sessionFlags.has(key)) return true;
  const stored = safeSessionGet(key);
  if (stored === '1') {
    sessionFlags.add(key);
    return true;
  }
  return false;
}

function setFlag(key: string): void {
  sessionFlags.add(key);
  safeSessionSet(key, '1');
}

function clearFlag(key: string): void {
  sessionFlags.delete(key);
  safeSessionRemove(key);
}

function enqueueEvent(
  sessionId: string,
  eventName: AnalyticsEventName,
  props: Record<string, unknown> = {},
  occurredAt?: string,
): void {
  const payload: PendingEvent = {
    session_id: sessionId,
    anon_id: getAnonId(),
    user_id: currentUserId,
    event_name: eventName,
    event_props: props ?? {},
    occurred_at: occurredAt ?? new Date().toISOString(),
  };

  eventQueue.push(payload);

  if (ANALYTICS_DEBUG) {
    console.log('[analytics] queue', eventName, props);
  }

  if (eventQueue.length >= FLUSH_BATCH_SIZE) {
    void flushEvents();
  }
}

async function flushEvents(options: { useKeepalive?: boolean } = {}): Promise<void> {
  if (!eventQueue.length) {
    return;
  }

  const events = eventQueue.splice(0, eventQueue.length);
  const body = { events };

  try {
    if (options.useKeepalive && typeof navigator !== 'undefined' && navigator.sendBeacon && TRACK_ENDPOINT) {
      const payload = JSON.stringify(body);
      const success = navigator.sendBeacon(TRACK_ENDPOINT, payload);
      if (!success) {
        throw new Error('sendBeacon rejected payload');
      }
      return;
    }

    if (!supabaseClient) {
      throw new Error('Supabase client not ready');
    }

    const fetchOptions = options.useKeepalive ? { keepalive: true } : undefined;
    const { error } = await supabaseClient.functions.invoke('track', {
      body,
      fetchOptions,
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    // Put events back at the front of the queue so they are retried later
    eventQueue.unshift(...events);
    if (ANALYTICS_DEBUG) {
      console.warn('[analytics] flush failed', error);
    }
  }
}

function startFlushTimer(): void {
  if (!isBrowser() || flushTimer !== null) {
    return;
  }
  flushTimer = window.setInterval(() => {
    void flushEvents();
  }, FLUSH_INTERVAL_MS);
}

function stopFlushTimer(): void {
  if (flushTimer !== null && isBrowser()) {
    window.clearInterval(flushTimer);
    flushTimer = null;
  }
}

function emitSessionBoundary(eventName: 'session_start' | 'session_end', sessionId: string, timestampMs: number): void {
  enqueueEvent(sessionId, eventName, {}, new Date(timestampMs).toISOString());
}

function ensureSession(nowMs: number = Date.now()): string {
  if (!isBrowser()) {
    if (!currentSessionId) {
      currentSessionId = crypto.randomUUID();
    }
    return currentSessionId;
  }

  if (!currentSessionId) {
    const storedId = getStoredSessionId();
    if (storedId) {
      currentSessionId = storedId;
      const storedActivity = readLastActivity();
      if (storedActivity) {
        lastActivityMs = storedActivity;
      }
    }
  }

  if (currentSessionId && lastActivityMs && nowMs - lastActivityMs >= IDLE_TIMEOUT_MS) {
    emitSessionBoundary('session_end', currentSessionId, lastActivityMs);
    clearSessionState();
  }

  if (!currentSessionId) {
    const newId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setSessionId(newId);
    lastActivityMs = nowMs;
    persistLastActivity(nowMs);
    emitSessionBoundary('session_start', newId, nowMs);
    return newId;
  }

  lastActivityMs = nowMs;
  persistLastActivity(nowMs);
  return currentSessionId;
}

function handleActivity(): void {
  ensureSession(Date.now());
}

function bindLifecycleListeners(): void {
  if (!isBrowser()) {
    return;
  }

  const activityEvents: (keyof DocumentEventMap | keyof WindowEventMap)[] = [
    'click',
    'keydown',
    'scroll',
    'visibilitychange',
  ];

  activityEvents.forEach((eventName) => {
    window.addEventListener(eventName, handleActivity, { passive: true });
  });

  window.addEventListener('beforeunload', () => {
    void flushEvents({ useKeepalive: true });
  });

  window.addEventListener('pagehide', () => {
    void flushEvents({ useKeepalive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushEvents({ useKeepalive: true });
    } else {
      handleActivity();
    }
  });
}

export function initAnalytics(client: SupabaseClient): void {
  supabaseClient = client;
  if (!isBrowser()) {
    return;
  }

  if (!initialized) {
    initialized = true;
    ensureSession(Date.now());
    bindLifecycleListeners();
    startFlushTimer();
  }
}

export function setUserId(userId?: string | null): void {
  currentUserId = userId ?? null;
}

export function track(eventName: AnalyticsEventName, props: Record<string, unknown> = {}): void {
  const sessionId = ensureSession(Date.now());
  enqueueEvent(sessionId, eventName, props);
}

export function trackPageView(): void {
  track('page_view', { path: isBrowser() ? window.location.pathname : undefined });
}

export function trackListingView(listingId: string): void {
  if (!listingId) return;
  const sessionId = ensureSession(Date.now());
  const flagKey = `${SESSION_FLAG_PREFIX}listing_view:${sessionId}:${listingId}`;
  if (getFlag(flagKey)) {
    return;
  }
  setFlag(flagKey);
  track('listing_view', { listing_id: listingId });
}

export function trackAgencyPageView(agencyId: string, slug?: string): void {
  if (!agencyId) return;
  const sessionId = ensureSession(Date.now());
  const flagKey = `${SESSION_FLAG_PREFIX}agency_page_view:${sessionId}:${agencyId}`;
  if (getFlag(flagKey)) {
    return;
  }
  setFlag(flagKey);
  const props: Record<string, unknown> = { agency_id: agencyId };
  if (slug) props.agency_slug = slug;
  track('agency_page_view', props);
}

export function trackListingImpressionBatch(listingIds: string[]): void {
  if (!listingIds.length) return;
  const sessionId = ensureSession(Date.now());
  const freshIds = listingIds.filter((id) => {
    if (!id) return false;
    const key = `${SESSION_FLAG_PREFIX}listing_impression:${sessionId}:${id}`;
    if (getFlag(key)) {
      return false;
    }
    setFlag(key);
    return true;
  });
  if (!freshIds.length) return;

  // Send batch event with array of listing IDs (view expects 'listing_ids' or 'ids')
  track('listing_impression_batch', { listing_ids: freshIds });
}

export function trackFilterApply(filters: Record<string, any>): void {
  const standardized: Record<string, unknown> = {};

  if (filters.bedrooms !== undefined) standardized.beds = filters.bedrooms;
  if (filters.min_price !== undefined) standardized.price_min = filters.min_price;
  if (filters.max_price !== undefined) standardized.price_max = filters.max_price;
  if (filters.neighborhoods) standardized.neighborhood = filters.neighborhoods;
  if (filters.poster_type) standardized.role = filters.poster_type;
  if (filters.property_type) standardized.property_type = filters.property_type;
  if (filters.parking_included !== undefined) standardized.parking_included = filters.parking_included;
  if (filters.no_fee_only !== undefined) standardized.no_fee_only = filters.no_fee_only;

  track('filter_apply', { filters: Object.keys(standardized).length ? standardized : filters });
}

export function trackSearchQuery(query: string): void {
  if (!query) return;
  track('search_query', { q: query });
}

export function trackAgencyFilterApply(filters: Record<string, any>): void {
  track('agency_filter_apply', { filters });
}

export function trackAgencyShare(agencyId: string): void {
  track('agency_share', { agency_id: agencyId });
}

export function trackPhoneClick(listingId: string): void {
  if (!listingId) return;
  track('phone_click', { listing_id: listingId });
}

function getPostingSession(): { attemptId: string; sessionId: string } {
  const sessionId = ensureSession(Date.now());
  let attemptId = safeSessionGet(POST_ATTEMPT_KEY);
  const attemptSession = safeSessionGet(POST_ATTEMPT_SESSION_KEY);
  if (!attemptId || attemptSession !== sessionId) {
    attemptId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    safeSessionSet(POST_ATTEMPT_KEY, attemptId);
    safeSessionSet(POST_ATTEMPT_SESSION_KEY, sessionId);
    ['started', 'submitted', 'success', 'abandoned'].forEach((flag) => {
      clearFlag(`${SESSION_FLAG_PREFIX}post:${flag}:${attemptId}`);
    });
  }
  return { attemptId, sessionId };
}

export function ensurePostAttempt(): string {
  const { attemptId } = getPostingSession();
  return attemptId;
}

export function trackPostStart(): void {
  const { attemptId } = getPostingSession();
  const flagKey = `${SESSION_FLAG_PREFIX}post:started:${attemptId}`;
  if (getFlag(flagKey)) {
    return;
  }
  setFlag(flagKey);
  clearFlag(`${SESSION_FLAG_PREFIX}post:abandoned:${attemptId}`);
  clearFlag(`${SESSION_FLAG_PREFIX}post:success:${attemptId}`);
  track('post_started', { attempt_id: attemptId });
}

export function trackPostSubmit(): void {
  const { attemptId } = getPostingSession();
  const flagKey = `${SESSION_FLAG_PREFIX}post:submitted:${attemptId}`;
  if (getFlag(flagKey)) {
    return;
  }
  setFlag(flagKey);
  track('post_submitted', { attempt_id: attemptId });
}

export function trackPostSuccess(listingId: string): void {
  const attemptId = safeSessionGet(POST_ATTEMPT_KEY);
  if (!attemptId) {
    return;
  }
  const flagKey = `${SESSION_FLAG_PREFIX}post:success:${attemptId}`;
  if (getFlag(flagKey)) {
    return;
  }
  setFlag(flagKey);
  track('post_success', { listing_id: listingId, attempt_id: attemptId });
  safeSessionRemove(POST_ATTEMPT_KEY);
  safeSessionRemove(POST_ATTEMPT_SESSION_KEY);
}

export function trackPostAbandoned(): void {
  const attemptId = safeSessionGet(POST_ATTEMPT_KEY);
  if (!attemptId) {
    return;
  }
  const started = getFlag(`${SESSION_FLAG_PREFIX}post:started:${attemptId}`);
  const success = getFlag(`${SESSION_FLAG_PREFIX}post:success:${attemptId}`);
  const abandonedKey = `${SESSION_FLAG_PREFIX}post:abandoned:${attemptId}`;

  if (started && !success && !getFlag(abandonedKey)) {
    setFlag(abandonedKey);
    track('post_abandoned', { attempt_id: attemptId });
    void flushEvents({ useKeepalive: true });
    safeSessionRemove(POST_ATTEMPT_KEY);
    safeSessionRemove(POST_ATTEMPT_SESSION_KEY);
  }
}

export function trackPostError(error: unknown, payload?: Record<string, any>): void {
  const attemptId = safeSessionGet(POST_ATTEMPT_KEY);
  if (!attemptId) {
    return;
  }

  const props: Record<string, unknown> = { attempt_id: attemptId };

  if (error instanceof Error) {
    props.error_message = error.message;
    if (error.name) props.error_name = error.name;
  } else if (typeof error === 'string') {
    props.error_message = error;
  } else {
    props.error_message = String(error);
  }

  if (payload) {
    const sanitizedPayload: Record<string, unknown> = {};
    if (payload.bedrooms !== undefined) sanitizedPayload.bedrooms = payload.bedrooms;
    if (payload.bathrooms !== undefined) sanitizedPayload.bathrooms = payload.bathrooms;
    if (payload.property_type) sanitizedPayload.property_type = payload.property_type;
    if (payload.neighborhood) sanitizedPayload.neighborhood = payload.neighborhood;
    if (payload.parking) sanitizedPayload.parking = payload.parking;
    if (payload.lease_length !== undefined) sanitizedPayload.lease_length = payload.lease_length;
    if (payload.is_featured !== undefined) sanitizedPayload.is_featured = payload.is_featured;
    if (payload.call_for_price !== undefined) sanitizedPayload.call_for_price = payload.call_for_price;
    if (payload.price !== undefined && payload.price !== null) sanitizedPayload.has_price = true;
    if (Object.keys(sanitizedPayload).length > 0) {
      props.payload = sanitizedPayload;
    }
  }

  track('post_error', props);
}

export function resetPostingState(): void {
  safeSessionRemove(POST_ATTEMPT_KEY);
  safeSessionRemove(POST_ATTEMPT_SESSION_KEY);
  if (!isBrowser()) {
    return;
  }
  const keys: string[] = [];
  for (let i = 0; i < window.sessionStorage.length; i += 1) {
    const key = window.sessionStorage.key(i);
    if (key && key.startsWith(`${SESSION_FLAG_PREFIX}post:`)) {
      keys.push(key);
    }
  }
  keys.forEach((key) => {
    sessionFlags.delete(key);
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  });
}

if (isBrowser()) {
  window.addEventListener('pagehide', () => {
    trackPostAbandoned();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      trackPostAbandoned();
    }
  });
}

export function shutdownAnalytics(): void {
  stopFlushTimer();
  eventQueue.splice(0, eventQueue.length);
}

export default {
  initAnalytics,
  setUserId,
  track,
  trackPageView,
  trackListingView,
  trackListingImpressionBatch,
  trackFilterApply,
  trackSearchQuery,
  trackAgencyPageView,
  trackAgencyFilterApply,
  trackAgencyShare,
  trackPhoneClick,
  ensurePostAttempt,
  trackPostStart,
  trackPostSubmit,
  trackPostSuccess,
  trackPostAbandoned,
  trackPostError,
  resetPostingState,
  shutdownAnalytics,
};
