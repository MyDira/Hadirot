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
  const visibleListingsRef = useRef<Set<string>>(new Set());

  const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
    const currentlyVisible = new Set<string>();

    entries.forEach((entry) => {
      const listingId = entry.target.getAttribute('data-listing-id');
      if (!listingId) return;

      if (entry.isIntersecting) {
        currentlyVisible.add(listingId);
        visibleListingsRef.current.add(listingId);
      } else {
        visibleListingsRef.current.delete(listingId);
      }
    });

    // If we have visible listings, track them
    if (visibleListingsRef.current.size > 0) {
      const visibleIds = Array.from(visibleListingsRef.current);
      trackListingImpressionBatch(visibleIds);
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
    
    // Remove from visible set if it was being tracked
    const listingId = element.getAttribute('data-listing-id');
    if (listingId) {
      visibleListingsRef.current.delete(listingId);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      elementsRef.current.clear();
      visibleListingsRef.current.clear();
    };
  }, []);

  return { observeElement, unobserveElement };
}