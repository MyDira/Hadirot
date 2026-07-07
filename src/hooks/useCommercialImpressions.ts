import { useRef, useCallback, useEffect } from 'react';
import { supabase } from '../config/supabase';

// Commercial impressions live on the row (commercial_listings.impressions is
// the source of truth — see migration 20260630000000), so cards report them
// via a batched RPC instead of the residential analytics-events pipeline.
// Session-deduped: each listing counts at most once per browser session.

const SEEN_KEY = 'commercial_impressions_seen';
const FLUSH_DELAY_MS = 1500;

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function markSeen(ids: string[]): void {
  try {
    const seen = readSeen();
    ids.forEach(id => seen.add(id));
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* storage unavailable — impressions just won't dedupe this session */
  }
}

export function useCommercialImpressions() {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pendingRef = useRef<Set<string>>(new Set());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const ids = [...pendingRef.current];
    pendingRef.current.clear();
    if (ids.length === 0) return;
    markSeen(ids);
    try {
      await supabase.rpc('increment_commercial_listing_impressions', { p_listing_ids: ids });
    } catch (err) {
      console.error('Commercial impression flush failed:', err);
    }
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const seen = readSeen();
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.commercialListingId;
          if (entry.isIntersecting && id && !seen.has(id) && !pendingRef.current.has(id)) {
            pendingRef.current.add(id);
          }
        }
        if (pendingRef.current.size > 0) {
          if (flushTimer.current) clearTimeout(flushTimer.current);
          flushTimer.current = setTimeout(() => void flush(), FLUSH_DELAY_MS);
        }
      },
      { threshold: 0.5 },
    );

    return () => {
      observerRef.current?.disconnect();
      if (flushTimer.current) clearTimeout(flushTimer.current);
      void flush();
    };
  }, [flush]);

  const observeCommercial = useCallback((el: Element | null, id: string) => {
    if (el && observerRef.current) {
      (el as HTMLElement).dataset.commercialListingId = id;
      observerRef.current.observe(el);
    }
  }, []);

  return { observeCommercial };
}
