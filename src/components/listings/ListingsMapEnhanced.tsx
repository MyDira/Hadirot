import React, { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import { Listing } from "../../config/supabase";
import { MAPBOX_ACCESS_TOKEN } from "@/config/env";
import { computePrimaryListingImage } from "../../utils/stockImage";
import { formatPrice, capitalizeName } from "../../utils/formatters";
import {
  calculateAvailableSpace,
  getPopupDimensions,
  determineOptimalAnchor,
  getContainerBounds,
  checkEdgeProximity,
  calculatePanOffset,
} from "../../utils/viewportUtils";

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
}

export function ListingsMapEnhanced({
  listings,
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
}: ListingsMapEnhancedProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, { marker: mapboxgl.Marker; element: HTMLDivElement }>>(new Map());
  const popup = useRef<mapboxgl.Popup | null>(null);
  const userLocationMarker = useRef<mapboxgl.Marker | null>(null);
  const navigate = useNavigate();
  const [mapLoaded, setMapLoaded] = useState(false);
  const boundsChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const listingsWithCoords = listings.filter(
    (l) => l.latitude != null && l.longitude != null
  );

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

  const calculatePopupAnchor = useCallback((markerLngLat: [number, number]): string => {
    if (!map.current || !mapContainer.current) return "bottom";

    const markerPoint = map.current.project(markerLngLat);
    const isMobile = window.innerWidth < 768;
    const dimensions = getPopupDimensions(isMobile);
    const viewport = getContainerBounds(mapContainer.current);
    const available = calculateAvailableSpace(markerPoint.x, markerPoint.y, viewport);

    return determineOptimalAnchor(available, dimensions, isMobile);
  }, []);

  const shouldPanForEdgePin = useCallback((markerLngLat: [number, number]): { x: number; y: number } | null => {
    if (!map.current || !mapContainer.current) return null;

    const markerPoint = map.current.project(markerLngLat);
    const isMobile = window.innerWidth < 768;
    const dimensions = getPopupDimensions(isMobile);
    const viewport = getContainerBounds(mapContainer.current);
    const edgeThreshold = isMobile ? 100 : 120;

    return calculatePanOffset(markerPoint.x, markerPoint.y, viewport, dimensions, edgeThreshold);
  }, []);

  const getAnchorOffset = useCallback((anchor: string, isMobile: boolean): mapboxgl.Offset => {
    const baseOffset = isMobile ? 20 : 15;
    const largeOffset = isMobile ? 30 : 25;

    const offsets: Record<string, [number, number]> = {
      'top': [0, largeOffset],
      'bottom': [0, -largeOffset],
      'left': [largeOffset, 0],
      'right': [-largeOffset, 0],
      'top-left': [baseOffset, largeOffset],
      'top-right': [-baseOffset, largeOffset],
      'bottom-left': [baseOffset, -largeOffset],
      'bottom-right': [-baseOffset, -largeOffset],
    };

    return offsets[anchor] || [0, baseOffset];
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

    // Responsive width based on viewport
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

    // Close popup when map starts moving (drag/pan)
    map.current.on("movestart", () => {
      if (popup.current) {
        popup.current.remove();
        popup.current = null;
      }
    });

    // Close popup when map starts zooming
    map.current.on("zoomstart", () => {
      if (popup.current) {
        popup.current.remove();
        popup.current = null;
      }
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
        if (popup.current) {
          popup.current.remove();
          popup.current = null;
        }
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
      if (popup.current) {
        popup.current.remove();
        popup.current = null;
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
  }, []);

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

          if (popup.current) {
            popup.current.remove();
            popup.current = null;
          }

          const lngLat: [number, number] = [listing.longitude!, listing.latitude!];
          const isMobile = window.innerWidth < 768;
          const maxWidth = isMobile ? "90vw" : "320px";

          const panOffset = shouldPanForEdgePin(lngLat);

          const showPopup = () => {
            if (!map.current) return;

            const anchor = calculatePopupAnchor(lngLat);
            const offset = getAnchorOffset(anchor, isMobile);

            popup.current = new mapboxgl.Popup({
              closeButton: true,
              closeOnClick: false,
              maxWidth: maxWidth,
              offset: offset,
              anchor: anchor as mapboxgl.Anchor,
              className: "listing-map-popup",
            })
              .setLngLat(lngLat)
              .setHTML(createPopupContent(listing))
              .addTo(map.current);

            requestAnimationFrame(() => {
              if (!popup.current || !mapContainer.current) return;

              const popupEl = popup.current.getElement();
              if (!popupEl) return;

              const popupRect = popupEl.getBoundingClientRect();
              const containerRect = mapContainer.current.getBoundingClientRect();

              const isClippedLeft = popupRect.left < containerRect.left;
              const isClippedRight = popupRect.right > containerRect.right;
              const isClippedTop = popupRect.top < containerRect.top;
              const isClippedBottom = popupRect.bottom > containerRect.bottom;

              if (isClippedLeft || isClippedRight || isClippedTop || isClippedBottom) {
                let translateX = 0;
                let translateY = 0;

                if (isClippedLeft) {
                  translateX = containerRect.left - popupRect.left + 10;
                } else if (isClippedRight) {
                  translateX = containerRect.right - popupRect.right - 10;
                }

                if (isClippedTop) {
                  translateY = containerRect.top - popupRect.top + 10;
                } else if (isClippedBottom) {
                  translateY = containerRect.bottom - popupRect.bottom - 10;
                }

                if (translateX !== 0 || translateY !== 0) {
                  const currentTransform = popupEl.style.transform || '';
                  popupEl.style.transform = `${currentTransform} translate(${translateX}px, ${translateY}px)`;
                }
              }
            });

            popup.current.on('close', () => {
              if (onMapClick) {
                onMapClick();
              }
            });
          };

          if (panOffset && map.current) {
            const center = map.current.getCenter();
            const zoom = map.current.getZoom();
            const metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom);
            const lngOffset = (panOffset.x * metersPerPixel) / (111320 * Math.cos(center.lat * Math.PI / 180));
            const latOffset = (panOffset.y * metersPerPixel) / 110540;

            map.current.once('moveend', showPopup);
            map.current.panTo(
              [center.lng - lngOffset, center.lat - latOffset],
              { duration: 300 }
            );
          } else {
            showPopup();
          }

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
  }, [listingsWithCoords, mapLoaded, hoveredListingId, selectedListingId, createPriceMarkerElement, createPopupContent, onMarkerHover, onMarkerClick, calculatePopupAnchor, shouldPanForEdgePin, getAnchorOffset]);

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
      <div ref={mapContainer} className="h-full w-full" />

      <style>{`
        .mapboxgl-popup-content {
          padding: 0 !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
          overflow: hidden;
          max-height: 85vh;
        }

        .mapboxgl-popup-close-button {
          font-size: 18px;
          line-height: 1;
          padding: 0 !important;
          color: #6b7280;
          right: 4px;
          top: 4px;
          background: white;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          cursor: pointer;
          transition: all 0.15s ease;
          z-index: 30;
        }

        .mapboxgl-popup-close-button:hover {
          background: #f3f4f6;
          color: #1f2937;
          transform: scale(1.05);
        }

        .mapboxgl-popup-close-button:active {
          transform: scale(0.95);
        }

        @media (max-width: 767px) {
          .mapboxgl-popup-close-button {
            width: 36px;
            height: 36px;
            font-size: 20px;
            right: 6px;
            top: 6px;
          }
        }

        .mapboxgl-popup-tip {
          border-width: 8px;
        }

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
        }

        .listing-map-popup .mapboxgl-popup-content {
          max-width: min(90vw, 320px);
          position: relative;
        }

        @media (max-width: 767px) {
          .listing-map-popup .mapboxgl-popup-content {
            max-width: 85vw;
            max-height: 80vh;
          }
        }

        /* Z-index hierarchy: markers (z-1 to z-30) → map controls (z-10) → popup (z-1000) */
        .mapboxgl-popup {
          z-index: 1000 !important;
          position: relative;
          will-change: transform;
          max-width: none !important;
        }

        .mapboxgl-popup-anchor-top .mapboxgl-popup-tip,
        .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip,
        .mapboxgl-popup-anchor-left .mapboxgl-popup-tip,
        .mapboxgl-popup-anchor-right .mapboxgl-popup-tip {
          border-width: 10px;
        }

        .mapboxgl-popup-anchor-top-left .mapboxgl-popup-tip,
        .mapboxgl-popup-anchor-top-right .mapboxgl-popup-tip,
        .mapboxgl-popup-anchor-bottom-left .mapboxgl-popup-tip,
        .mapboxgl-popup-anchor-bottom-right .mapboxgl-popup-tip {
          border-width: 8px;
        }

        .listing-popup img {
          display: block;
        }
      `}</style>
    </div>
  );
}
