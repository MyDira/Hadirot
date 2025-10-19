import React, { useState, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getStockImageForListing } from '../../utils/stockImage';
import { PropertyType, LeaseLength } from '../../config/supabase';

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
}

export default function ImageCarousel({
  images,
  className = '',
  listingSeed,
  propertyType,
  leaseLength
}: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // If no real images, show stock image
  const hasRealImages = images && images.length > 0;
  const displayImages = hasRealImages 
    ? images 
    : listingSeed 
      ? [{ 
          url: getStockImageForListing(listingSeed), 
          alt: "Stock photo placeholder" 
        }]
      : [];

  if (displayImages.length === 0) {
    return (
      <div className={`relative w-full bg-gray-100 flex items-center justify-center ${className}`}>
        <div className="text-gray-500 text-center p-8">
          <p>No images available</p>
        </div>
      </div>
    );
  }

  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % displayImages.length);
  };

  const prevImage = () => {
    setCurrentIndex((prev) => (prev - 1 + displayImages.length) % displayImages.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (displayImages.length <= 1) return;

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

  const isShowingStock = !hasRealImages;

  return (
    <div className={`relative w-full ${className}`}>
      {/* Main image */}
      <div
        className="relative w-full h-96 overflow-hidden rounded-lg"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={displayImages[currentIndex].url}
          alt={displayImages[currentIndex].alt}
          className="w-full h-full object-cover select-none"
        />

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
      {displayImages.length > 1 && (
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

      {/* Dots indicator - only show if more than 1 image */}
      {displayImages.length > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
          {displayImages.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-3 h-3 rounded-full transition-all ${
                index === currentIndex ? 'bg-white' : 'bg-white bg-opacity-50'
              }`}
              aria-label={`Go to image ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}