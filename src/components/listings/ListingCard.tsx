import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bed, Bath, MapPin, Heart } from "lucide-react";
import { Listing } from "../../config/supabase";
import { listingsService } from "../../services/listings";
import { useAuth } from "../../hooks/useAuth";

interface ListingCardProps {
  listing: Listing;
  isFavorited?: boolean;
  onFavoriteChange?: () => void;
  showFeaturedBadge?: boolean;
}

export function ListingCard({
  listing,
  isFavorited = false,
  onFavoriteChange,
  showFeaturedBadge = true,
}: ListingCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const featuredImage =
    listing.listing_images?.find((img) => img.is_featured) ||
    listing.listing_images?.[0];

  const handleFavoriteToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      navigate("/auth", { state: { isSignUp: true } });
      return;
    }

    try {
      if (isFavorited) {
        await listingsService.removeFromFavorites(user.id, listing.id);
        console.log("✅ Removed from favorites:", listing.id);
      } else {
        await listingsService.addToFavorites(user.id, listing.id);
        console.log("✅ Added to favorites:", listing.id);
      }

      // Trigger refresh of listings to update UI
      if (onFavoriteChange) {
        onFavoriteChange();
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      alert("Failed to update favorite. Please try again.");
    }
  };

  const getPosterLabel = () => {
    if (listing.owner?.role === "agent" && listing.owner?.agency) {
      return listing.owner.agency;
    }
    return "Owner";
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const hasParking =
    listing.parking === "yes" || listing.parking === "included";

  return (
    <Link
      to={`/listing/${listing.id}`}
      className="group block bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow transition overflow-hidden"
    >
      <div className="relative">
        {featuredImage ? (
          <img
            src={featuredImage.image_url}
            alt={listing.title}
            className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="w-full h-48 bg-brand-50 flex items-center justify-center border-b border-gray-100">
            <svg
              width="56"
              height="56"
              viewBox="0 0 24 24"
              className="text-brand-700"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M3 10.5L12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-9z" />
              <path d="M9 21V12h6v9" />
            </svg>
            <span className="ml-3 text-brand-700/90 text-sm">
              No image available
            </span>
          </div>
        )}

        {/* Favorite button - top right */}
        <button
          onClick={handleFavoriteToggle}
          className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-sm hover:shadow-md transition-shadow"
        >
          <Heart
            className={`w-4 h-4 ${
              isFavorited
                ? "text-red-500 fill-current"
                : "text-gray-400 hover:text-red-500"
            }`}
          />
        </button>
      </div>

      <div className="p-4">
        {/* Price */}
        <div className="mb-3">
          <span className="text-2xl font-bold text-brand-900">
            {formatPrice(listing.price)}
          </span>
        </div>

        {/* Property specs - bedrooms, bathrooms, parking */}
        <div className="flex items-center text-gray-600 mb-3">
          <div className="flex items-center mr-4">
            <span className="text-sm mr-1">
              {listing.bedrooms === 0 ? "Studio" : listing.bedrooms}
            </span>
            <Bed className="w-4 h-4" />
          </div>
          <div className="flex items-center mr-4">
            <span className="text-sm mr-1">{listing.bathrooms}</span>
            <Bath className="w-4 h-4" />
          </div>
          {hasParking && <span className="text-sm text-gray-600">Parking</span>}
        </div>

        {/* Location - cross streets */}
        <div className="flex items-center text-gray-600 mt-2 mb-3">
          <MapPin className="w-4 h-4 mr-1 flex-shrink-0" />
          <span className="text-sm truncate">{listing.location}</span>
        </div>

        {/* Poster label and featured */}
        <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-600">
            Listed by {getPosterLabel()}
          </span>
          {listing.is_featured && showFeaturedBadge && (
            <span className="inline-flex items-center rounded-md bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-1">
              Featured
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
