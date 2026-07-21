// src/lib/ga.ts
import { track } from './analytics';
import type { AnalyticsEventName } from './analytics.types';

type Params = Record<string, any>;

export const GA_MEASUREMENT_ID = 'G-Q27FCJ5TG9';

function hasWindow() {
  return typeof window !== "undefined";
}

/**
 * Disable/enable GA4 collection for this browser (official gtag opt-out
 * flag). Used to keep admin browsing out of GA, mirroring the internal
 * analytics admin suppression.
 */
export function setGADisabled(disabled: boolean): void {
  if (!hasWindow()) return;
  (window as any)[`ga-disable-${GA_MEASUREMENT_ID}`] = disabled;
}

function getGtag(): ((...args: any[]) => void) | null {
  if (!hasWindow()) return null;
  const g = (window as any).gtag;
  return typeof g === "function" ? g : null;
}

function pushDataLayer(obj: Params) {
  if (!hasWindow()) return;
  (window as any).dataLayer = (window as any).dataLayer || [];
  (window as any).dataLayer.push(obj);
}

// GA events mirrored into the internal analytics pipeline so the internal
// dashboard sees the same intent signals GA does. Events whose call sites
// already fire an internal track alongside the GA call (listing_view,
// filter_apply, listing_impression_batch, commercial_listing_view) are
// deliberately absent to avoid double counting.
const INTERNAL_MIRROR: Record<string, AnalyticsEventName> = {
  listing_favorite: 'listing_favorite',
  listing_unfavorite: 'listing_unfavorite',
  share_listing_success: 'listing_share',
  listing_click: 'listing_click',
  listing_image_zoom: 'listing_image_zoom',
  listing_scroll: 'listing_scroll',
  commercial_listing_scroll: 'listing_scroll',
  listing_contact_click: 'contact_click',
  commercial_listing_contact_click: 'contact_click',
  smart_search: 'search_query',
  listing_reported_as_rented: 'listing_reported_rented',
  commercial_listing_reported: 'listing_reported_rented',
};

function mirrorToInternal(eventName: string, params: Params): void {
  const internalName = INTERNAL_MIRROR[eventName];
  if (!internalName) return;
  try {
    const props: Params = { ...params };
    if (eventName === 'smart_search' && props.query !== undefined) {
      props.q = props.query;
      delete props.query;
    }
    if (eventName.startsWith('commercial_') && props.listing_type === undefined) {
      props.listing_type = 'commercial';
    }
    track(internalName, props);
  } catch (_) {
    // internal mirror must never break the GA path
  }
}

/** Fire a GA4 event. Prefer gtag; fall back to dataLayer custom event. */
export function gaEvent(eventName: string, params: Params = {}): void {
  mirrorToInternal(eventName, params);
  const gtag = getGtag();
  if (gtag) {
    try {
      gtag("event", eventName, params);
      return;
    } catch (_) {
      // noop
    }
  }
  // Fallback: still emit something GTM/GA can pick up later
  pushDataLayer({ event: eventName, ...params });
}

/** Convenience: ensure we always include a listing_id when available */
export function gaListing(eventName: string, listingId: string | number, params: Params = {}) {
  gaEvent(eventName, { listing_id: String(listingId), ...params });
}

export default { gaEvent, gaListing, setGADisabled };
