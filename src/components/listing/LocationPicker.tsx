import React, { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { MapPin, Search, Loader2 } from "lucide-react";
import { MAPBOX_ACCESS_TOKEN } from "@/config/env";

const BROOKLYN_CENTER: [number, number] = [-73.9442, 40.6782];
const DEFAULT_ZOOM = 13;

interface LocationPickerProps {
  crossStreets: string;
  latitude: number | null;
  longitude: number | null;
  onLocationChange: (lat: number | null, lng: number | null) => void;
  disabled?: boolean;
}

export function LocationPicker({
  crossStreets,
  latitude,
  longitude,
  onLocationChange,
  disabled = false,
}: LocationPickerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_ACCESS_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    const initialCenter: [number, number] =
      longitude && latitude ? [longitude, latitude] : BROOKLYN_CENTER;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: initialCenter,
      zoom: latitude && longitude ? 15 : DEFAULT_ZOOM,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      setMapLoaded(true);

      if (latitude && longitude) {
        createOrUpdateMarker(longitude, latitude);
      }
    });

    return () => {
      if (marker.current) {
        marker.current.remove();
        marker.current = null;
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    if (latitude && longitude) {
      createOrUpdateMarker(longitude, latitude);
      map.current.flyTo({
        center: [longitude, latitude],
        zoom: 15,
        duration: 1000,
      });
    }
  }, [latitude, longitude, mapLoaded]);

  const createOrUpdateMarker = useCallback(
    (lng: number, lat: number) => {
      if (!map.current) return;

      if (marker.current) {
        marker.current.setLngLat([lng, lat]);
      } else {
        marker.current = new mapboxgl.Marker({
          color: "#273140",
          draggable: !disabled,
        })
          .setLngLat([lng, lat])
          .addTo(map.current);

        if (!disabled) {
          marker.current.on("dragend", () => {
            const lngLat = marker.current?.getLngLat();
            if (lngLat) {
              onLocationChange(lngLat.lat, lngLat.lng);
            }
          });
        }
      }
    },
    [disabled, onLocationChange]
  );

  const handleFindOnMap = async () => {
    if (!crossStreets.trim()) {
      setGeocodeError("Please enter cross streets first");
      return;
    }

    setIsGeocoding(true);
    setGeocodeError(null);

    try {
      const searchQuery = `${crossStreets.trim()}, Brooklyn, NY`;
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1&bbox=-74.042,40.57,-73.833,40.739`
      );

      if (!response.ok) {
        throw new Error("Geocoding request failed");
      }

      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        onLocationChange(lat, lng);
      } else {
        setGeocodeError(
          "Location not found. Try a different format (e.g., 'Avenue J & East 15th Street')"
        );
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      setGeocodeError("Failed to find location. Please try again.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleClearLocation = () => {
    onLocationChange(null, null);
    if (marker.current) {
      marker.current.remove();
      marker.current = null;
    }
    if (map.current) {
      map.current.flyTo({
        center: BROOKLYN_CENTER,
        zoom: DEFAULT_ZOOM,
        duration: 1000,
      });
    }
  };

  if (!MAPBOX_ACCESS_TOKEN) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-amber-800 text-sm">
        Map functionality is not available. Please configure your Mapbox access
        token.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleFindOnMap}
          disabled={disabled || isGeocoding || !crossStreets.trim()}
          className="inline-flex items-center px-4 py-2 bg-[#273140] text-white text-sm font-medium rounded-md hover:bg-[#1e252f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isGeocoding ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Finding...
            </>
          ) : (
            <>
              <Search className="w-4 h-4 mr-2" />
              Find on Map
            </>
          )}
        </button>

        {(latitude || longitude) && (
          <button
            type="button"
            onClick={handleClearLocation}
            disabled={disabled}
            className="inline-flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Clear Location
          </button>
        )}
      </div>

      {geocodeError && (
        <p className="text-sm text-red-600">{geocodeError}</p>
      )}

      <div
        ref={mapContainer}
        className="w-full h-64 rounded-lg border border-gray-300 overflow-hidden"
      />

      {latitude && longitude && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="w-4 h-4" />
          <span>
            Location set. Drag the marker to adjust if needed.
          </span>
        </div>
      )}
    </div>
  );
}
