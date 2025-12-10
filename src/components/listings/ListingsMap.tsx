import React, { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import { Bed, Bath, MapPin, ExternalLink } from "lucide-react";
import { Listing } from "../../config/supabase";
import { MAPBOX_ACCESS_TOKEN } from "@/config/env";
import { computePrimaryListingImage } from "../../utils/stockImage";
import { formatPrice, capitalizeName } from "../../utils/formatters";

const BROOKLYN_CENTER: [number, number] = [-73.9442, 40.6782];
const DEFAULT_ZOOM = 12;

interface ListingsMapProps {
  listings: Listing[];
  onListingClick?: (listingId: string) => void;
}

export function ListingsMap({ listings, onListingClick }: ListingsMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const popup = useRef<mapboxgl.Popup | null>(null);
  const navigate = useNavigate();
  const [mapLoaded, setMapLoaded] = useState(false);

  const listingsWithCoords = listings.filter(
    (l) => l.latitude != null && l.longitude != null
  );

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
    const price = isSaleListing
      ? listing.asking_price
      : listing.price;
    const priceDisplay = listing.call_for_price
      ? "Call for Price"
      : price != null
        ? formatPrice(price)
        : "";

    const hasParking =
      listing.parking === "yes" || listing.parking === "included";

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

    return `
      <div class="listing-popup" style="width: 280px; font-family: system-ui, -apple-system, sans-serif;">
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
          <div style="font-size: 20px; font-weight: 700; color: #273140; margin-bottom: 8px;">
            ${priceDisplay}
          </div>
          <div style="display: flex; align-items: center; gap: 12px; color: #6b7280; font-size: 13px; margin-bottom: 8px;">
            <span>${bedroomDisplay} bed</span>
            <span>${listing.bathrooms} bath</span>
            ${!isSaleListing && hasParking ? '<span>Parking</span>' : ''}
            ${!isSaleListing ? `
              <span style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 11px;">
                ${listing.broker_fee ? 'Broker Fee' : 'No Fee'}
              </span>
            ` : ''}
          </div>
          <div style="display: flex; align-items: center; color: #6b7280; font-size: 13px; margin-bottom: 10px;">
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
              style="display: inline-flex; align-items: center; gap: 4px; background: #273140; color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; border: none; cursor: pointer;"
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
      if (onListingClick) {
        onListingClick(listingId);
      }
      navigate(`/listing/${listingId}`);
    };

    return () => {
      delete (window as any).__mapPopupClick__;
    };
  }, [navigate, onListingClick]);

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_ACCESS_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: BROOKLYN_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      setMapLoaded(true);
    });

    return () => {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      if (popup.current) {
        popup.current.remove();
        popup.current = null;
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    if (popup.current) {
      popup.current.remove();
      popup.current = null;
    }

    listingsWithCoords.forEach((listing) => {
      if (listing.latitude == null || listing.longitude == null) return;

      const el = document.createElement("div");
      el.className = "listing-marker";
      el.style.cssText = `
        width: 32px;
        height: 32px;
        background-color: #273140;
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        transition: transform 0.15s ease;
      `;

      el.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      `;

      el.addEventListener("mouseenter", () => {
        el.style.transform = "scale(1.15)";
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "scale(1)";
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([listing.longitude, listing.latitude])
        .addTo(map.current!);

      el.addEventListener("click", () => {
        if (popup.current) {
          popup.current.remove();
        }

        popup.current = new mapboxgl.Popup({
          closeButton: true,
          closeOnClick: false,
          maxWidth: "320px",
          offset: 15,
        })
          .setLngLat([listing.longitude!, listing.latitude!])
          .setHTML(createPopupContent(listing))
          .addTo(map.current!);
      });

      markers.current.push(marker);
    });

    if (listingsWithCoords.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      listingsWithCoords.forEach((listing) => {
        if (listing.latitude != null && listing.longitude != null) {
          bounds.extend([listing.longitude, listing.latitude]);
        }
      });

      map.current.fitBounds(bounds, {
        padding: 60,
        maxZoom: 15,
        duration: 1000,
      });
    }
  }, [listingsWithCoords, mapLoaded, createPopupContent]);

  if (!MAPBOX_ACCESS_TOKEN) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
        <div className="text-center text-gray-500">
          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Map functionality is not available.</p>
          <p className="text-sm">Please configure your Mapbox access token.</p>
        </div>
      </div>
    );
  }

  if (listingsWithCoords.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
        <div className="text-center text-gray-500">
          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No listings with map locations available.</p>
          <p className="text-sm">Try switching to List View to see all listings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={mapContainer}
        className="w-full h-[600px] rounded-lg border border-gray-200 overflow-hidden"
      />
      <div className="absolute bottom-4 left-4 bg-white px-3 py-1.5 rounded-full shadow-md text-sm text-gray-600">
        {listingsWithCoords.length} listing{listingsWithCoords.length !== 1 ? "s" : ""} on map
      </div>
    </div>
  );
}
