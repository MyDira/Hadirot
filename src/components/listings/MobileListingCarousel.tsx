import React, { useRef, useEffect, useState } from "react";
import { ListingCard } from "./ListingCard";
import { Listing } from "../../config/supabase";

interface MobileListingCarouselProps {
  listings: Listing[];
  favoriteIds: Set<string>;
  onFavoriteChange: () => void;
  onCardClick?: (listing: Listing) => void;
}

export function MobileListingCarousel({
  listings,
  favoriteIds,
  onFavoriteChange,
  onCardClick,
}: MobileListingCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const cardWidth = container.offsetWidth - 48;
      const newIndex = Math.round(scrollLeft / (cardWidth + 16));
      setCurrentIndex(Math.min(Math.max(0, newIndex), listings.length - 1));
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [listings.length]);

  if (listings.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        No listings found
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-6 pb-4 -mx-6 scrollbar-hide"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {listings.map((listing, index) => (
          <div
            key={listing.id}
            className="flex-shrink-0 snap-center"
            style={{ width: "calc(100vw - 48px)" }}
          >
            <ListingCard
              listing={listing}
              isFavorited={favoriteIds.has(listing.id)}
              onFavoriteChange={onFavoriteChange}
              onClick={() => onCardClick?.(listing)}
            />
          </div>
        ))}
      </div>

      {listings.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-4">
          {listings.slice(0, Math.min(listings.length, 10)).map((_, index) => (
            <div
              key={index}
              className={`h-1.5 rounded-full transition-all ${
                index === currentIndex
                  ? "w-4 bg-green-600"
                  : "w-1.5 bg-gray-300"
              }`}
            />
          ))}
          {listings.length > 10 && (
            <span className="text-xs text-gray-400 ml-1">
              +{listings.length - 10}
            </span>
          )}
        </div>
      )}

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
