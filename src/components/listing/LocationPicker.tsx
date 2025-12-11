import React, { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { MapPin, Search, Loader2, Crosshair, CheckCircle } from "lucide-react";
import { MAPBOX_ACCESS_TOKEN } from "@/config/env";
import { geocodeCrossStreets, formatCorrectionMessage } from "@/services/geocoding";

const DEFAULT_CENTER: [number, number] = [-73.9442, 40.6782];
const DEFAULT_ZOOM = 13;

interface LocationPickerProps {
  crossStreets: string;
  neighborhood?: string;
  latitude: number | null;
  longitude: number | null;
  onLocationChange: (lat: number | null, lng: number | null) => void;
  onNeighborhoodChange?: (neighborhood: string) => void;
  disabled?: boolean;
}

export function LocationPicker({
  crossStreets,
  neighborhood,
  latitude,
  longitude,
  onLocationChange,
  onNeighborhoodChange,
  disabled = false,
}: LocationPickerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocodeSuccess, setGeocodeSuccess] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isLocationSet, setIsLocationSet] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const moveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      if (!onNeighborhoodChange) return;

      setIsReverseGeocoding(true);
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&types=neighborhood,locality,place`
        );

        if (!response.ok) return;

        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const neighborhoodFeature = data.features.find(
            (f: any) => f.place_type.includes("neighborhood") || f.place_type.includes("locality")
          );
          if (neighborhoodFeature) {
            onNeighborhoodChange(neighborhoodFeature.text);
          }
        }
      } catch (error) {
        console.error("Reverse geocoding error:", error);
      } finally {
        setIsReverseGeocoding(false);
      }
    },
    [onNeighborhoodChange]
  );

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_ACCESS_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    const initialCenter: [number, number] =
      longitude && latitude ? [longitude, latitude] : DEFAULT_CENTER;

    const hasInitialLocation = !!(latitude && longitude);

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: initialCenter,
      zoom: hasInitialLocation ? 16 : DEFAULT_ZOOM,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      setMapLoaded(true);
      if (hasInitialLocation) {
        setIsLocationSet(true);
      }
    });

    map.current.on("dragstart", () => {
      if (isLocationSet && !disabled) {
        setIsDragging(true);
      }
    });

    map.current.on("dragend", () => {
      setIsDragging(false);
    });

    map.current.on("moveend", () => {
      if (!isLocationSet || disabled) return;

      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }

      moveTimeoutRef.current = setTimeout(() => {
        if (map.current) {
          const center = map.current.getCenter();
          onLocationChange(center.lat, center.lng);
          reverseGeocode(center.lat, center.lng);
        }
      }, 300);
    });

    return () => {
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    if (latitude && longitude && !isLocationSet) {
      map.current.flyTo({
        center: [longitude, latitude],
        zoom: 16,
        duration: 1000,
      });
      setIsLocationSet(true);
    }
  }, [latitude, longitude, mapLoaded, isLocationSet]);

  const handleFindOnMap = async () => {
    if (!crossStreets.trim()) {
      setGeocodeError("Please enter cross streets first");
      setGeocodeSuccess(null);
      return;
    }

    setIsGeocoding(true);
    setGeocodeError(null);
    setGeocodeSuccess(null);

    try {
      const result = await geocodeCrossStreets({
        crossStreets: crossStreets.trim(),
        neighborhood: neighborhood?.trim(),
      });

      if (result.success && result.coordinates) {
        const { latitude: lat, longitude: lng } = result.coordinates;
        setIsLocationSet(true);
        onLocationChange(lat, lng);

        if (map.current) {
          map.current.flyTo({
            center: [lng, lat],
            zoom: 16,
            duration: 1000,
          });
        }

        const correctionMessage = formatCorrectionMessage(result);
        if (correctionMessage) {
          setGeocodeSuccess(correctionMessage);
        } else if (result.normalizedQuery && result.normalizedQuery !== crossStreets.trim()) {
          setGeocodeSuccess(`Found: ${result.normalizedQuery}`);
        }

        if (result.neighborhood && onNeighborhoodChange) {
          onNeighborhoodChange(result.neighborhood);
        } else {
          reverseGeocode(lat, lng);
        }
      } else {
        setGeocodeError(
          result.error || "Location not found. Try a different format (e.g., 'Avenue J & East 15th Street')"
        );
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      setGeocodeError("Failed to find location. Please try again.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleSetCurrentCenter = () => {
    if (!map.current || disabled) return;

    const center = map.current.getCenter();
    setIsLocationSet(true);
    onLocationChange(center.lat, center.lng);
    reverseGeocode(center.lat, center.lng);
  };

  const handleClearLocation = () => {
    setIsLocationSet(false);
    setGeocodeSuccess(null);
    setGeocodeError(null);
    onLocationChange(null, null);
    if (map.current) {
      map.current.flyTo({
        center: DEFAULT_CENTER,
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
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleFindOnMap}
          disabled={disabled || isGeocoding || !crossStreets.trim()}
          className="inline-flex items-center px-4 py-2 bg-accent-500 text-white text-sm font-medium rounded-md hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

        {!isLocationSet && (
          <button
            type="button"
            onClick={handleSetCurrentCenter}
            disabled={disabled}
            className="inline-flex items-center px-4 py-2 border border-[#273140] text-[#273140] text-sm font-medium rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Crosshair className="w-4 h-4 mr-2" />
            Set Pin Location
          </button>
        )}

        {isLocationSet && (
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

      {geocodeSuccess && !geocodeError && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{geocodeSuccess}</span>
        </div>
      )}

      <div className="relative">
        <div
          ref={mapContainer}
          className="w-full h-72 rounded-lg border border-gray-300 overflow-hidden"
        />

        {isLocationSet && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none z-10">
            <div className={`transition-transform duration-150 ${isDragging ? "scale-125" : "scale-100"}`}>
              <MapPin
                className="w-10 h-10 text-[#273140] drop-shadow-lg"
                fill="#273140"
                strokeWidth={1}
                stroke="white"
              />
            </div>
          </div>
        )}

        {!isLocationSet && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
            <div className="w-8 h-8 border-2 border-dashed border-gray-400 rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-gray-400 rounded-full" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-600">
        <MapPin className="w-4 h-4 flex-shrink-0" />
        {isLocationSet ? (
          <span>
            {isReverseGeocoding ? (
              "Detecting neighborhood..."
            ) : (
              "Move the map to adjust the pin location."
            )}
          </span>
        ) : (
          <span>
            Use "Find on Map" or navigate to location and click "Set Pin Location".
          </span>
        )}
      </div>
    </div>
  );
}
