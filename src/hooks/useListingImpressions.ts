import { useEffect, useRef, useCallback } from 'react';
import { trackListingImpressionBatch } from '../lib/analytics';

interface UseListingImpressionsOptions {
  listingIds: string[];
  threshold?: number; // Percentage of element that must be visible (0-1)
  rootMargin?: string; // Margin around the root
}

export function useListingImpressions({
  listingIds,
  threshold = 0.5,
  rootMargin = '0px'
}: UseListingImpressionsOptions) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementsRef = useRef<Set<Element>>(new Set());
  const trackedListingsRef = useRef<Set<string>>(new Set());

  const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
    const newlyVisibleListings: string[] = [];

    entries.forEach((entry) => {
      const listingId = entry.target.getAttribute('data-listing-id');
      if (!listingId) return;

      if (entry.isIntersecting && !trackedListingsRef.current.has(listingId)) {
        newlyVisibleListings.push(listingId);
        trackedListingsRef.current.add(listingId);
      }
    });

    // Only track newly visible listings
    if (newlyVisibleListings.length > 0) {
      trackListingImpressionBatch(newlyVisibleListings);
    }
  }, []);

  useEffect(() => {
    // Create intersection observer
    observerRef.current = new IntersectionObserver(handleIntersection, {
      threshold,
      rootMargin,
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [handleIntersection, threshold, rootMargin]);

  const observeElement = useCallback((element: Element, listingId: string) => {
    if (!observerRef.current || !element) return;

    element.setAttribute('data-listing-id', listingId);
    observerRef.current.observe(element);
    elementsRef.current.add(element);
  }, []);

  const unobserveElement = useCallback((element: Element) => {
    if (!observerRef.current || !element) return;

    observerRef.current.unobserve(element);
    elementsRef.current.delete(element);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      elementsRef.current.clear();
      trackedListingsRef.current.clear();
    };
  }, []);

  return { observeElement, unobserveElement };
}