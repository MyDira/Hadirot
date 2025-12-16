import React, { useRef, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import { Listing } from "../../config/supabase";
import { MAPBOX_ACCESS_TOKEN } from "@/config/env";
import { computePrimaryListingImage } from "../../utils/stockImage";
import { formatPrice, capitalizeName } from "../../utils/formatters";
import { PolygonGeometry } from "../../services/locationSearch";

const BROOKLYN_CENTER: [number, number] = [-73.9442, 40.6782];
const DEFAULT_ZOOM = 12;
const AUTO_SEARCH_ZOOM_THRESHOLD = 14;

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface DrawnPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface ListingsMapEnhancedProps {
  listings: Listing[];
  hoveredListingId?: string | null;
  selectedListingId?: string | null;
  onMarkerHover?: (listingId: string | null) => void;
  onMarkerClick?: (listingId: string) => void;
  onBoundsChange?: (bounds: MapBounds, zoomLevel: number) => void;
  userLocation?: { lat: number; lng: number } | null;
  searchBounds?: MapBounds | null;
  searchPolygon?: PolygonGeometry | null;
  searchLocationName?: string;
  isDrawingMode?: boolean;
  drawnPolygon?: DrawnPolygon | null;
  onDrawComplete?: (polygon: DrawnPolygon) => void;
  onDrawClear?: () => void;
}

export function ListingsMapEnhanced({
  listings,
  hoveredListingId,
  selectedListingId,
  onMarkerHover,
  onMarkerClick,
  onBoundsChange,
  userLocation,
  searchBounds,
  searchPolygon,
  searchLocationName,
  isDrawingMode = false,
  drawnPolygon,
  onDrawComplete,
  onDrawClear,
}: ListingsMapEnhancedProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, { marker: mapboxgl.Marker; element: HTMLDivElement }>>(new Map());
  const popup = useRef<mapboxgl.Popup | null>(null);
  const userLocationMarker = useRef<mapboxgl.Marker | null>(null);
  const drawingPoints = useRef<number[][]>([]);
  const drawingMarkers = useRef<mapboxgl.Marker[]>([]);
  const navigate = useNavigate();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentDrawingPoints, setCurrentDrawingPoints] = useState<number[][]>([]);
  const boundsChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const listingsWithCoords = listings.filter(
    (l) => l.latitude != null && l.longitude != null
  );

  const formatPriceShort = (price: number): string => {
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
    const priceText = listing.call_for_price ? "Call" : price != null ? formatPriceShort(price) : "N/A";

    const baseClasses = "relative cursor-pointer transition-all duration-150";
    const colorClasses = isHovered || isSelected
      ? "bg-brand-600 text-white"
      : "bg-white text-brand-800 border border-gray-300";
    const scaleClass = isHovered || isSelected ? "scale-110 z-50" : "hover:scale-105";
    const shadowClass = isHovered || isSelected ? "shadow-lg" : "shadow-md hover:shadow-lg";

    el.innerHTML = `
      <div class="${baseClasses} ${colorClasses} ${scaleClass} ${shadowClass} px-2.5 py-1 rounded-full text-sm font-semibold whitespace-nowrap" style="font-family: var(--num-font);">
        ${priceText}
      </div>
      <div class="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-0 h-0 border-l-4 border-r-4 border-t-4 ${isHovered || isSelected ? 'border-t-brand-600' : 'border-t-white'} border-l-transparent border-r-transparent"></div>
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
          <div style="font-size: 20px; font-weight: 700; color: #1E4A74; margin-bottom: 8px; font-family: var(--num-font);">
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
              style="display: inline-flex; align-items: center; gap: 4px; background: #1E4A74; color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; border: none; cursor: pointer;"
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
        const newElement = createPriceMarkerElement(listing, isHovered, isSelected);
        existingItem.element.innerHTML = newElement.innerHTML;
        existingItem.element.className = newElement.className;
      } else {
        const el = createPriceMarkerElement(listing, isHovered, isSelected);

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
  }, [listingsWithCoords, mapLoaded, hoveredListingId, selectedListingId, createPriceMarkerElement, createPopupContent, onMarkerHover, onMarkerClick]);

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

  const createInvertedMaskGeoJSON = useCallback((innerPolygon: number[][][] | number[][][][], geometryType: 'Polygon' | 'MultiPolygon'): GeoJSON.Feature<GeoJSON.Polygon> => {
    const outerRing: number[][] = [
      [-180, 90],
      [180, 90],
      [180, -90],
      [-180, -90],
      [-180, 90],
    ];

    let innerRing: number[][];
    if (geometryType === 'Polygon') {
      innerRing = (innerPolygon as number[][][])[0];
    } else {
      innerRing = (innerPolygon as number[][][][])[0][0];
    }

    const reversedInnerRing = [...innerRing].reverse();

    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [outerRing, reversedInnerRing],
      },
    };
  }, []);

  const calculatePolygonCenter = useCallback((coordinates: number[][][] | number[][][][], geometryType: 'Polygon' | 'MultiPolygon'): { lat: number; lng: number } => {
    let sumLat = 0;
    let sumLng = 0;
    let count = 0;

    if (geometryType === 'Polygon') {
      const ring = (coordinates as number[][][])[0];
      for (const coord of ring) {
        sumLng += coord[0];
        sumLat += coord[1];
        count++;
      }
    } else {
      for (const polygon of coordinates as number[][][][]) {
        for (const ring of polygon) {
          for (const coord of ring) {
            sumLng += coord[0];
            sumLat += coord[1];
            count++;
          }
        }
      }
    }

    return {
      lat: count > 0 ? sumLat / count : 0,
      lng: count > 0 ? sumLng / count : 0,
    };
  }, []);

  const calculatePolygonBounds = useCallback((coordinates: number[][][] | number[][][][], geometryType: 'Polygon' | 'MultiPolygon'): mapboxgl.LngLatBounds => {
    const bounds = new mapboxgl.LngLatBounds();

    if (geometryType === 'Polygon') {
      const ring = (coordinates as number[][][])[0];
      for (const coord of ring) {
        bounds.extend([coord[0], coord[1]] as [number, number]);
      }
    } else {
      for (const polygon of coordinates as number[][][][]) {
        for (const ring of polygon) {
          for (const coord of ring) {
            bounds.extend([coord[0], coord[1]] as [number, number]);
          }
        }
      }
    }

    return bounds;
  }, []);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const maskSourceId = 'search-area-mask';
    const maskLayerId = 'search-area-mask-fill';
    const outlineSourceId = 'search-area-outline-source';
    const outlineLayerId = 'search-area-outline';

    const clearLayers = () => {
      if (map.current?.getLayer(maskLayerId)) {
        map.current.removeLayer(maskLayerId);
      }
      if (map.current?.getLayer(outlineLayerId)) {
        map.current.removeLayer(outlineLayerId);
      }
      if (map.current?.getSource(maskSourceId)) {
        map.current.removeSource(maskSourceId);
      }
      if (map.current?.getSource(outlineSourceId)) {
        map.current.removeSource(outlineSourceId);
      }
    };

    const activePolygon = drawnPolygon || searchPolygon;

    if (!activePolygon && !searchBounds) {
      clearLayers();
      return;
    }

    let innerCoordinates: number[][][] | number[][][][];
    let geometryType: 'Polygon' | 'MultiPolygon';

    if (activePolygon) {
      innerCoordinates = activePolygon.coordinates;
      geometryType = activePolygon.type;
    } else if (searchBounds) {
      innerCoordinates = [[
        [searchBounds.west, searchBounds.north],
        [searchBounds.east, searchBounds.north],
        [searchBounds.east, searchBounds.south],
        [searchBounds.west, searchBounds.south],
        [searchBounds.west, searchBounds.north],
      ]];
      geometryType = 'Polygon';
    } else {
      clearLayers();
      return;
    }

    const maskGeoJson = createInvertedMaskGeoJSON(innerCoordinates, geometryType);

    let outlineGeoJson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
    if (geometryType === 'Polygon') {
      outlineGeoJson = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: innerCoordinates as number[][][],
        },
      };
    } else {
      outlineGeoJson = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'MultiPolygon',
          coordinates: innerCoordinates as number[][][][],
        },
      };
    }

    clearLayers();

    map.current.addSource(maskSourceId, {
      type: 'geojson',
      data: maskGeoJson,
    });

    map.current.addSource(outlineSourceId, {
      type: 'geojson',
      data: outlineGeoJson,
    });

    map.current.addLayer({
      id: maskLayerId,
      type: 'fill',
      source: maskSourceId,
      paint: {
        'fill-color': '#374151',
        'fill-opacity': 0.4,
      },
    });

    map.current.addLayer({
      id: outlineLayerId,
      type: 'line',
      source: outlineSourceId,
      paint: {
        'line-color': '#1E4A74',
        'line-width': 3,
        'line-opacity': 0.8,
      },
    });

    const center = calculatePolygonCenter(innerCoordinates, geometryType);
    const bounds = calculatePolygonBounds(innerCoordinates, geometryType);

    map.current.fitBounds(bounds, {
      padding: 50,
      duration: 1200,
      maxZoom: 15,
    });
  }, [searchBounds, searchPolygon, drawnPolygon, mapLoaded, createInvertedMaskGeoJSON, calculatePolygonCenter, calculatePolygonBounds]);

  const clearDrawing = useCallback(() => {
    drawingMarkers.current.forEach(marker => marker.remove());
    drawingMarkers.current = [];
    drawingPoints.current = [];
    setCurrentDrawingPoints([]);

    if (map.current) {
      const drawingSourceId = 'drawing-line';
      const drawingLayerId = 'drawing-line-layer';
      const drawingPolygonSourceId = 'drawing-polygon-preview';
      const drawingPolygonLayerId = 'drawing-polygon-preview-layer';

      if (map.current.getLayer(drawingLayerId)) {
        map.current.removeLayer(drawingLayerId);
      }
      if (map.current.getSource(drawingSourceId)) {
        map.current.removeSource(drawingSourceId);
      }
      if (map.current.getLayer(drawingPolygonLayerId)) {
        map.current.removeLayer(drawingPolygonLayerId);
      }
      if (map.current.getSource(drawingPolygonSourceId)) {
        map.current.removeSource(drawingPolygonSourceId);
      }
    }
  }, []);

  const updateDrawingPreview = useCallback(() => {
    if (!map.current || drawingPoints.current.length < 2) return;

    const drawingSourceId = 'drawing-line';
    const drawingLayerId = 'drawing-line-layer';
    const drawingPolygonSourceId = 'drawing-polygon-preview';
    const drawingPolygonLayerId = 'drawing-polygon-preview-layer';

    const lineCoords = [...drawingPoints.current];
    const lineGeoJson: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: lineCoords,
      },
    };

    if (map.current.getSource(drawingSourceId)) {
      (map.current.getSource(drawingSourceId) as mapboxgl.GeoJSONSource).setData(lineGeoJson);
    } else {
      map.current.addSource(drawingSourceId, {
        type: 'geojson',
        data: lineGeoJson,
      });

      map.current.addLayer({
        id: drawingLayerId,
        type: 'line',
        source: drawingSourceId,
        paint: {
          'line-color': '#1E4A74',
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      });
    }

    if (drawingPoints.current.length >= 3) {
      const polygonCoords = [...drawingPoints.current, drawingPoints.current[0]];
      const polygonGeoJson: GeoJSON.Feature<GeoJSON.Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [polygonCoords],
        },
      };

      if (map.current.getSource(drawingPolygonSourceId)) {
        (map.current.getSource(drawingPolygonSourceId) as mapboxgl.GeoJSONSource).setData(polygonGeoJson);
      } else {
        map.current.addSource(drawingPolygonSourceId, {
          type: 'geojson',
          data: polygonGeoJson,
        });

        map.current.addLayer({
          id: drawingPolygonLayerId,
          type: 'fill',
          source: drawingPolygonSourceId,
          paint: {
            'fill-color': '#1E4A74',
            'fill-opacity': 0.1,
          },
        });
      }
    }
  }, []);

  const finishDrawing = useCallback(() => {
    if (drawingPoints.current.length < 3) return;

    const closedPolygon: number[][] = [...drawingPoints.current, drawingPoints.current[0]];
    const drawnPoly: DrawnPolygon = {
      type: 'Polygon',
      coordinates: [closedPolygon],
    };

    clearDrawing();

    if (onDrawComplete) {
      onDrawComplete(drawnPoly);
    }
  }, [onDrawComplete, clearDrawing]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
      if (!isDrawingMode) return;

      const lngLat = e.lngLat;
      const point: number[] = [lngLat.lng, lngLat.lat];

      drawingPoints.current.push(point);
      setCurrentDrawingPoints([...drawingPoints.current]);

      const el = document.createElement('div');
      el.className = 'drawing-point-marker';
      el.style.cssText = `
        width: 12px;
        height: 12px;
        background: #1E4A74;
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      `;

      if (drawingPoints.current.length === 1) {
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.background = '#22c55e';
        el.title = 'Click to close polygon';
      }

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lngLat.lng, lngLat.lat])
        .addTo(map.current!);

      if (drawingPoints.current.length === 1) {
        el.addEventListener('click', (evt) => {
          evt.stopPropagation();
          if (drawingPoints.current.length >= 3) {
            finishDrawing();
          }
        });
      }

      drawingMarkers.current.push(marker);
      updateDrawingPreview();
    };

    const handleDblClick = (e: mapboxgl.MapMouseEvent) => {
      if (!isDrawingMode) return;
      e.preventDefault();

      if (drawingPoints.current.length >= 3) {
        finishDrawing();
      }
    };

    map.current.on('click', handleMapClick);
    map.current.on('dblclick', handleDblClick);

    if (isDrawingMode) {
      map.current.getCanvas().style.cursor = 'crosshair';
    } else {
      map.current.getCanvas().style.cursor = '';
      clearDrawing();
    }

    return () => {
      if (map.current) {
        map.current.off('click', handleMapClick);
        map.current.off('dblclick', handleDblClick);
      }
    };
  }, [isDrawingMode, mapLoaded, finishDrawing, clearDrawing, updateDrawingPreview]);

  useEffect(() => {
    if (!isDrawingMode && onDrawClear) {
      clearDrawing();
    }
  }, [isDrawingMode, onDrawClear, clearDrawing]);

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

      {isDrawingMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-gray-200 z-10">
          <p className="text-sm text-gray-700 font-medium">
            {currentDrawingPoints.length === 0 && "Click on the map to start drawing your search area"}
            {currentDrawingPoints.length === 1 && "Click to add more points"}
            {currentDrawingPoints.length === 2 && "Add at least one more point"}
            {currentDrawingPoints.length >= 3 && (
              <>Double-click or click the <span className="text-green-600 font-semibold">green dot</span> to finish</>
            )}
          </p>
        </div>
      )}

      <style>{`
        .mapboxgl-popup-content {
          padding: 0 !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
          overflow: hidden;
        }
        .mapboxgl-popup-close-button {
          font-size: 20px;
          padding: 4px 8px;
          color: #6b7280;
          right: 4px;
          top: 4px;
          background: white;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .mapboxgl-popup-close-button:hover {
          background: #f3f4f6;
          color: #1f2937;
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
        }
      `}</style>
    </div>
  );
}
