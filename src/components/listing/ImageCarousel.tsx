import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { getStockImageForListing } from '../../utils/stockImage';
import { PropertyType, LeaseLength } from '../../config/supabase';

type MediaItem =
  | { type: 'image'; url: string; alt: string }
  | { type: 'video'; url: string; thumbnail?: string | null };

interface ImageCarouselProps {
  images: Array<{ url: string; alt: string }>;
  className?: string;
  listingSeed?: {
    id?: string | null;
    addressLine?: string | null;
    city?: string | null;
    price?: number | null;
  };
  propertyType?: PropertyType;
  leaseLength?: LeaseLength | null;
  onImageClick?: (index: number) => void;
  enableZoom?: boolean;
  videoUrl?: string | null;
  videoThumbnail?: string | null;
}

type AnimationState = 'idle' | 'dragging' | 'animating';

export default function ImageCarousel({
  images,
  className = '',
  listingSeed,
  propertyType,
  leaseLength,
  onImageClick,
  enableZoom = false,
  videoUrl,
  videoThumbnail
}: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animationState, setAnimationState] = useState<AnimationState>('idle');
  const [dragOffset, setDragOffset] = useState(0);
  const [imageLoadStates, setImageLoadStates] = useState<Record<string, boolean>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartTime = useRef(0);
  const lastTouchX = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number>();

  // Build media array: images first, then video (if exists)
  const hasRealImages = images && images.length > 0;
  const hasVideo = !!videoUrl;

  const mediaItems: MediaItem[] = [];

  // Add images first
  if (hasRealImages) {
    mediaItems.push(...images.map(img => ({ type: 'image' as const, url: img.url, alt: img.alt })));
  }

  // Add video last (after all images)
  if (hasVideo) {
    mediaItems.push({ type: 'video' as const, url: videoUrl, thumbnail: videoThumbnail });
  }

  // If no media at all, show stock image
  const displayMedia: MediaItem[] = mediaItems.length > 0
    ? mediaItems
    : listingSeed
      ? [{ type: 'image' as const, url: getStockImageForListing(listingSeed), alt: "Stock photo placeholder" }]
      : [];

  // Helper function to get circular index
  const getCircularIndex = useCallback((index: number) => {
    const len = displayMedia.length;
    return ((index % len) + len) % len;
  }, [displayMedia.length]);

  // Preload images
  useEffect(() => {
    if (displayMedia.length === 0) return;

    const preloadImage = (url: string) => {
      if (imageLoadStates[url]) return;

      const img = new Image();
      img.onload = () => {
        setImageLoadStates(prev => ({ ...prev, [url]: true }));
      };
      img.onerror = () => {
        setImageLoadStates(prev => ({ ...prev, [url]: false }));
      };
      img.src = url;
    };

    // Preload current, next, and previous images
    const currentMedia = displayMedia[currentIndex];
    const nextMedia = displayMedia[getCircularIndex(currentIndex + 1)];
    const prevMedia = displayMedia[getCircularIndex(currentIndex - 1)];

    if (currentMedia?.type === 'image') preloadImage(currentMedia.url);
    if (nextMedia?.type === 'image') preloadImage(nextMedia.url);
    if (prevMedia?.type === 'image') preloadImage(prevMedia.url);

    // Preload all remaining images in background
    const timer = setTimeout(() => {
      displayMedia.forEach(media => {
        if (media.type === 'image') preloadImage(media.url);
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [currentIndex, displayMedia, imageLoadStates, getCircularIndex]);

  // Auto-pause video when navigating away from it
  useEffect(() => {
    const safeIndex = Math.max(0, Math.min(currentIndex, displayMedia.length - 1));
    const currentMedia = displayMedia[safeIndex];
    if (videoRef.current && currentMedia?.type !== 'video') {
      videoRef.current.pause();
    }
  }, [currentIndex, displayMedia]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (animationState !== 'idle' || displayMedia.length <= 1) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Home') {
        e.preventDefault();
        handleNavigateTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        handleNavigateTo(displayMedia.length - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [animationState, displayMedia.length, currentIndex]);

  const handleNext = useCallback(() => {
    if (animationState !== 'idle' || displayMedia.length <= 1) return;

    setAnimationState('animating');
    setCurrentIndex(prev => getCircularIndex(prev + 1));

    setTimeout(() => {
      setAnimationState('idle');
    }, 350);
  }, [animationState, displayMedia.length, getCircularIndex]);

  const handlePrevious = useCallback(() => {
    if (animationState !== 'idle' || displayMedia.length <= 1) return;

    setAnimationState('animating');
    setCurrentIndex(prev => getCircularIndex(prev - 1));

    setTimeout(() => {
      setAnimationState('idle');
    }, 350);
  }, [animationState, displayMedia.length, getCircularIndex]);

  const handleNavigateTo = useCallback((index: number) => {
    if (animationState !== 'idle' || index === currentIndex) return;

    setAnimationState('animating');
    setCurrentIndex(index);

    setTimeout(() => {
      setAnimationState('idle');
    }, 350);
  }, [animationState, currentIndex]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (displayMedia.length <= 1 || animationState === 'animating') return;

    touchStartX.current = e.touches[0].clientX;
    lastTouchX.current = e.touches[0].clientX;
    touchStartTime.current = Date.now();
    setAnimationState('dragging');
  }, [displayMedia.length, animationState]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (animationState !== 'dragging' || !containerRef.current) return;

    const currentX = e.touches[0].clientX;
    const diff = currentX - touchStartX.current;
    lastTouchX.current = currentX;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      setDragOffset(diff);
    });
  }, [animationState]);

  const handleTouchEnd = useCallback(() => {
    if (animationState !== 'dragging' || !containerRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;
    const swipeDistance = lastTouchX.current - touchStartX.current;
    const swipePercent = Math.abs(swipeDistance) / containerWidth;
    const swipeTime = Date.now() - touchStartTime.current;
    const velocity = Math.abs(swipeDistance) / swipeTime;

    // Commit to navigation if:
    // 1. Swiped more than 50% of width, OR
    // 2. Fast swipe (velocity > 0.5) with at least 30% distance
    const shouldNavigate = swipePercent > 0.5 || (velocity > 0.5 && swipePercent > 0.3);

    if (shouldNavigate) {
      if (swipeDistance > 0) {
        // Swiped right, go to previous
        setCurrentIndex(prev => getCircularIndex(prev - 1));
      } else {
        // Swiped left, go to next
        setCurrentIndex(prev => getCircularIndex(prev + 1));
      }
    }

    // Reset
    setDragOffset(0);
    setAnimationState('animating');

    setTimeout(() => {
      setAnimationState('idle');
    }, shouldNavigate ? 350 : 200);

    touchStartX.current = 0;
    lastTouchX.current = 0;
    touchStartTime.current = 0;
  }, [animationState, getCircularIndex]);

  if (displayMedia.length === 0) {
    return (
      <div className={`relative w-full bg-gray-100 flex items-center justify-center ${className}`}>
        <div className="text-gray-500 text-center p-8">
          <p>No images available</p>
        </div>
      </div>
    );
  }

  const isShowingStock = !hasRealImages && !hasVideo;

  // Get the three slides for infinite loop (previous, current, next)
  const prevIndex = getCircularIndex(currentIndex - 1);
  const nextIndex = getCircularIndex(currentIndex + 1);

  const slides = [
    { media: displayMedia[prevIndex], position: -1, index: prevIndex },
    { media: displayMedia[currentIndex], position: 0, index: currentIndex },
    { media: displayMedia[nextIndex], position: 1, index: nextIndex }
  ];

  const currentMedia = displayMedia[currentIndex];
  const canZoom = enableZoom && currentMedia?.type === 'image' && hasRealImages && onImageClick;

  const handleImageClick = () => {
    if (canZoom && animationState === 'idle') {
      onImageClick?.(currentIndex);
    }
  };

  // Calculate transform based on drag offset
  const getTransform = (position: number) => {
    if (animationState === 'dragging' && containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const dragPercent = dragOffset / containerWidth;
      return `translate3d(${(position * 100 + dragPercent * 100)}%, 0, 0)`;
    }
    return `translate3d(${position * 100}%, 0, 0)`;
  };

  const getTransitionClass = () => {
    if (animationState === 'dragging') {
      return '';
    }
    return 'transition-transform duration-300 ease-out';
  };

  const renderMediaSlide = (media: MediaItem, position: number, index: number) => {
    const isCurrentSlide = position === 0;

    return (
      <div
        key={`slide-${index}-${position}`}
        className={`absolute top-0 left-0 w-full h-full ${getTransitionClass()}`}
        style={{
          transform: getTransform(position),
          willChange: 'transform'
        }}
      >
        {media.type === 'image' && media.url ? (
          <img
            src={media.url}
            alt={media.alt || 'Listing image'}
            className="w-full h-full object-contain select-none"
            draggable={false}
            loading={isCurrentSlide ? 'eager' : 'lazy'}
          />
        ) : media.type === 'video' && media.url ? (
          <video
            ref={isCurrentSlide ? videoRef : null}
            src={media.url}
            controls
            className="w-full h-full object-contain bg-black"
            poster={media.thumbnail || undefined}
          >
            Your browser does not support the video tag.
          </video>
        ) : null}
      </div>
    );
  };

  return (
    <div className={`relative w-full ${className}`}>
      {/* Main media container */}
      <div
        ref={containerRef}
        className={`relative w-full h-96 overflow-hidden rounded-lg bg-gray-100 ${canZoom && animationState === 'idle' ? 'cursor-zoom-in' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={currentMedia?.type === 'image' ? handleImageClick : undefined}
        style={{ touchAction: 'pan-y pinch-zoom' }}
      >
        {/* Render three slides for infinite loop */}
        {slides.map(slide => renderMediaSlide(slide.media, slide.position, slide.index))}

        {/* Zoom indicator on hover - desktop only */}
        {canZoom && (
          <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center opacity-0 hover:opacity-100 pointer-events-none">
            <div className="bg-white bg-opacity-90 rounded-full p-3">
              <ZoomIn className="w-6 h-6 text-gray-800" />
            </div>
          </div>
        )}

        {/* Property type and lease length badges - bottom right */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2 pointer-events-none">
          {propertyType === "full_house" && (
            <div className="rounded-full bg-black/35 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm">
              Full House
            </div>
          )}
          {leaseLength === "short_term" && (
            <div className="rounded-full bg-black/35 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm">
              Short Term
            </div>
          )}
        </div>

        {isShowingStock && (
          <div className="absolute bottom-4 left-4 rounded-full bg-black/35 px-3 py-1 text-sm text-white backdrop-blur-sm pointer-events-none">
            Stock photo
          </div>
        )}
      </div>

      {/* Navigation arrows - hidden on mobile, visible on desktop */}
      {displayMedia.length > 1 && (
        <>
          <button
            onClick={handlePrevious}
            disabled={animationState !== 'idle'}
            className={`hidden md:block absolute left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full transition-all z-10 ${
              animationState === 'idle'
                ? 'hover:bg-opacity-75 hover:scale-105 cursor-pointer'
                : 'opacity-50 cursor-not-allowed'
            }`}
            aria-label="Previous image"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={handleNext}
            disabled={animationState !== 'idle'}
            className={`hidden md:block absolute right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full transition-all z-10 ${
              animationState === 'idle'
                ? 'hover:bg-opacity-75 hover:scale-105 cursor-pointer'
                : 'opacity-50 cursor-not-allowed'
            }`}
            aria-label="Next image"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Dots indicator - only show if more than 1 media item */}
      {displayMedia.length > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2 z-10">
          {displayMedia.map((_, index) => (
            <button
              key={index}
              onClick={() => handleNavigateTo(index)}
              disabled={animationState !== 'idle'}
              className={`w-3 h-3 rounded-full transition-all ${
                index === currentIndex ? 'bg-white scale-110' : 'bg-white bg-opacity-50 hover:bg-opacity-75'
              } ${animationState !== 'idle' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              aria-label={`Go to media ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
