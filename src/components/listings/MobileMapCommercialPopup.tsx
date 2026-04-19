import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Heart, MapPin } from "lucide-react";
import { CommercialListing } from "../../config/supabase";
import { commercialListingsService } from "../../services/commercialListings";
import { useAuth } from "@/hooks/useAuth";
import { computePrimaryListingImage, buildListingAlt } from "../../utils/stockImage";

interface MobileMapCommercialPopupProps {
  listing: CommercialListing | null;
  isOpen: boolean;
  onClose: () => void;
  onViewListing: (listingId: string) => void;
  isFavorited: boolean;
  onFavoriteChange: () => void;
}

const SPACE_TYPE_LABELS: Record<string, string> = {
  storefront: "Retail",
  restaurant: "Restaurant",
  office: "Office",
  warehouse: "Warehouse",
  industrial: "Industrial",
  mixed_use: "Mixed Use",
  community_facility: "Community",
  basement_commercial: "Basement Commercial",
};

function formatCommercialPrice(listing: CommercialListing): string {
  if (listing.call_for_price) return "Call for Price";
  const isRental = listing.listing_type === "rental";
  const rawPrice = isRental ? listing.price : listing.asking_price;
  if (rawPrice == null) return "";
  if (isRental) {
    if (rawPrice >= 1000) {
      const k = rawPrice / 1000;
      const formatted = k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
      return `$${formatted}/mo`;
    }
    return `$${rawPrice}/mo`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rawPrice);
}

export function MobileMapCommercialPopup({
  listing,
  isOpen,
  onClose,
  onViewListing,
  isFavorited,
  onFavoriteChange,
}: MobileMapCommercialPopupProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [animationState, setAnimationState] = useState<"entering" | "entered" | "exiting" | "exited">("exited");

  useEffect(() => {
    if (isOpen && listing) {
      setAnimationState("entering");
      document.body.style.overflow = "hidden";
      const timer = setTimeout(() => setAnimationState("entered"), 300);
      return () => clearTimeout(timer);
    } else if (!isOpen && animationState !== "exited") {
      setAnimationState("exiting");
      const timer = setTimeout(() => {
        setAnimationState("exited");
        document.body.style.overflow = "";
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, listing]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleFavoriteToggle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!listing) return;
    if (!user) {
      navigate("/auth", { state: { isSignUp: true } });
      return;
    }
    try {
      if (isFavorited) {
        await commercialListingsService.removeCommercialFromFavorites(user.id, listing.id);
      } else {
        await commercialListingsService.addCommercialToFavorites(user.id, listing.id);
      }
      onFavoriteChange();
    } catch (error) {
      console.error("Error toggling commercial favorite:", error);
    }
  }, [listing, user, isFavorited, onFavoriteChange, navigate]);

  const handleCardClick = useCallback(() => {
    if (listing) {
      onViewListing(listing.id);
    }
  }, [listing, onViewListing]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!listing || animationState === "exited") return null;

  const sortedImages = (listing as any).commercial_listing_images
    ?.filter((img: any) => img && img.image_url)
    .sort((a: any, b: any) => {
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

  const { url: imageUrl, isStock } = computePrimaryListingImage(
    sortedImages,
    {
      id: listing.id,
      addressLine: listing.full_address,
      city: listing.neighborhood,
      price: listing.price,
    },
    listing.video_thumbnail_url,
    'popup'
  );

  const priceDisplay = formatCommercialPrice(listing);
  const spaceTypeLabel = SPACE_TYPE_LABELS[listing.commercial_space_type] ?? listing.commercial_space_type;
  const locationText = listing.full_address || listing.neighborhood || "";
  const sfDisplay = listing.available_sf ? `${listing.available_sf.toLocaleString()} SF` : null;

  const shouldShow = animationState === "entering" || animationState === "entered";

  return (
    <div
      className={`mobile-map-popup-backdrop ${shouldShow ? "backdrop-visible" : "backdrop-hidden"}`}
      onClick={handleBackdropClick}
    >
      <div
        className={`mobile-map-popup ${shouldShow ? "popup-visible" : "popup-hidden"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="mobile-map-popup-close"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mobile-map-popup-content" onClick={handleCardClick}>
          <div className="mobile-map-popup-image">
            <img
              src={imageUrl}
              alt={isStock ? buildListingAlt({
                neighborhood: listing.neighborhood,
                commercial_space_type: listing.commercial_space_type,
              }) : (listing.title ?? "Commercial listing")}
            />
            {isStock && (
              <div className="mobile-map-popup-stock-badge">Stock photo</div>
            )}
            <div
              className="absolute top-2 left-2 text-white text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "#0891B2" }}
            >
              {spaceTypeLabel}
            </div>
          </div>

          <div className="mobile-map-popup-details">
            <div className="mobile-map-popup-price num-font" style={{ color: "#0891B2" }}>
              {priceDisplay}
            </div>

            <div className="mobile-map-popup-specs">
              {[sfDisplay, spaceTypeLabel].filter(Boolean).join(" \u2022 ")}
            </div>

            <div className="mobile-map-popup-location">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{locationText}</span>
            </div>

            <div className="mobile-map-popup-poster" style={{ color: "#0891B2", fontWeight: 500 }}>
              Commercial
            </div>
          </div>
        </div>

        <div className="mobile-map-popup-actions">
          <button
            onClick={handleFavoriteToggle}
            className="mobile-map-popup-btn mobile-map-popup-btn-primary"
            style={{ backgroundColor: "#0891B2", borderColor: "#0891B2" }}
          >
            <Heart
              className={`w-4 h-4 ${isFavorited ? "fill-current" : ""}`}
            />
            <span>Favorite</span>
          </button>
          <button
            onClick={handleCardClick}
            className="mobile-map-popup-btn mobile-map-popup-btn-outline"
          >
            <span>View Listing</span>
          </button>
        </div>
      </div>
    </div>
  );
}
