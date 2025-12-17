import React from "react";
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
  if (listings.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        No listings found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4">
      {listings.map((listing) => (
        <div key={listing.id} className="w-full">
          <ListingCard
            listing={listing}
            isFavorited={favoriteIds.has(listing.id)}
            onFavoriteChange={onFavoriteChange}
            onClick={() => onCardClick?.(listing)}
          />
        </div>
      ))}
    </div>
  );
}
