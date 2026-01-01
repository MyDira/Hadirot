import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Heart, Share2, MapPin, Check, Link as LinkIcon } from "lucide-react";
import { Listing } from "../../config/supabase";
import { listingsService } from "../../services/listings";
import { useAuth } from "@/hooks/useAuth";
import { computePrimaryListingImage } from "../../utils/stockImage";
import { capitalizeName } from "../../utils/formatters";
import { gaEvent, gaListing } from "@/lib/ga";

interface MobileMapListingPopupProps {
  listing: Listing | null;
  isOpen: boolean;
  onClose: () => void;
  onViewListing: (listingId: string) => void;
  isFavorited: boolean;
  onFavoriteChange: () => void;
}

export function MobileMapListingPopup({
  listing,
  isOpen,
  onClose,
  onViewListing,
  isFavorited,
  onFavoriteChange,
}: MobileMapListingPopupProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [animationState, setAnimationState] = useState<"entering" | "entered" | "exiting" | "exited">("exited");
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);

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
        await listingsService.removeFromFavorites(user.id, listing.id);
        gaListing("listing_unfavorite", listing.id);
      } else {
        await listingsService.addToFavorites(user.id, listing.id);
        gaListing("listing_favorite", listing.id);
      }
      onFavoriteChange();
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  }, [listing, user, isFavorited, onFavoriteChange, navigate]);

  const handleShareClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!listing) return;

    gaEvent("share_listing_click", {
      listing_id: listing.id,
      variant: "map_popup",
    });
    setShowShareModal(true);
  }, [listing]);

  const handleCopyLink = useCallback(async () => {
    if (!listing) return;
    const listingUrl = `${window.location.origin}/listing/${listing.id}`;

    try {
      await navigator.clipboard.writeText(listingUrl);
      setCopied(true);
      gaEvent("share_listing_success", {
        listing_id: listing.id,
        method: "copy_link",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  }, [listing]);

  const handleSocialShare = useCallback((platform: string) => {
    if (!listing) return;
    const listingUrl = `${window.location.origin}/listing/${listing.id}`;
    const encodedUrl = encodeURIComponent(listingUrl);
    const encodedTitle = encodeURIComponent(listing.title || "Check out this listing");

    let shareUrl = "";
    switch (platform) {
      case "facebook":
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        break;
      case "twitter":
        shareUrl = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`;
        break;
      case "whatsapp":
        shareUrl = `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`;
        break;
      case "email":
        shareUrl = `mailto:?subject=${encodedTitle}&body=Check%20out%20this%20listing:%20${encodedUrl}`;
        break;
    }

    if (shareUrl) {
      gaEvent("share_listing_success", {
        listing_id: listing.id,
        method: platform,
      });
      window.open(shareUrl, "_blank", "noopener,noreferrer,width=600,height=400");
    }
  }, [listing]);

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

  const closeShareModal = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowShareModal(false);
    setCopied(false);
  }, []);

  if (!listing || animationState === "exited") return null;

  const sortedImages = listing.listing_images
    ?.filter((img) => img && img.image_url)
    .sort((a, b) => {
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      return a.sort_order - b.sort_order;
    });

  const { url: imageUrl, isStock } = computePrimaryListingImage(
    sortedImages,
    {
      id: listing.id,
      addressLine: listing.location,
      city: listing.neighborhood,
      price: listing.price,
    },
    listing.video_thumbnail_url
  );

  const isSaleListing = listing.listing_type === "sale";
  const price = isSaleListing ? listing.asking_price : listing.price;

  const formatPrice = (p: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(p);
  };

  const priceDisplay = listing.call_for_price
    ? "Call for Price"
    : price != null
      ? formatPrice(price)
      : "";

  const getPosterLabel = () => {
    if (listing.admin_custom_agency_name) {
      return listing.admin_custom_agency_name;
    }
    if (listing.admin_listing_type_display === "owner") {
      return "Owner";
    }
    if (listing.owner?.role === "agent" && listing.owner?.agency) {
      return capitalizeName(listing.owner.agency);
    }
    return "Owner";
  };

  const bedroomDisplay =
    listing.bedrooms === 0
      ? "Studio"
      : listing.additional_rooms && listing.additional_rooms > 0
        ? `${listing.bedrooms}+${listing.additional_rooms}`
        : `${listing.bedrooms}`;

  const locationText = isSaleListing
    ? (listing.full_address || listing.location || "")
    : (listing.cross_streets ?? listing.location) || "";

  const shouldShow = animationState === "entering" || animationState === "entered";

  return (
    <>
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
                alt={isStock ? "Stock photo" : listing.title}
              />
              {isStock && (
                <div className="mobile-map-popup-stock-badge">Stock photo</div>
              )}
            </div>

            <div className="mobile-map-popup-details">
              <div className="mobile-map-popup-price num-font">
                {priceDisplay}
              </div>

              <div className="mobile-map-popup-specs">
                {bedroomDisplay} bed &bull; {listing.bathrooms} bath
              </div>

              <div className="mobile-map-popup-location">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{locationText}</span>
              </div>

              <div className="mobile-map-popup-poster">
                By {getPosterLabel()}
              </div>
            </div>
          </div>

          <div className="mobile-map-popup-actions">
            <button
              onClick={handleFavoriteToggle}
              className="mobile-map-popup-btn"
            >
              <Heart
                className={`w-4 h-4 ${isFavorited ? "fill-current" : ""}`}
              />
              <span>Favorite</span>
            </button>
            <button
              onClick={handleShareClick}
              className="mobile-map-popup-btn"
            >
              <Share2 className="w-4 h-4" />
              <span>Share</span>
            </button>
          </div>
        </div>
      </div>

      {showShareModal && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black bg-opacity-50"
          onClick={closeShareModal}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-brand-900">Share Listing</h3>
              <button
                onClick={closeShareModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors mb-4"
            >
              <div className="flex items-center">
                <LinkIcon className="w-5 h-5 text-brand-900 mr-3" />
                <span className="text-sm font-medium text-gray-700">
                  {copied ? "Link Copied!" : "Copy Link"}
                </span>
              </div>
              {copied && <Check className="w-5 h-5 text-green-600" />}
            </button>

            <div className="space-y-2">
              <button
                onClick={() => handleSocialShare("facebook")}
                className="w-full flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-5 h-5 mr-3 text-[#1877F2]">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700">Share on Facebook</span>
              </button>

              <button
                onClick={() => handleSocialShare("twitter")}
                className="w-full flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-5 h-5 mr-3 text-[#1DA1F2]">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700">Share on Twitter</span>
              </button>

              <button
                onClick={() => handleSocialShare("whatsapp")}
                className="w-full flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-5 h-5 mr-3 text-[#25D366]">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700">Share on WhatsApp</span>
              </button>

              <button
                onClick={() => handleSocialShare("email")}
                className="w-full flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-5 h-5 mr-3 text-brand-900">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700">Share via Email</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
