// src/lib/analytics.ts
export type ListingContext = {
  listing_id: string;
  title?: string;
  neighborhood?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  agent_id?: string;
  agent_name?: string;
  is_featured?: boolean;
};

function getDL() {
  if (typeof window === "undefined") return null;
  (window as any).dataLayer = (window as any).dataLayer || [];
  return (window as any).dataLayer as any[];
}

export function track(event: string, params: Record<string, any> = {}) {
  const dl = getDL();
  if (!dl) return;
  dl.push({ event, ...params });
}

export function listingEvent(
  event: string,
  ctx: ListingContext,
  extra: Record<string, any> = {}
) {
  track(event, { ...ctx, ...extra });
}

// Optional: safe no-op for SSR/testing
export const Analytics = { track, listingEvent };
