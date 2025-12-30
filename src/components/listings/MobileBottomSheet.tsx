import React, { useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";
import { Listing } from "../../config/supabase";
import { formatPrice, capitalizeName } from "../../utils/formatters";

export interface SheetState {
  snapPosition: "collapsed" | "mid" | "expanded" | "closed";
  translateY: number;
  isDragging: boolean;
  animationState: "entering" | "entered" | "exiting" | "exited";
  expandedHeight: number;
}

interface MobileBottomSheetProps {
  listing: Listing | null;
  isOpen: boolean;
  onClose: () => void;
  onViewListing: (listingId: string) => void;
  shouldCollapse?: boolean;
  onStateChange?: (state: SheetState) => void;
}

type SnapPosition = "collapsed" | "mid" | "expanded" | "closed";

interface VelocitySample {
  y: number;
  timestamp: number;
}

const ANIMATION_DURATION = 300;
const VELOCITY_SAMPLES = 5;
const FLICK_THRESHOLD = 0.5; // pixels per millisecond
const DRAG_THRESHOLD_TO_CLOSE = 150; // pixels to drag down from collapsed to close

// Spring animation constants
const SPRING_STIFFNESS = 300;
const SPRING_DAMPING = 30;
const SPRING_MASS = 1;

export function MobileBottomSheet({
  listing,
  isOpen,
  onClose,
  onViewListing,
  shouldCollapse = false,
  onStateChange,
}: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [snapPosition, setSnapPosition] = useState<SnapPosition>("collapsed");
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTapActive, setIsTapActive] = useState(false);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const touchMoved = useRef(false);
  const hadTouchInteraction = useRef(false);
  const velocityHistory = useRef<VelocitySample[]>([]);
  const [animationState, setAnimationState] = useState<'entering' | 'entered' | 'exiting' | 'exited'>('exited');
  const animationFrameRef = useRef<number | null>(null);
  const [backdropOpacity, setBackdropOpacity] = useState(0.08);

  // Calculate snap point heights based on viewport
  const getSnapHeights = useCallback(() => {
    const viewportHeight = window.innerHeight;
    const safeAreaBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0');

    return {
      collapsed: viewportHeight * 0.25,
      mid: viewportHeight * 0.50,
      expanded: viewportHeight * 0.90,
      closed: 0,
    };
  }, []);

  const snapHeights = getSnapHeights();

  // Calculate backdrop opacity based on position
  const calculateBackdropOpacity = useCallback((position: SnapPosition, dragOffset: number = 0) => {
    const heights = getSnapHeights();
    let currentHeight = heights[position];

    if (isDragging && position !== "closed") {
      currentHeight = Math.max(0, currentHeight - dragOffset);
    }

    const maxHeight = heights.expanded;
    const minHeight = heights.collapsed;

    // Linear interpolation between 0.08 (collapsed) and 0.35 (expanded)
    const ratio = (currentHeight - minHeight) / (maxHeight - minHeight);
    return 0.08 + (ratio * 0.27);
  }, [getSnapHeights, isDragging]);

  // Track velocity for flick detection
  const addVelocitySample = useCallback((y: number) => {
    const sample: VelocitySample = {
      y,
      timestamp: Date.now(),
    };

    velocityHistory.current.push(sample);
    if (velocityHistory.current.length > VELOCITY_SAMPLES) {
      velocityHistory.current.shift();
    }
  }, []);

  // Calculate average velocity from samples
  const getVelocity = useCallback((): number => {
    if (velocityHistory.current.length < 2) return 0;

    const first = velocityHistory.current[0];
    const last = velocityHistory.current[velocityHistory.current.length - 1];

    const deltaY = last.y - first.y;
    const deltaT = last.timestamp - first.timestamp;

    if (deltaT === 0) return 0;

    return deltaY / deltaT; // pixels per millisecond
  }, []);

  // Determine target snap position based on current position, drag distance, and velocity
  const getTargetSnapPosition = useCallback((currentPos: SnapPosition, dragDistance: number, velocity: number): SnapPosition => {
    const heights = getSnapHeights();

    // Fast flick detection
    if (Math.abs(velocity) > FLICK_THRESHOLD) {
      if (velocity < 0) {
        // Flick up
        if (currentPos === "collapsed") return "mid";
        if (currentPos === "mid") return "expanded";
        return currentPos;
      } else {
        // Flick down
        if (currentPos === "expanded") return "mid";
        if (currentPos === "mid") return "collapsed";
        if (currentPos === "collapsed") return dragDistance > DRAG_THRESHOLD_TO_CLOSE ? "closed" : "collapsed";
        return currentPos;
      }
    }

    // Slow drag - snap to nearest
    const currentHeight = heights[currentPos];
    const effectiveHeight = currentHeight - dragDistance;

    if (currentPos === "collapsed" && dragDistance > DRAG_THRESHOLD_TO_CLOSE) {
      return "closed";
    }

    // Find nearest snap point
    let nearest: SnapPosition = currentPos;
    let minDistance = Infinity;

    (["collapsed", "mid", "expanded"] as SnapPosition[]).forEach((pos) => {
      const distance = Math.abs(effectiveHeight - heights[pos]);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = pos;
      }
    });

    return nearest;
  }, [getSnapHeights]);

  // Elastic resistance when dragging beyond bounds
  const applyElasticResistance = useCallback((dragDistance: number, maxDrag: number): number => {
    if (dragDistance <= 0) return dragDistance;
    if (dragDistance <= maxDrag) return dragDistance;

    const excess = dragDistance - maxDrag;
    const resistance = Math.log(excess + 1) * 20;

    return maxDrag + resistance;
  }, []);

  // Handle touch start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const sheet = sheetRef.current;
    const content = contentRef.current;
    if (!sheet) return;

    hadTouchInteraction.current = true;

    // Don't start drag if touching interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('.sheet-handle-container')) {
      return;
    }

    // Check if content is scrollable and not at top
    if (content && content.scrollTop > 0 && snapPosition !== "collapsed") {
      return;
    }

    const touch = e.touches[0];
    touchStartY.current = touch.clientY;
    touchStartX.current = touch.clientX;
    touchMoved.current = false;
    setIsTapActive(true);
    setIsDragging(true);
    velocityHistory.current = [];
    addVelocitySample(touch.clientY);
  }, [snapPosition, addVelocitySample]);

  // Handle touch move
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;

    const sheet = sheetRef.current;
    const content = contentRef.current;
    if (!sheet) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartX.current);
    const deltaY = touch.clientY - touchStartY.current;

    // If moved more than 10px, mark as moved (not a tap)
    if (Math.abs(deltaY) > 10 || deltaX > 10) {
      touchMoved.current = true;
      setIsTapActive(false);
    }

    // If content is scrollable and we're scrolling within it, don't drag sheet
    if (content && content.scrollTop > 0 && snapPosition !== "collapsed") {
      // Only allow sheet drag if dragging down from scroll top
      if (deltaY < 0) return;
    }

    // Apply elastic resistance when dragging up beyond expanded
    let adjustedDeltaY = deltaY;
    if (adjustedDeltaY < 0 && snapPosition === "expanded") {
      adjustedDeltaY = applyElasticResistance(Math.abs(adjustedDeltaY), 50) * -1;
    }

    // Only allow downward drags (positive deltaY)
    if (adjustedDeltaY > 0) {
      setDragY(adjustedDeltaY);
      addVelocitySample(touch.clientY);

      // Update backdrop opacity during drag
      const opacity = calculateBackdropOpacity(snapPosition, adjustedDeltaY);
      setBackdropOpacity(opacity);
    }
  }, [isDragging, snapPosition, applyElasticResistance, addVelocitySample, calculateBackdropOpacity]);

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);
    setIsTapActive(false);

    // If no significant movement, treat as tap
    if (!touchMoved.current && listing) {
      onViewListing(listing.id);
      return;
    }

    const velocity = getVelocity();
    const targetPosition = getTargetSnapPosition(snapPosition, dragY, velocity);

    if (targetPosition === "closed") {
      onClose();
    } else {
      setSnapPosition(targetPosition);
      setBackdropOpacity(calculateBackdropOpacity(targetPosition));
    }

    setDragY(0);
    velocityHistory.current = [];
    touchMoved.current = false;
  }, [isDragging, snapPosition, dragY, listing, getVelocity, getTargetSnapPosition, onClose, onViewListing, calculateBackdropOpacity]);

  // Handle backdrop click - collapse to collapsed state
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (snapPosition !== "collapsed") {
        setSnapPosition("collapsed");
        setBackdropOpacity(0.08);
      }
    }
  }, [snapPosition]);

  // Handle open/close animation
  useEffect(() => {
    if (isOpen) {
      setAnimationState('entering');
      setSnapPosition('collapsed');
      setDragY(0);
      setBackdropOpacity(0.08);
      hadTouchInteraction.current = false;
      document.body.style.overflow = 'hidden';

      setTimeout(() => {
        setAnimationState('entered');
      }, ANIMATION_DURATION);
    } else if (animationState !== 'exited') {
      setAnimationState('exiting');
      setSnapPosition('closed');

      setTimeout(() => {
        setAnimationState('exited');
        hadTouchInteraction.current = false;
        document.body.style.overflow = '';
      }, ANIMATION_DURATION);
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Update when listing changes (pin switching)
  useEffect(() => {
    if (listing && isOpen) {
      // Keep current snap position when switching pins
      // Content will fade/update but position stays same
    }
  }, [listing, isOpen]);

  // Auto-collapse when map is being interacted with
  useEffect(() => {
    if (shouldCollapse && isOpen && snapPosition !== "collapsed" && animationState === 'entered') {
      setSnapPosition("collapsed");
      setBackdropOpacity(0.08);
    }
  }, [shouldCollapse, isOpen, snapPosition, animationState]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Report state changes to parent for floating image synchronization
  useEffect(() => {
    if (onStateChange) {
      const translateY = getTranslateY();
      onStateChange({
        snapPosition,
        translateY,
        isDragging,
        animationState,
        expandedHeight: snapHeights.expanded,
      });
    }
  }, [snapPosition, dragY, isDragging, animationState, onStateChange]);

  if (!listing || animationState === 'exited') return null;

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

  const shouldShowSheet = animationState === 'entering' || animationState === 'entered';

  // Calculate translateY based on snap position and drag
  const getTranslateY = () => {
    if (animationState === 'exiting' || snapPosition === 'closed') {
      return snapHeights.expanded;
    }

    const baseHeight = snapHeights[snapPosition];
    const baseTranslate = snapHeights.expanded - baseHeight;

    return baseTranslate + dragY;
  };

  const translateY = getTranslateY();

  return (
    <div
      className={`mobile-bottom-sheet-backdrop ${shouldShowSheet ? 'backdrop-visible' : 'backdrop-hidden'}`}
      style={{
        backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`,
      }}
      onClick={handleBackdropClick}
    >
      <div
        ref={sheetRef}
        className={`mobile-bottom-sheet mobile-sheet-${snapPosition} ${isDragging ? 'mobile-sheet-dragging' : 'mobile-sheet-animating'}`}
        style={{
          transform: `translateY(${translateY}px)`,
          height: `${snapHeights.expanded}px`,
          transition: isDragging ? 'none' : `transform ${ANIMATION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
          willChange: isDragging ? 'transform' : 'auto',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        role="dialog"
        aria-modal="true"
        aria-label="Property details"
      >
        {/* Drag Handle */}
        <div className="sheet-handle-container">
          <div
            className="sheet-handle"
            style={{
              opacity: isDragging ? 1 : 0.6,
            }}
          />
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="sheet-close-btn"
          aria-label="Close property details"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content - details only */}
        <div
          ref={contentRef}
          className={`sheet-content-vertical sheet-content-${snapPosition} ${isTapActive ? 'sheet-content-active' : ''}`}
          style={{ minHeight: 0 }}
          onClick={() => {
            // Only handle clicks from mouse/non-touch devices
            // Touch devices are handled by touch events
            if (listing && !hadTouchInteraction.current) {
              onViewListing(listing.id);
            }
            // Reset after handling
            setTimeout(() => {
              hadTouchInteraction.current = false;
            }, 100);
          }}
        >
          {/* Details Panel */}
          <div className="sheet-details">
            <div className="sheet-details-inner">
              <div className="sheet-price" style={{ fontFamily: 'var(--num-font)' }}>
                {priceDisplay}
              </div>

              <div className="sheet-specs">
                <span>{bedroomDisplay} bed • {listing.bathrooms} bath</span>
                {!isSaleListing && hasParking && snapPosition !== "collapsed" && (
                  <span> • Parking</span>
                )}
              </div>

              {!isSaleListing && snapPosition !== "collapsed" && (
                <div className="sheet-badge">
                  <span className={`sheet-fee-badge ${listing.broker_fee ? 'broker-fee' : 'no-fee'}`}>
                    {listing.broker_fee ? 'Broker Fee' : 'No Fee'}
                  </span>
                </div>
              )}

              <div className="sheet-location">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span className="sheet-location-text">
                  {isSaleListing ? (listing.full_address || listing.location || '') : (listing.cross_streets ?? listing.location) || ''}
                </span>
              </div>

              {snapPosition === "expanded" && listing.title && (
                <div className="sheet-description">
                  <p>{listing.title}</p>
                </div>
              )}

              {snapPosition !== "collapsed" && (
                <div className="sheet-poster">
                  by {getPosterLabel()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Snap Position Indicator */}
        <div className="sheet-snap-indicator">
          <div className={`snap-dot ${snapPosition === "collapsed" ? "active" : ""}`} />
          <div className={`snap-dot ${snapPosition === "mid" ? "active" : ""}`} />
          <div className={`snap-dot ${snapPosition === "expanded" ? "active" : ""}`} />
        </div>
      </div>
    </div>
  );
}
