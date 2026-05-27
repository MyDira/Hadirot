import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CommercialListingCard } from './CommercialListingCard';
import { CommercialListing } from '../../config/supabase';
import { commercialListingsService } from '../../services/commercialListings';
import { useAuth } from '@/hooks/useAuth';

/**
 * Commercial twin of SimilarListings. Same layout, same dot indicators,
 * same mobile swipe behavior — only the data source, the card component,
 * and the favorites service differ.
 *
 * Impression tracking is intentionally skipped (the existing
 * useListingImpressions hook is keyed to residential listing ids).
 */

interface CommercialSimilarListingsProps {
  listing: CommercialListing;
}

const CARDS_PER_SLIDE = 4;
const LOAD_MORE_COUNT = 4;

const useIsMobile = () => {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  return isMobile;
};

const chunk = <T,>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export function CommercialSimilarListings({ listing }: CommercialSimilarListingsProps) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [similar, setSimilar] = useState<CommercialListing[]>([]);
  const [userFavorites, setUserFavorites] = useState<string[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [currentMobileIndex, setCurrentMobileIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const carouselRef = React.useRef<HTMLDivElement>(null);

  const slides = useMemo(() => chunk(similar, CARDS_PER_SLIDE), [similar]);

  const canGoNextMobile = currentMobileIndex < similar.length - 1 || hasMore;
  const canGoPrevMobile = currentMobileIndex > 0;
  const canGoNext = currentSlideIndex < slides.length - 1 || hasMore;
  const canGoPrev = currentSlideIndex > 0;

  useEffect(() => {
    if (!user) {
      setUserFavorites([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ids = await commercialListingsService.getUserCommercialFavoriteIds(user.id);
        if (!cancelled) setUserFavorites(ids);
      } catch (err) {
        console.error('Error loading commercial user favorites:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await commercialListingsService.getSimilarCommercialListings(listing, 8, 0);
        if (!cancelled) {
          setSimilar(data);
          setHasMore(data.length === 8);
          setCurrentSlideIndex(0);
          setCurrentMobileIndex(0);
        }
      } catch (err) {
        console.error('Error loading similar commercial listings:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listing.id]);

  const fetchMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const offset = similar.length;
      const next = await commercialListingsService.getSimilarCommercialListings(
        listing,
        LOAD_MORE_COUNT,
        offset,
      );
      setSimilar(prev => [...prev, ...next]);
      setHasMore(next.length === LOAD_MORE_COUNT);
      const updated = [...similar, ...next];
      setCurrentSlideIndex(chunk(updated, CARDS_PER_SLIDE).length - 1);
    } catch (err) {
      console.error('Error loading more commercial similar:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleNext = async () => {
    if (isMobile) {
      const nextIndex = currentMobileIndex + 1;
      if (nextIndex >= similar.length && hasMore) {
        await fetchMore();
        setCurrentMobileIndex(nextIndex);
      } else if (nextIndex < similar.length) {
        setCurrentMobileIndex(nextIndex);
      }
    } else {
      const nextIndex = currentSlideIndex + 1;
      if (nextIndex >= slides.length && hasMore) {
        await fetchMore();
      } else if (nextIndex < slides.length) {
        setCurrentSlideIndex(nextIndex);
      }
    }
  };

  const handlePrev = () => {
    if (isMobile) {
      if (currentMobileIndex > 0) setCurrentMobileIndex(currentMobileIndex - 1);
    } else {
      if (currentSlideIndex > 0) setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

  React.useEffect(() => {
    if (!isMobile || !carouselRef.current) return;
    let startX = 0;
    let isDragging = false;
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      isDragging = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!isDragging) return;
      isDragging = false;
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        if (diff > 0 && canGoNextMobile) handleNext();
        else if (diff < 0 && canGoPrevMobile) handlePrev();
      }
    };
    const el = carouselRef.current;
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      try {
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchmove', onTouchMove);
        el.removeEventListener('touchend', onTouchEnd);
      } catch {
        /* iOS WebKit may throw during unmount */
      }
    };
  }, [isMobile, canGoNextMobile, canGoPrevMobile]);

  const handleFavoriteChange = async () => {
    if (!user) return;
    try {
      const ids = await commercialListingsService.getUserCommercialFavoriteIds(user.id);
      setUserFavorites(ids);
    } catch (err) {
      console.error('Error reloading commercial favorites:', err);
    }
  };

  if (loading) {
    return (
      <div className="mt-12 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48 mb-6"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-gray-200 rounded-lg h-64"></div>
          ))}
        </div>
      </div>
    );
  }

  if (similar.length === 0) return null;

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold text-[#273140] mb-6">Similar Listings</h2>

      <div className="relative">
        {(isMobile ? canGoPrevMobile : canGoPrev) && (
          <button
            onClick={handlePrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 bg-white rounded-full p-3 shadow-lg hover:shadow-xl transition-shadow border border-gray-200"
            aria-label="Previous listings"
          >
            <ChevronLeft className="w-6 h-6 text-gray-600" />
          </button>
        )}

        {(isMobile ? canGoNextMobile : canGoNext) && (
          <button
            onClick={handleNext}
            disabled={loadingMore}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 bg-white rounded-full p-3 shadow-lg hover:shadow-xl transition-shadow border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Next listings"
          >
            {loadingMore ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#273140]"></div>
            ) : (
              <ChevronRight className="w-6 h-6 text-gray-600" />
            )}
          </button>
        )}

        <div className="overflow-hidden" ref={carouselRef}>
          {isMobile ? (
            <div
              className="flex transition-transform duration-300 ease-in-out"
              style={{ transform: `translateX(-${currentMobileIndex * 100}%)` }}
            >
              {similar.map(item => (
                <div key={item.id} className="flex-shrink-0 w-full px-2">
                  <CommercialListingCard
                    listing={item}
                    isFavorited={userFavorites.includes(item.id)}
                    onFavoriteChange={handleFavoriteChange}
                  />
                </div>
              ))}
              {loadingMore && (
                <div className="flex-shrink-0 w-full px-2">
                  <div className="bg-gray-100 rounded-lg h-64 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140]"></div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className="flex gap-6 transition-transform duration-300 ease-in-out"
              style={{ transform: `translateX(-${currentSlideIndex * 100}%)` }}
            >
              {slides.map((slideListings, slideIndex) => (
                <div key={slideIndex} className="flex-shrink-0 flex gap-6" style={{ width: '100%' }}>
                  {slideListings.map(item => (
                    <div
                      key={item.id}
                      className="flex-shrink-0 w-full sm:w-[calc((100%-theme(spacing.6)*1)/2)] md:w-[calc((100%-theme(spacing.6)*2)/3)] lg:w-[calc((100%-theme(spacing.6)*3)/4)]"
                    >
                      <CommercialListingCard
                        listing={item}
                        isFavorited={userFavorites.includes(item.id)}
                        onFavoriteChange={handleFavoriteChange}
                      />
                    </div>
                  ))}
                  {slideListings.length < CARDS_PER_SLIDE &&
                    Array.from({ length: CARDS_PER_SLIDE - slideListings.length }, (_, emptyIndex) => (
                      <div
                        key={`empty-${slideIndex}-${emptyIndex}`}
                        className="flex-shrink-0 w-full sm:w-[calc((100%-theme(spacing.6)*1)/2)] md:w-[calc((100%-theme(spacing.6)*2)/3)] lg:w-[calc((100%-theme(spacing.6)*3)/4)]"
                      >
                        {slideIndex === slides.length - 1 && loadingMore && emptyIndex === 0 && (
                          <div className="bg-gray-100 rounded-lg h-64 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140]"></div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-center mt-6 space-x-2">
          {isMobile ? (
            <>
              {similar.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentMobileIndex(index)}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    index === currentMobileIndex ? 'bg-accent-500' : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                  aria-label={`Go to listing ${index + 1}`}
                />
              ))}
              {loadingMore && <div className="w-3 h-3 rounded-full bg-gray-300 animate-pulse"></div>}
            </>
          ) : (
            <>
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlideIndex(index)}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    index === currentSlideIndex ? 'bg-accent-500' : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
              {loadingMore && <div className="w-3 h-3 rounded-full bg-gray-300 animate-pulse"></div>}
            </>
          )}
        </div>

        <div className="text-center mt-4 text-sm text-gray-500">
          {isMobile ? (
            <>
              Showing {currentMobileIndex + 1} of {similar.length}
              {hasMore && ' (more available)'}
            </>
          ) : (
            <>
              Showing {currentSlideIndex * CARDS_PER_SLIDE + 1}-
              {Math.min((currentSlideIndex + 1) * CARDS_PER_SLIDE, similar.length)} of {similar.length}
              {hasMore && ' (more available)'}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
