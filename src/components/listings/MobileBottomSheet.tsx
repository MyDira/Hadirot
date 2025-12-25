import React, { useEffect, useRef, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { Listing } from "../../config/supabase";
import { computePrimaryListingImage } from "../../utils/stockImage";
import { formatPrice, capitalizeName } from "../../utils/formatters";

interface MobileBottomSheetProps {
  listing: Listing | null;
  isOpen: boolean;
  onClose: () => void;
  onViewListing: (listingId: string) => void;
}

const DRAG_THRESHOLD = 100;
const ANIMATION_DURATION = 300;

export function MobileBottomSheet({
  listing,
  isOpen,
  onClose,
  onViewListing,
}: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef(0);
  const currentTranslateY = useRef(0);
  const [animationState, setAnimationState] = useState<'entering' | 'entered' | 'exiting' | 'exited'>('exited');

  useEffect(() => {
    if (isOpen) {
      setAnimationState('entering');
      setDragY(0);
      currentTranslateY.current = 0;
      document.body.style.overflow = 'hidden';

      setTimeout(() => {
        setAnimationState('entered');
      }, ANIMATION_DURATION);
    } else if (animationState !== 'exited') {
      setAnimationState('exiting');

      setTimeout(() => {
        setAnimationState('exited');
        document.body.style.overflow = '';
      }, ANIMATION_DURATION);
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const touch = e.touches[0];
    touchStartY.current = touch.clientY;
    setIsDragging(true);

    const scrollableContent = sheet.querySelector('.sheet-content');
    if (scrollableContent && scrollableContent.scrollTop > 0) {
      return;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const sheet = sheetRef.current;
    if (!sheet) return;

    const scrollableContent = sheet.querySelector('.sheet-content');
    if (scrollableContent && scrollableContent.scrollTop > 0) {
      return;
    }

    const touch = e.touches[0];
    const deltaY = touch.clientY - touchStartY.current;

    if (deltaY > 0) {
      setDragY(deltaY);
      currentTranslateY.current = deltaY;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);

    if (dragY > DRAG_THRESHOLD) {
      onClose();
    }

    setDragY(0);
    currentTranslateY.current = 0;
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleViewListing = () => {
    if (listing) {
      onViewListing(listing.id);
    }
  };

  if (!listing || animationState === 'exited') return null;

  const sortedImages = listing.listing_images?.sort((a, b) => {
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
  const priceDisplay = listing.call_for_price
    ? "Call for Price"
    : price != null
      ? formatPrice(price)
      : "";

  const hasParking = listing.parking === "yes" || listing.parking === "included";

  const getPosterLabel = () => {
    if (listing.owner?.role === "agent" && listing.owner?.agency) {
      return capitalizeName(listing.owner?.agency || "");
    }
    return "Owner";
  };

  const bedroomDisplay =
    listing.bedrooms === 0
      ? "Studio"
      : listing.additional_rooms && listing.additional_rooms > 0
        ? `${listing.bedrooms}+${listing.additional_rooms}`
        : `${listing.bedrooms}`;

  const isAnimating = animationState === 'entering' || animationState === 'exiting';
  const shouldShowSheet = animationState === 'entering' || animationState === 'entered';
  const translateY = isDragging ? dragY : 0;

  return (
    <div
      className={`mobile-bottom-sheet-backdrop ${shouldShowSheet ? 'backdrop-visible' : 'backdrop-hidden'}`}
      onClick={handleBackdropClick}
    >
      <div
        ref={sheetRef}
        className={`mobile-bottom-sheet ${animationState}`}
        style={{
          transform: `translateY(${translateY}px)`,
          transition: isDragging ? 'none' : `transform ${ANIMATION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="sheet-handle-container">
          <div className="sheet-handle" />
        </div>

        <button
          onClick={onClose}
          className="sheet-close-btn"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="sheet-content">
          <div className="sheet-image-container">
            <img
              src={imageUrl}
              alt={isStock ? 'Stock photo' : listing.title}
              className="sheet-image"
            />
            {isStock && (
              <div className="sheet-stock-badge">
                Stock photo
              </div>
            )}
          </div>

          <div className="sheet-details">
            <div className="sheet-price" style={{ fontFamily: 'var(--num-font)' }}>
              {priceDisplay}
            </div>

            <div className="sheet-specs">
              <span className="sheet-spec-item">{bedroomDisplay} bed</span>
              <span className="sheet-spec-separator">•</span>
              <span className="sheet-spec-item">{listing.bathrooms} bath</span>
              {!isSaleListing && hasParking && (
                <>
                  <span className="sheet-spec-separator">•</span>
                  <span className="sheet-spec-item">Parking</span>
                </>
              )}
              {!isSaleListing && (
                <span className={`sheet-fee-badge ${listing.broker_fee ? 'broker-fee' : 'no-fee'}`}>
                  {listing.broker_fee ? 'Broker Fee' : 'No Fee'}
                </span>
              )}
            </div>

            <div className="sheet-location">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="sheet-location-icon">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span className="sheet-location-text">
                {isSaleListing ? (listing.full_address || listing.location || '') : (listing.cross_streets ?? listing.location) || ''}
              </span>
            </div>

            <div className="sheet-footer">
              <span className="sheet-poster">by {getPosterLabel()}</span>
              <button
                onClick={handleViewListing}
                className="sheet-view-btn"
              >
                View Listing
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
