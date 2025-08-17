// src/lib/ga.ts
type Params = Record<string, any>;

function hasWindow() {
  return typeof window !== "undefined";
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

/** Fire a GA4 event. Prefer gtag; fall back to dataLayer custom event. */
export function gaEvent(eventName: string, params: Params = {}): void {
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

export default { gaEvent, gaListing };
