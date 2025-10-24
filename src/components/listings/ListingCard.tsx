import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bed, Bath, MapPin, Heart } from "lucide-react";
import { Listing } from "../../config/supabase";
import { listingsService } from "../../services/listings";
import { useAuth } from "@/hooks/useAuth";
import { capitalizeName } from "../../utils/formatters";
import { gaEvent, gaListing } from "@/lib/ga";
void gaEvent;
import NumericText from "@/components/common/NumericText";
import { computePrimaryListingImage } from "../../utils/stockImage";
import { ShareButton } from "../shared/ShareButton";

interface ListingCardProps {
  listing: Listing;
  isFavorited?: boolean;
  onFavoriteChange?: () => void;
  showFeaturedBadge?: boolean;
  onClick?: () => void;
  onNavigateToDetail?: () => void;
}

export function ListingCard({
  listing,
  isFavorited = false,
  onFavoriteChange,
  showFeaturedBadge = true,
  onClick,
  onNavigateToDetail,
}: ListingCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Get the primary image (real or stock)
  const sortedImages = listing.listing_images?.sort((a, b) => {
    if (a.is_featured && !b.is_featured) return -1;
    if (!a.is_featured && b.is_featured) return 1;
    return a.sort_order - b.sort_order;
  });
  
  const { url: primaryImageUrl, isStock } = computePrimaryListingImage(
    sortedImages,
    {
      id: listing.id,
      addressLine: listing.location,
      city: listing.neighborhood,
      price: listing.price,
    }
  );

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

      const nextIsFav = !isFavorited;
      if (nextIsFav) {
        gaListing("listing_favorite", listing.id);
      } else {
        gaListing("listing_unfavorite", listing.id);
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
      return capitalizeName(listing.owner?.agency || "");
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

  const handleCardClick = (e: React.MouseEvent) => {
    if (onNavigateToDetail) {
      onNavigateToDetail();
    }
    if (onClick) {
      onClick();
    }
  };

  return (
    <Link
      to={`/listing/${listing.id}`}
      className="group block bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow transition overflow-hidden"
      onClick={handleCardClick}
    >
      <div className="relative aspect-[3/2]">
        <img
          src={primaryImageUrl}
          alt={isStock ? "Stock photo placeholder" : listing.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          loading="lazy"
        />

        {/* Property type and lease length badges - bottom right */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-2">
          {listing.property_type === "full_house" && (
            <div className="rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
              Full House
            </div>
          )}
          {listing.lease_length === "short_term" && (
            <div className="rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
              Short Term
            </div>
          )}
        </div>

        {isStock && (
          <div className="absolute bottom-3 left-3 rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            Stock photo
          </div>
        )}

        {/* Action buttons - top right */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <ShareButton
            listingId={listing.id}
            listingTitle={listing.title}
            variant="card"
          />
          <button
            onClick={handleFavoriteToggle}
            className="p-1.5 bg-white rounded-full shadow-sm hover:shadow-md transition-shadow"
          >
            <Heart
              className={`w-3.5 h-3.5 ${
                isFavorited
                  ? "text-red-500 fill-current"
                  : "text-gray-400 hover:text-red-500"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="p-3">
        {/* Price */}
        <div className="mb-2">
          {listing.call_for_price ? (
            <strong className="text-2xl leading-tight font-bold text-brand-900">
              Call for Price
            </strong>
          ) : (
            listing.price != null && (
              <span className="text-2xl leading-tight font-bold text-brand-900">
                <span className="num-font">{formatPrice(listing.price)}</span>
              </span>
            )
          )}
        </div>

        {/* Property specs - bedrooms, bathrooms, parking, broker fee */}
        <div className="inline-flex items-center gap-3 text-gray-600 leading-none mb-2">
          <Bed className="w-4 h-4 align-middle" />
          {listing.bedrooms === 0 ? (
            <span className="text-sm">Studio</span>
          ) : (
            <span className="text-sm num-font">{listing.bedrooms}</span>
          )}
          <Bath className="w-4 h-4 align-middle" />
          <span className="text-sm num-font">{listing.bathrooms}</span>
          {hasParking && <span className="text-sm">Parking</span>}
          <span className="px-2 py-0.5 text-xs rounded bg-muted">
            {listing.broker_fee ? "Broker Fee" : "No Fee"}
          </span>
        </div>

        {/* Location - cross streets */}
        <div className="flex items-center text-gray-600 mt-2 mb-2">
          <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
          <NumericText
            className="text-sm leading-tight truncate flex-1 min-w-0"
            text={(listing.cross_streets ?? listing.location) || ""}
          />
        </div>

        {/* Poster label and featured badge */}
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-600 truncate">by {getPosterLabel()}</span>
          {listing.is_featured && showFeaturedBadge && (
            <span className="inline-flex items-center bg-accent-500 text-white text-xs px-2 py-0.5 rounded flex-shrink-0">
              Featured
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
