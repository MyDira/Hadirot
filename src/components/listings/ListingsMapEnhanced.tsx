import React, { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import { Listing } from "../../config/supabase";
import { MAPBOX_ACCESS_TOKEN } from "@/config/env";
import { computePrimaryListingImage } from "../../utils/stockImage";
import { formatPrice, capitalizeName } from "../../utils/formatters";
import {
  getContainerBounds,
  calculateTooltipPosition,
  type TooltipPosition,
} from "../../utils/viewportUtils";
import { MapPin } from "../../utils/filterUtils";

const BROOKLYN_CENTER: [number, number] = [-73.9442, 40.6782];
const DEFAULT_ZOOM = 12;

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface ListingsMapEnhancedProps {
  listings: Listing[];
  pins?: MapPin[];
  visiblePinIds?: Set<string>;
  hoveredListingId?: string | null;
  selectedListingId?: string | null;
  onMarkerHover?: (listingId: string | null) => void;
  onMarkerClick?: (listingId: string) => void;
  onBoundsChange?: (bounds: MapBounds, zoomLevel: number) => void;
  onMapClick?: () => void;
  userLocation?: { lat: number; lng: number } | null;
  searchBounds?: MapBounds | null;
  searchLocationName?: string;
  centerOnListings?: { lat: number; lng: number; zoom: number } | null;
  shouldPreservePosition?: boolean;
  isLoading?: boolean;
}

export function ListingsMapEnhanced({
  listings,
  pins,
  visiblePinIds,
  hoveredListingId,
  selectedListingId,
  onMarkerHover,
  onMarkerClick,
  onBoundsChange,
  onMapClick,
  userLocation,
  searchBounds,
  searchLocationName,
  centerOnListings,
  shouldPreservePosition = false,
  isLoading = false,
}: ListingsMapEnhancedProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, { marker: mapboxgl.Marker; element: HTMLDivElement }>>(new Map());
  const popupContainer = useRef<HTMLDivElement | null>(null);
  const activeListingId = useRef<string | null>(null);
  const userLocationMarker = useRef<mapboxgl.Marker | null>(null);
  const navigate = useNavigate();
  const [mapLoaded, setMapLoaded] = useState(false);
  const boundsChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const updatePopupPositionRef = useRef<() => void>(() => {});
  const removePopupRef = useRef<() => void>(() => {});

  const listingsWithCoords = listings.filter(
    (l) => l.latitude != null && l.longitude != null
  );

  const pinsWithCoords = pins?.filter(
    (p) => p.latitude != null && p.longitude != null
  ) ?? [];

  const usePinsForMarkers = pins && pins.length > 0;

  const formatRentalPrice = (price: number): string => {
    return formatPrice(price);
  };

  const formatSalePrice = (price: number): string => {
    if (price >= 1000000) {
      return `$${(price / 1000000).toFixed(1)}M`;
    }
    if (price >= 1000) {
      return `$${(price / 1000).toFixed(price >= 10000 ? 0 : 1)}K`;
    }
    return `$${price}`;
  };

  const createPriceMarkerElement = useCallback((listing: Listing, isHovered: boolean, isSelected: boolean): HTMLDivElement => {
    const el = document.createElement("div");
    el.className = "price-marker";

    const isSaleListing = listing.listing_type === "sale";
    const price = isSaleListing ? listing.asking_price : listing.price;
    const priceText = listing.call_for_price
      ? "Call"
      : price != null
        ? (isSaleListing ? formatSalePrice(price) : formatRentalPrice(price))
        : "N/A";

    const baseClasses = "relative cursor-pointer transition-all duration-150";
    const colorClasses = isHovered || isSelected
      ? "bg-brand-600 text-white"
      : "bg-white text-brand-800 border border-gray-300";
    const scaleClass = isHovered || isSelected ? "scale-110 z-30" : "hover:scale-105";
    const shadowClass = isHovered || isSelected ? "shadow-lg" : "shadow-sm hover:shadow-lg";

    el.innerHTML = `
      <div class="${baseClasses} ${colorClasses} ${scaleClass} ${shadowClass} px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap" style="font-family: var(--num-font);">
        ${priceText}
      </div>
      <div class="absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0 border-l-4 border-r-4 border-t-4 ${isHovered || isSelected ? 'border-t-brand-600' : 'border-t-white'} border-l-transparent border-r-transparent"></div>
    `;

    return el;
  }, []);

  const createPinMarkerElement = useCallback((pin: MapPin, isHovered: boolean, isSelected: boolean, isVisible: boolean): HTMLDivElement => {
    const el = document.createElement("div");
    el.className = `price-marker${isVisible ? '' : ' hidden'}`;

    const isSaleListing = pin.listing_type === "sale";
    const price = isSaleListing ? pin.asking_price : pin.price;
    const priceText = price != null
      ? (isSaleListing ? formatSalePrice(price) : formatRentalPrice(price))
      : "N/A";

    const baseClasses = "relative cursor-pointer transition-all duration-150";
    const colorClasses = isHovered || isSelected
      ? "bg-brand-600 text-white"
      : "bg-white text-brand-800 border border-gray-300";
    const scaleClass = isHovered || isSelected ? "scale-110 z-30" : "hover:scale-105";
    const shadowClass = isHovered || isSelected ? "shadow-lg" : "shadow-sm hover:shadow-lg";

    el.innerHTML = `
      <div class="${baseClasses} ${colorClasses} ${scaleClass} ${shadowClass} px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap" style="font-family: var(--num-font);">
        ${priceText}
      </div>
      <div class="absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0 border-l-4 border-r-4 border-t-4 ${isHovered || isSelected ? 'border-t-brand-600' : 'border-t-white'} border-l-transparent border-r-transparent"></div>
    `;

    return el;
  }, []);

  const createPopupContent = useCallback((listing: Listing): string => {
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

    const isMobile = window.innerWidth < 768;
    const popupWidth = isMobile ? "min(85vw, 300px)" : "280px";

    return `
      <div class="listing-popup" style="width: ${popupWidth}; font-family: system-ui, -apple-system, sans-serif;">
        <div style="position: relative; aspect-ratio: 3/2; overflow: hidden; border-radius: 8px 8px 0 0;">
          <img
            src="${imageUrl}"
            alt="${isStock ? 'Stock photo' : listing.title}"
            style="width: 100%; height: 100%; object-fit: cover;"
          />
          ${isStock ? `
            <div style="position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.35); color: white; padding: 4px 10px; border-radius: 999px; font-size: 11px; backdrop-filter: blur(4px);">
              Stock photo
            </div>
          ` : ''}
        </div>
        <div style="padding: 12px;">
          <div style="font-size: ${isMobile ? '18px' : '20px'}; font-weight: 700; color: #1E4A74; margin-bottom: 8px; font-family: var(--num-font);">
            ${priceDisplay}
          </div>
          <div style="display: flex; align-items: center; gap: ${isMobile ? '8px' : '12px'}; color: #6b7280; font-size: ${isMobile ? '12px' : '13px'}; margin-bottom: 8px; flex-wrap: wrap;">
            <span>${bedroomDisplay} bed</span>
            <span>${listing.bathrooms} bath</span>
            ${!isSaleListing && hasParking ? '<span>Parking</span>' : ''}
            ${!isSaleListing ? `
              <span style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 11px;">
                ${listing.broker_fee ? 'Broker Fee' : 'No Fee'}
              </span>
            ` : ''}
          </div>
          <div style="display: flex; align-items: center; color: #6b7280; font-size: ${isMobile ? '12px' : '13px'}; margin-bottom: 10px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; flex-shrink: 0;">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${isSaleListing ? (listing.full_address || listing.location || '') : (listing.cross_streets ?? listing.location) || ''}
            </span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 10px; border-top: 1px solid #f3f4f6;">
            <span style="font-size: 12px; color: #6b7280;">by ${getPosterLabel()}</span>
            <button
              onclick="window.__mapPopupClick__('${listing.id}')"
              style="display: inline-flex; align-items: center; gap: 4px; background: #1E4A74; color: white; padding: ${isMobile ? '8px 12px' : '6px 12px'}; border-radius: 6px; font-size: 12px; font-weight: 500; border: none; cursor: pointer; min-height: ${isMobile ? '44px' : 'auto'};"
            >
              View Listing
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }, []);

  const removeCustomPopup = useCallback(() => {
    if (popupContainer.current && mapContainer.current) {
      // Capture the specific popup element to avoid race condition
      const popupToRemove = popupContainer.current;

      // Immediately clear refs to prevent new popup from being affected
      popupContainer.current = null;
      activeListingId.current = null;

      // Start exit animation
      popupToRemove.classList.add('popup-exit');

      // Remove from DOM after animation completes
      setTimeout(() => {
        if (popupToRemove && popupToRemove.parentNode) {
          popupToRemove.parentNode.removeChild(popupToRemove);
        }
      }, 150);
    }
  }, []);

  const createCustomPopup = useCallback((
    listing: Listing,
    markerLngLat: [number, number]
  ) => {
    if (!map.current || !mapContainer.current) return;

    // Remove any existing popup
    removeCustomPopup();

    // Defensive cleanup: remove any orphaned popup elements from the DOM
    if (mapContainer.current) {
      const orphanedPopups = mapContainer.current.querySelectorAll('.custom-map-popup');
      orphanedPopups.forEach(popup => {
        if (popup.parentNode) {
          popup.parentNode.removeChild(popup);
        }
      });
    }

    const isMobile = window.innerWidth < 768;
    const popupWidth = isMobile ? Math.min(window.innerWidth * 0.85, 300) : 280;
    const popupHeight = isMobile ? 320 : 340;
    const markerHeight = 30;

    const markerPoint = map.current.project(markerLngLat);
    const viewport = getContainerBounds(mapContainer.current);

    const position = calculateTooltipPosition(
      markerPoint.x,
      markerPoint.y,
      viewport,
      popupWidth,
      popupHeight,
      markerHeight
    );

    const popup = document.createElement('div');
    popup.className = `custom-map-popup popup-${position.anchor}`;
    popup.style.cssText = `
      position: absolute;
      width: ${popupWidth}px;
      z-index: 1000;
      pointer-events: auto;
    `;

    let popupX = markerPoint.x - (popupWidth / 2) + position.offsetX;
    let popupY: number;

    if (position.anchor === 'bottom') {
      popupY = markerPoint.y - popupHeight - 18;
    } else {
      popupY = markerPoint.y + markerHeight + 8;
    }

    popup.style.left = `${popupX}px`;
    popup.style.top = `${popupY}px`;

    const arrowOffset = (popupWidth / 2) - position.offsetX;
    const arrowClass = position.anchor === 'bottom' ? 'popup-arrow-bottom' : 'popup-arrow-top';

    popup.innerHTML = `
      <div class="${arrowClass}" style="left: ${arrowOffset}px;"></div>
      <div class="popup-content-wrapper">
        <button class="popup-close-btn" aria-label="Close popup">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
        ${createPopupContent(listing)}
      </div>
    `;

    mapContainer.current.appendChild(popup);
    popupContainer.current = popup;
    activeListingId.current = listing.id;

    requestAnimationFrame(() => {
      popup.classList.add('popup-enter');
    });

    const closeBtn = popup.querySelector('.popup-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCustomPopup();
        if (onMapClick) onMapClick();
      });
    }

    popup.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }, [createPopupContent, onMapClick, removeCustomPopup]);

  const updatePopupPosition = useCallback(() => {
    if (!popupContainer.current || !map.current || !mapContainer.current || !activeListingId.current) return;

    const listing = listingsWithCoords.find(l => l.id === activeListingId.current);
    if (!listing || listing.latitude == null || listing.longitude == null) return;

    const markerLngLat: [number, number] = [listing.longitude, listing.latitude];
    const markerPoint = map.current.project(markerLngLat);
    const viewport = getContainerBounds(mapContainer.current);

    const isMobile = window.innerWidth < 768;
    const popupWidth = isMobile ? Math.min(window.innerWidth * 0.85, 300) : 280;
    const popupHeight = isMobile ? 320 : 340;
    const markerHeight = 30;

    const position = calculateTooltipPosition(
      markerPoint.x,
      markerPoint.y,
      viewport,
      popupWidth,
      popupHeight,
      markerHeight
    );

    let popupX = markerPoint.x - (popupWidth / 2) + position.offsetX;
    let popupY: number;

    if (position.anchor === 'bottom') {
      popupY = markerPoint.y - popupHeight - 18;
    } else {
      popupY = markerPoint.y + markerHeight + 8;
    }

    popupContainer.current.style.left = `${popupX}px`;
    popupContainer.current.style.top = `${popupY}px`;

    const currentAnchorClass = position.anchor === 'bottom' ? 'popup-bottom' : 'popup-top';
    popupContainer.current.classList.remove('popup-top', 'popup-bottom');
    popupContainer.current.classList.add(currentAnchorClass);

    const arrow = popupContainer.current.querySelector('.popup-arrow-top, .popup-arrow-bottom');
    if (arrow) {
      const arrowOffset = (popupWidth / 2) - position.offsetX;
      (arrow as HTMLElement).style.left = `${arrowOffset}px`;
      arrow.className = position.anchor === 'bottom' ? 'popup-arrow-bottom' : 'popup-arrow-top';
    }
  }, [listingsWithCoords]);

  useEffect(() => {
    updatePopupPositionRef.current = updatePopupPosition;
  }, [updatePopupPosition]);

  useEffect(() => {
    removePopupRef.current = removeCustomPopup;
  }, [removeCustomPopup]);

  useEffect(() => {
    (window as any).__mapPopupClick__ = (listingId: string) => {
      if (onMarkerClick) {
        onMarkerClick(listingId);
      }
      navigate(`/listing/${listingId}`);
    };

    return () => {
      delete (window as any).__mapPopupClick__;
    };
  }, [navigate, onMarkerClick]);

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_ACCESS_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: BROOKLYN_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    map.current.on("load", () => {
      setMapLoaded(true);
    });

    map.current.on("move", () => {
      updatePopupPositionRef.current();
    });

    map.current.on("zoom", () => {
      updatePopupPositionRef.current();
    });

    map.current.on("moveend", () => {
      if (!map.current || !onBoundsChange) return;

      if (boundsChangeTimeoutRef.current) {
        clearTimeout(boundsChangeTimeoutRef.current);
      }

      boundsChangeTimeoutRef.current = setTimeout(() => {
        const bounds = map.current!.getBounds();
        const zoom = map.current!.getZoom();

        onBoundsChange(
          {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
          },
          zoom
        );
      }, 300);
    });

    map.current.on("click", (e) => {
      const features = map.current!.queryRenderedFeatures(e.point);
      const clickedOnMarker = features.some(f => f.layer.id?.includes('marker'));

      if (!clickedOnMarker) {
        removePopupRef.current();
        if (onMapClick) {
          onMapClick();
        }
      }
    });

    return () => {
      if (boundsChangeTimeoutRef.current) {
        clearTimeout(boundsChangeTimeoutRef.current);
      }
      markers.current.forEach(({ marker }) => marker.remove());
      markers.current.clear();
      if (popupContainer.current && popupContainer.current.parentNode) {
        popupContainer.current.parentNode.removeChild(popupContainer.current);
        popupContainer.current = null;
      }
      if (userLocationMarker.current) {
        userLocationMarker.current.remove();
        userLocationMarker.current = null;
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [onBoundsChange, onMapClick]);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const existingIds = new Set(markers.current.keys());
    const newIds = new Set(listingsWithCoords.map(l => l.id));

    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const item = markers.current.get(id);
        if (item) {
          item.marker.remove();
          markers.current.delete(id);
        }
      }
    });

    listingsWithCoords.forEach((listing) => {
      if (listing.latitude == null || listing.longitude == null) return;

      const isHovered = hoveredListingId === listing.id;
      const isSelected = selectedListingId === listing.id;

      const existingItem = markers.current.get(listing.id);

      if (existingItem) {
        // Only update if state actually changed
        const currentlyHovered = existingItem.element.dataset.isHovered === 'true';
        const currentlySelected = existingItem.element.dataset.isSelected === 'true';

        if (currentlyHovered !== isHovered || currentlySelected !== isSelected) {
          // Update data attributes to track state
          existingItem.element.dataset.isHovered = String(isHovered);
          existingItem.element.dataset.isSelected = String(isSelected);

          // Update only the classes, not the entire innerHTML
          const innerDiv = existingItem.element.querySelector('div:first-child');
          const triangle = existingItem.element.querySelector('div:last-child');

          if (innerDiv) {
            const baseClasses = "relative cursor-pointer transition-all duration-150";
            const colorClasses = isHovered || isSelected
              ? "bg-brand-600 text-white"
              : "bg-white text-brand-800 border border-gray-300";
            const scaleClass = isHovered || isSelected ? "scale-110 z-30" : "hover:scale-105";
            const shadowClass = isHovered || isSelected ? "shadow-lg" : "shadow-sm hover:shadow-lg";

            innerDiv.className = `${baseClasses} ${colorClasses} ${scaleClass} ${shadowClass} px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap`;
          }

          if (triangle) {
            const triangleColor = isHovered || isSelected ? 'border-t-brand-600' : 'border-t-white';
            triangle.className = `absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0 border-l-4 border-r-4 border-t-4 ${triangleColor} border-l-transparent border-r-transparent`;
          }
        }
      } else {
        const el = createPriceMarkerElement(listing, isHovered, isSelected);

        // Initialize state tracking attributes
        el.dataset.isHovered = String(isHovered);
        el.dataset.isSelected = String(isSelected);

        // Add appear animation for new pins
        el.classList.add('animate-pin-appear');

        // Remove animation class after it completes to avoid re-triggering
        setTimeout(() => {
          el.classList.remove('animate-pin-appear');
        }, 300);

        el.addEventListener("mouseenter", () => {
          if (onMarkerHover) {
            onMarkerHover(listing.id);
          }
        });

        el.addEventListener("mouseleave", () => {
          if (onMarkerHover) {
            onMarkerHover(null);
          }
        });

        el.addEventListener("click", (e) => {
          e.stopPropagation();

          const lngLat: [number, number] = [listing.longitude!, listing.latitude!];
          createCustomPopup(listing, lngLat);

          if (onMarkerClick) {
            onMarkerClick(listing.id);
          }
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([listing.longitude, listing.latitude])
          .addTo(map.current!);

        markers.current.set(listing.id, { marker, element: el });
      }
    });
  }, [listingsWithCoords, mapLoaded, hoveredListingId, selectedListingId, createPriceMarkerElement, createPopupContent, onMarkerHover, onMarkerClick, createCustomPopup]);

  useEffect(() => {
    if (!mapLoaded || !map.current || !usePinsForMarkers) return;

    const existingIds = new Set(markers.current.keys());
    const newIds = new Set(pinsWithCoords.map(p => p.id));

    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const item = markers.current.get(id);
        if (item) {
          if (activeListingId.current === id) {
            removeCustomPopup();
          }
          item.marker.remove();
          markers.current.delete(id);
        }
      }
    });

    pinsWithCoords.forEach((pin) => {
      const isHovered = hoveredListingId === pin.id;
      const isSelected = selectedListingId === pin.id;
      const isVisible = visiblePinIds?.has(pin.id) ?? true;

      const existingItem = markers.current.get(pin.id);

      if (existingItem) {
        const currentlyHovered = existingItem.element.dataset.isHovered === 'true';
        const currentlySelected = existingItem.element.dataset.isSelected === 'true';

        if (currentlyHovered !== isHovered || currentlySelected !== isSelected) {
          existingItem.element.dataset.isHovered = String(isHovered);
          existingItem.element.dataset.isSelected = String(isSelected);

          const innerDiv = existingItem.element.querySelector('div:first-child');
          const triangle = existingItem.element.querySelector('div:last-child');

          if (innerDiv) {
            const baseClasses = "relative cursor-pointer transition-all duration-150";
            const colorClasses = isHovered || isSelected
              ? "bg-brand-600 text-white"
              : "bg-white text-brand-800 border border-gray-300";
            const scaleClass = isHovered || isSelected ? "scale-110 z-30" : "hover:scale-105";
            const shadowClass = isHovered || isSelected ? "shadow-lg" : "shadow-sm hover:shadow-lg";

            innerDiv.className = `${baseClasses} ${colorClasses} ${scaleClass} ${shadowClass} px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap`;
          }

          if (triangle) {
            const triangleColor = isHovered || isSelected ? 'border-t-brand-600' : 'border-t-white';
            triangle.className = `absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0 border-l-4 border-r-4 border-t-4 ${triangleColor} border-l-transparent border-r-transparent`;
          }
        }
      } else {
        const el = createPinMarkerElement(pin, isHovered, isSelected, isVisible);

        el.dataset.isHovered = String(isHovered);
        el.dataset.isSelected = String(isSelected);

        el.classList.add('animate-pin-appear');
        setTimeout(() => {
          el.classList.remove('animate-pin-appear');
        }, 300);

        el.addEventListener("mouseenter", () => {
          if (onMarkerHover) {
            onMarkerHover(pin.id);
          }
        });

        el.addEventListener("mouseleave", () => {
          if (onMarkerHover) {
            onMarkerHover(null);
          }
        });

        el.addEventListener("click", (e) => {
          e.stopPropagation();

          const listing = listingsWithCoords.find(l => l.id === pin.id);
          if (listing) {
            const lngLat: [number, number] = [pin.longitude, pin.latitude];
            createCustomPopup(listing, lngLat);
          }

          if (onMarkerClick) {
            onMarkerClick(pin.id);
          }
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(map.current!);

        markers.current.set(pin.id, { marker, element: el });
      }
    });
  }, [pinsWithCoords, mapLoaded, usePinsForMarkers, hoveredListingId, selectedListingId, visiblePinIds, createPinMarkerElement, onMarkerHover, onMarkerClick, createCustomPopup, removeCustomPopup, listingsWithCoords]);

  useEffect(() => {
    if (!usePinsForMarkers || !visiblePinIds) return;

    markers.current.forEach((item, id) => {
      const isVisible = visiblePinIds.has(id);
      const isCurrentlyHidden = item.element.classList.contains('hidden');

      if (isVisible && isCurrentlyHidden) {
        if (activeListingId.current === id) {
          removeCustomPopup();
        }
        item.element.classList.remove('hidden');
      } else if (!isVisible && !isCurrentlyHidden) {
        if (activeListingId.current === id) {
          removeCustomPopup();
        }
        item.element.classList.add('hidden');
      }
    });
  }, [visiblePinIds, usePinsForMarkers, removeCustomPopup]);

  useEffect(() => {
    if (!map.current || !mapLoaded || !userLocation) return;

    if (userLocationMarker.current) {
      userLocationMarker.current.setLngLat([userLocation.lng, userLocation.lat]);
    } else {
      const el = document.createElement("div");
      el.className = "user-location-marker";
      el.innerHTML = `
        <div class="relative">
          <div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg"></div>
          <div class="absolute inset-0 w-4 h-4 bg-blue-500 rounded-full animate-ping opacity-75"></div>
        </div>
      `;

      userLocationMarker.current = new mapboxgl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map.current);
    }

    map.current.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 14,
      duration: 1500,
    });
  }, [userLocation, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded || !hoveredListingId) return;

    const listing = listingsWithCoords.find(l => l.id === hoveredListingId);
    if (listing?.latitude && listing?.longitude) {
      const currentCenter = map.current.getCenter();
      const bounds = map.current.getBounds();

      const isInView = bounds.contains([listing.longitude, listing.latitude]);

      if (!isInView) {
        map.current.panTo([listing.longitude, listing.latitude], {
          duration: 500,
        });
      }
    }
  }, [hoveredListingId, listingsWithCoords, mapLoaded]);

  useEffect(() => {
    // Sync popup state with parent's selectedListingId
    if (!selectedListingId && popupContainer.current) {
      // Parent cleared selection, so remove popup
      removeCustomPopup();
    }
  }, [selectedListingId, removeCustomPopup]);

  useEffect(() => {
    if (!map.current || !mapLoaded || !searchBounds || shouldPreservePosition) return;

    const bounds = new mapboxgl.LngLatBounds(
      [searchBounds.west, searchBounds.south],
      [searchBounds.east, searchBounds.north]
    );

    map.current.fitBounds(bounds, {
      padding: 50,
      duration: 1200,
      maxZoom: 15,
    });
  }, [searchBounds, mapLoaded, shouldPreservePosition]);

  useEffect(() => {
    if (!map.current || !mapLoaded || !centerOnListings || shouldPreservePosition) return;

    // Validate coordinates before flying to them
    if (!isFinite(centerOnListings.lat) || !isFinite(centerOnListings.lng) || !isFinite(centerOnListings.zoom)) {
      console.error('Invalid centerOnListings coordinates:', centerOnListings);
      return;
    }

    map.current.flyTo({
      center: [centerOnListings.lng, centerOnListings.lat],
      zoom: centerOnListings.zoom,
      duration: 1200,
    });
  }, [centerOnListings, mapLoaded, shouldPreservePosition]);

  if (!MAPBOX_ACCESS_TOKEN) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p>Map functionality is not available.</p>
          <p className="text-sm">Please configure your Mapbox access token.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className={`h-full w-full ${isLoading ? 'border-2 loading-pulse' : ''}`} />

      <style>{`
        .mapboxgl-ctrl-group {
          border-radius: 8px !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
        }

        .mapboxgl-ctrl-group button {
          width: 36px !important;
          height: 36px !important;
        }

        .price-marker {
          transform: translateY(-50%);
          z-index: 1;
          transition: opacity 0.2s ease, transform 0.15s ease;
        }

        .price-marker.hidden {
          opacity: 0;
          pointer-events: none;
          transform: translateY(-50%) scale(0.85);
        }

        @keyframes pin-appear {
          from {
            opacity: 0;
            transform: translateY(-30%) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateY(-50%) scale(1);
          }
        }

        .animate-pin-appear {
          animation: pin-appear 0.3s ease-out forwards;
        }

        .custom-map-popup {
          position: absolute;
          z-index: 1000;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.2s ease, transform 0.2s ease;
          will-change: opacity, transform;
          filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
        }

        .custom-map-popup.popup-top {
          transform-origin: top center;
        }

        .custom-map-popup.popup-bottom {
          transform-origin: bottom center;
        }

        .custom-map-popup.popup-top.popup-enter {
          opacity: 1;
          transform: translateY(0);
        }

        .custom-map-popup.popup-bottom.popup-enter {
          opacity: 1;
          transform: translateY(0);
        }

        .custom-map-popup.popup-exit {
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.15s ease, transform 0.15s ease;
        }

        .popup-content-wrapper {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          position: relative;
        }

        .popup-arrow-top,
        .popup-arrow-bottom {
          position: absolute;
          width: 0;
          height: 0;
          border-left: 10px solid transparent;
          border-right: 10px solid transparent;
          transform: translateX(-50%);
          z-index: 1001;
        }

        .popup-arrow-top {
          top: -10px;
          border-bottom: 10px solid white;
        }

        .popup-arrow-bottom {
          bottom: -10px;
          border-top: 10px solid white;
        }

        .popup-close-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #6b7280;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
          transition: all 0.15s ease;
          z-index: 10;
        }

        .popup-close-btn:hover {
          background: #f3f4f6;
          color: #1f2937;
          transform: scale(1.05);
        }

        .popup-close-btn:active {
          transform: scale(0.95);
        }

        @media (max-width: 767px) {
          .popup-close-btn {
            width: 36px;
            height: 36px;
            top: 10px;
            right: 10px;
          }
        }

        .listing-popup img {
          display: block;
        }
      `}</style>
    </div>
  );
}
