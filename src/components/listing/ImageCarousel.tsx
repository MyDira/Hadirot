import React, { useState, useRef, useEffect } from 'react';
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
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  // Auto-pause video when navigating away from it
  useEffect(() => {
    const currentMedia = displayMedia[currentIndex];
    if (videoRef.current && currentMedia?.type !== 'video') {
      videoRef.current.pause();
    }
  }, [currentIndex, displayMedia]);

  if (displayMedia.length === 0) {
    return (
      <div className={`relative w-full bg-gray-100 flex items-center justify-center ${className}`}>
        <div className="text-gray-500 text-center p-8">
          <p>No images available</p>
        </div>
      </div>
    );
  }

  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % displayMedia.length);
  };

  const prevImage = () => {
    setCurrentIndex((prev) => (prev - 1 + displayMedia.length) % displayMedia.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (displayMedia.length <= 1) return;

    const swipeDistance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(swipeDistance) > minSwipeDistance) {
      if (swipeDistance > 0) {
        nextImage();
      } else {
        prevImage();
      }
    }

    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  const currentMedia = displayMedia[currentIndex];
  const isShowingStock = !hasRealImages && !hasVideo;
  const canZoom = enableZoom && currentMedia?.type === 'image' && hasRealImages && onImageClick;

  const handleImageClick = () => {
    if (canZoom) {
      onImageClick(currentIndex);
    }
  };

  return (
    <div className={`relative w-full ${className}`}>
      {/* Main media container */}
      <div
        className={`relative w-full h-96 overflow-hidden rounded-lg bg-gray-100 ${canZoom ? 'cursor-zoom-in' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={currentMedia?.type === 'image' ? handleImageClick : undefined}
      >
        {currentMedia?.type === 'image' ? (
          <img
            src={currentMedia.url}
            alt={currentMedia.alt}
            className="w-full h-full object-contain select-none"
          />
        ) : currentMedia?.type === 'video' ? (
          <video
            ref={videoRef}
            src={currentMedia.url}
            controls
            className="w-full h-full object-contain bg-black"
            poster={currentMedia.thumbnail || undefined}
          >
            Your browser does not support the video tag.
          </video>
        ) : null}

        {/* Zoom indicator on hover - desktop only */}
        {canZoom && (
          <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center opacity-0 hover:opacity-100 pointer-events-none">
            <div className="bg-white bg-opacity-90 rounded-full p-3">
              <ZoomIn className="w-6 h-6 text-gray-800" />
            </div>
          </div>
        )}

        {/* Property type and lease length badges - bottom right */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2">
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
          <div className="absolute bottom-4 left-4 rounded-full bg-black/35 px-3 py-1 text-sm text-white backdrop-blur-sm">
            Stock photo
          </div>
        )}
      </div>

      {/* Navigation arrows - hidden on mobile, visible on desktop */}
      {displayMedia.length > 1 && (
        <>
          <button
            onClick={prevImage}
            className="hidden md:block absolute left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-all"
            aria-label="Previous image"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={nextImage}
            className="hidden md:block absolute right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-all"
            aria-label="Next image"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Dots indicator - only show if more than 1 media item */}
      {displayMedia.length > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
          {displayMedia.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-3 h-3 rounded-full transition-all ${
                index === currentIndex ? 'bg-white' : 'bg-white bg-opacity-50'
              }`}
              aria-label={`Go to media ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}