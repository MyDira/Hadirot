import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ListingCard } from './ListingCard';
import { Listing } from '../../config/supabase';
import { listingsService } from '../../services/listings';
import { useAuth } from '../../hooks/useAuth';

interface SimilarListingsProps {
  listing: Listing;
}

const CARDS_PER_SLIDE = 4;
const LOAD_MORE_COUNT = 4;

// Helper function to detect if we're on mobile
const useIsMobile = () => {
  const [isMobile, setIsMobile] = React.useState(false);
  
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
};

// Helper function to chunk array into groups of specified size
const chunk = <T,>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export function SimilarListings({ listing }: SimilarListingsProps) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [similarListings, setSimilarListings] = useState<Listing[]>([]);
  const [userFavorites, setUserFavorites] = useState<string[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [currentMobileIndex, setCurrentMobileIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const carouselRef = React.useRef<HTMLDivElement>(null);

  // Calculate slides from similarListings - must be before any code that uses slides
  const slides = useMemo(() => chunk(similarListings, CARDS_PER_SLIDE), [similarListings]);
  
  // Mobile navigation logic
  const canGoNextMobile = currentMobileIndex < similarListings.length - 1 || hasMore;
  const canGoPrevMobile = currentMobileIndex > 0;
  
  // Desktop navigation logic
  const canGoNext = currentSlideIndex < slides.length - 1 || hasMore;
  const canGoPrev = currentSlideIndex > 0;

  // Load user favorites on mount and when user changes
  useEffect(() => {
    if (user) {
      loadUserFavorites();
    } else {
      setUserFavorites([]);
    }
  }, [user]);

  const loadUserFavorites = async () => {
    if (!user) return;
    
    try {
      const favorites = await listingsService.getUserFavoriteIds(user.id);
      setUserFavorites(favorites);
    } catch (error) {
      console.error('Error loading user favorites:', error);
    }
  };

  useEffect(() => {
    loadInitialSimilarListings();
  }, [listing.id]);

  const loadInitialSimilarListings = async () => {
    try {
      setLoading(true);
      // Load initial batch (8 listings for 2 slides)
      const data = await listingsService.getSimilarListings(listing, 8, 0);
      setSimilarListings(data);
      setHasMore(data.length === 8);
      setCurrentSlideIndex(0);
    } catch (error) {
      console.error('Error loading similar listings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMoreSimilarListings = async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const offset = similarListings.length;
      const newListings = await listingsService.getSimilarListings(listing, LOAD_MORE_COUNT, offset);
      setSimilarListings(prev => [...prev, ...newListings]);
      setHasMore(newListings.length === LOAD_MORE_COUNT);
      const updatedListings = [...similarListings, ...newListings];
      setCurrentSlideIndex(chunk(updatedListings, CARDS_PER_SLIDE).length - 1);
    } catch (error) {
      console.error('Error loading more similar listings:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleNext = async () => {
    if (isMobile) {
      // Mobile: move one listing at a time
      const nextIndex = currentMobileIndex + 1;
      
      // If we're at the last listing and there are more to load
      if (nextIndex >= similarListings.length && hasMore) {
        await fetchMoreSimilarListings();
        setCurrentMobileIndex(nextIndex);
      } else if (nextIndex < similarListings.length) {
        setCurrentMobileIndex(nextIndex);
      }
    } else {
      // Desktop: move one slide (4 listings) at a time
      const nextIndex = currentSlideIndex + 1;
      
      // If we're at the last slide and there are more listings to load
      if (nextIndex >= slides.length && hasMore) {
        await fetchMoreSimilarListings();
      } else if (nextIndex < slides.length) {
        setCurrentSlideIndex(nextIndex);
      }
    }
  };

  const handlePrev = () => {
    if (isMobile) {
      if (currentMobileIndex > 0) {
        setCurrentMobileIndex(currentMobileIndex - 1);
      }
    } else {
      if (currentSlideIndex > 0) {
        setCurrentSlideIndex(currentSlideIndex - 1);
      }
    }
  };

  // Add touch/swipe support for mobile
  React.useEffect(() => {
    if (!isMobile || !carouselRef.current) return;
    
    let startX = 0;
    let isDragging = false;
    
    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      isDragging = true;
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      e.preventDefault();
    };
    
    const handleTouchEnd = (e: TouchEvent) => {
      if (!isDragging) return;
      isDragging = false;
      
      const endX = e.changedTouches[0].clientX;
      const diff = startX - endX;
      
      // Minimum swipe distance
      if (Math.abs(diff) > 50) {
        if (diff > 0 && canGoNextMobile) {
          // Swiped left - go to next
          handleNext();
        } else if (diff < 0 && canGoPrevMobile) {
          // Swiped right - go to previous
          handlePrev();
        }
      }
    };
    
    const carousel = carouselRef.current;
    carousel.addEventListener('touchstart', handleTouchStart, { passive: true });
    carousel.addEventListener('touchmove', handleTouchMove, { passive: false });
    carousel.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      carousel.removeEventListener('touchstart', handleTouchStart);
      carousel.removeEventListener('touchmove', handleTouchMove);
      carousel.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, canGoNextMobile, canGoPrevMobile]);

  const handleFavoriteChange = () => {
    // Reload user favorites when any favorite is toggled
    loadUserFavorites();
  };

  if (loading) {
    return (
      <div className="mt-12 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48 mb-6"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-gray-200 rounded-lg h-64"></div>
          ))}
        </div>
      </div>
    );
  }

  if (similarListings.length === 0) {
    return null;
  }

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold text-[#273140] mb-6">Similar Listings</h2>
      
      <div className="relative">
        {/* Navigation Buttons */}
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

        {/* Carousel Container */}
        <div className="overflow-hidden" ref={carouselRef}>
          {isMobile ? (
            /* Mobile: Show one listing at a time */
            <div 
              className="flex transition-transform duration-300 ease-in-out"
              style={{ 
                transform: `translateX(-${currentMobileIndex * 100}%)`
              }}
            >
              {similarListings.map((similarListing, index) => (
                <div 
                  key={similarListing.id} 
                  className="flex-shrink-0 w-full px-2"
                >
                  <ListingCard
                    listing={similarListing}
                    isFavorited={userFavorites.includes(similarListing.id)}
                    onFavoriteChange={handleFavoriteChange}
                  />
                </div>
              ))}
              
              {/* Loading placeholder for mobile */}
              {loadingMore && (
                <div className="flex-shrink-0 w-full px-2">
                  <div className="bg-gray-100 rounded-lg h-64 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140]"></div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Desktop: Show slides of 4 listings */
            <div 
              className="flex gap-6 transition-transform duration-300 ease-in-out"
              style={{ 
                transform: `translateX(-${currentSlideIndex * (100 / Math.max(slides.length, 1))}%)`
              }}
            >
              {/* Render each slide */}
              {slides.map((slideListings, slideIndex) => (
                <div 
                  key={slideIndex}
                  className="flex-shrink-0 flex gap-6"
                  style={{ width: '100%' }}
                >
                  {/* Render up to 4 cards per slide */}
                  {slideListings.map((similarListing) => (
                    <div 
                      key={similarListing.id} 
                      className="flex-shrink-0 w-full sm:w-[calc((100%-theme(spacing.6)*1)/2)] md:w-[calc((100%-theme(spacing.6)*2)/3)] lg:w-[calc((100%-theme(spacing.6)*3)/4)]"
                    >
                      <ListingCard
                        listing={similarListing}
                        isFavorited={userFavorites.includes(similarListing.id)}
                        onFavoriteChange={handleFavoriteChange}
                      />
                    </div>
                  ))}
                  
                  {/* Fill empty slots if slide has less than 4 cards */}
                  {slideListings.length < CARDS_PER_SLIDE && 
                   Array.from({ length: CARDS_PER_SLIDE - slideListings.length }, (_, emptyIndex) => (
                     <div 
                       key={`empty-${slideIndex}-${emptyIndex}`} 
                       className="flex-shrink-0 w-full sm:w-[calc((100%-theme(spacing.6)*1)/2)] md:w-[calc((100%-theme(spacing.6)*2)/3)] lg:w-[calc((100%-theme(spacing.6)*3)/4)]"
                     >
                       {/* Loading placeholder for the last slide if we're loading more */}
                       {slideIndex === slides.length - 1 && loadingMore && emptyIndex === 0 && (
                         <div className="bg-gray-100 rounded-lg h-64 flex items-center justify-center">
                           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140]"></div>
                         </div>
                       )}
                     </div>
                   ))
                  }
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Slide Indicators */}
        <div className="flex justify-center mt-6 space-x-2">
          {isMobile ? (
            /* Mobile: Show dots for individual listings */
            <>
              {similarListings.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentMobileIndex(index)}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    index === currentMobileIndex
                      ? 'bg-[#273140]'
                      : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                  aria-label={`Go to listing ${index + 1}`}
                />
              ))}
              {/* Loading indicator dot */}
              {loadingMore && (
                <div className="w-3 h-3 rounded-full bg-gray-300 animate-pulse"></div>
              )}
            </>
          ) : (
            /* Desktop: Show dots for slides */
            <>
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlideIndex(index)}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    index === currentSlideIndex
                      ? 'bg-[#273140]'
                      : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
              {/* Loading indicator dot */}
              {loadingMore && (
                <div className="w-3 h-3 rounded-full bg-gray-300 animate-pulse"></div>
              )}
            </>
          )}
        </div>

        {/* Status Text */}
        <div className="text-center mt-4 text-sm text-gray-500">
          {isMobile ? (
            <>
              Showing {currentMobileIndex + 1} of {similarListings.length}
              {hasMore && ' (loading more...)'}
            </>
          ) : (
            <>
              Showing {Math.min(similarListings.length, (currentSlideIndex + 1) * CARDS_PER_SLIDE)} of {similarListings.length}
              {hasMore && ' (loading more...)'}
            </>
          )}
        </div>
      </div>
    </div>
  );
}