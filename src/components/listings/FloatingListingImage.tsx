import React from "react";
import { Listing } from "../../config/supabase";
import { computePrimaryListingImage } from "../../utils/stockImage";

interface FloatingListingImageProps {
  listing: Listing | null;
  snapPosition: "collapsed" | "mid" | "expanded" | "closed";
  translateY: number;
  isOpen: boolean;
  isDragging: boolean;
  animationState: "entering" | "entered" | "exiting" | "exited";
  expandedHeight: number;
  onImageClick: () => void;
}

export function FloatingListingImage({
  listing,
  snapPosition,
  translateY,
  isOpen,
  isDragging,
  animationState,
  expandedHeight,
  onImageClick,
}: FloatingListingImageProps) {
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

  // Calculate bottom position based on sheet's translateY
  // The image should appear at the top of the visible sheet
  const viewportHeight = window.innerHeight;
  const bottomPosition = viewportHeight - (expandedHeight - translateY);

  const shouldShowImage = animationState === "entering" || animationState === "entered";

  return (
    <div
      className={`floating-listing-image ${shouldShowImage ? "image-visible" : "image-hidden"}`}
      style={{
        bottom: `${bottomPosition}px`,
        transition: isDragging ? "none" : "bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        willChange: isDragging ? "bottom" : "auto",
      }}
      onClick={onImageClick}
    >
      <img src={imageUrl} alt={isStock ? "Stock photo" : listing.title} />
      {isStock && (
        <div className="floating-stock-badge">Stock photo</div>
      )}
    </div>
  );
}
