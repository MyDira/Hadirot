import React, { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { X, MapPin, Search, Loader2, CheckCircle } from "lucide-react";
import { MAPBOX_ACCESS_TOKEN } from "@/config/env";
import { geocodeCrossStreets, formatCorrectionMessage } from "@/services/geocoding";
import { reverseGeocode } from "@/services/reverseGeocode";
import { MapboxFeature } from "./MapboxStreetAutocomplete";

const DEFAULT_CENTER: [number, number] = [-73.9442, 40.6782];
const DEFAULT_ZOOM = 13;

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  crossStreets: string;
  crossStreetAFeature?: MapboxFeature | null;
  crossStreetBFeature?: MapboxFeature | null;
  neighborhood?: string;
  city?: string;
  initialLatitude: number | null;
  initialLongitude: number | null;
  onLocationConfirm: (lat: number, lng: number) => void;
  onNeighborhoodChange?: (neighborhood: string) => void;
  onZipCodeChange?: (zipCode: string) => void;
  onCityChange?: (city: string) => void;
}

export function MapModal({
  isOpen,
  onClose,
  crossStreets,
  crossStreetAFeature,
  crossStreetBFeature,
  neighborhood,
  city,
  initialLatitude,
  initialLongitude,
  onLocationConfirm,
  onNeighborhoodChange,
  onZipCodeChange,
  onCityChange,
}: MapModalProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocodeSuccess, setGeocodeSuccess] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hasMovedMap, setHasMovedMap] = useState(false);
  const [currentCenter, setCurrentCenter] = useState<{ lat: number; lng: number } | null>(null);

  const performReverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setIsReverseGeocoding(true);
      try {
        const result = await reverseGeocode(lat, lng);
        if (result.neighborhood && onNeighborhoodChange) {
          onNeighborhoodChange(result.neighborhood);
        }
        if (result.zipCode && onZipCodeChange) {
          onZipCodeChange(result.zipCode);
        }
        if (result.city && onCityChange) {
          onCityChange(result.city);
        }
      } catch (error) {
        console.error("Reverse geocoding error:", error);
      } finally {
        setIsReverseGeocoding(false);
      }
    },
    [onNeighborhoodChange, onZipCodeChange, onCityChange]
  );

  useEffect(() => {
    if (!isOpen || !mapContainer.current || !MAPBOX_ACCESS_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    const initialCenter: [number, number] =
      initialLongitude && initialLatitude ? [initialLongitude, initialLatitude] : DEFAULT_CENTER;

    const hasInitialLocation = !!(initialLatitude && initialLongitude);

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: initialCenter,
      zoom: hasInitialLocation ? 16 : DEFAULT_ZOOM,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      setMapLoaded(true);
      if (map.current) {
        const center = map.current.getCenter();
        setCurrentCenter({ lat: center.lat, lng: center.lng });
      }
    });

    map.current.on("move", () => {
      setHasMovedMap(true);
      if (map.current) {
        const center = map.current.getCenter();
        setCurrentCenter({ lat: center.lat, lng: center.lng });
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [isOpen, initialLatitude, initialLongitude]);

  const handleFindOnMap = async () => {
    // If we have both features, calculate midpoint directly
    if (crossStreetAFeature && crossStreetBFeature) {
      setIsGeocoding(true);
      setGeocodeError(null);
      setGeocodeSuccess(null);

      try {
        const [lng1, lat1] = crossStreetAFeature.center;
        const [lng2, lat2] = crossStreetBFeature.center;

        // Calculate midpoint
        const midLat = (lat1 + lat2) / 2;
        const midLng = (lng1 + lng2) / 2;

        if (map.current) {
          map.current.flyTo({
            center: [midLng, midLat],
            zoom: 16,
            duration: 1000,
          });
          setCurrentCenter({ lat: midLat, lng: midLng });
        }

        setGeocodeSuccess(`Location found: ${crossStreetAFeature.text} & ${crossStreetBFeature.text}`);
        performReverseGeocode(midLat, midLng);
      } catch (error) {
        console.error("Midpoint calculation error:", error);
        setGeocodeError("Failed to calculate location. Please try again.");
      } finally {
        setIsGeocoding(false);
      }
      return;
    }

    // Fallback to legacy geocoding if no features provided
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

        if (map.current) {
          map.current.flyTo({
            center: [lng, lat],
            zoom: 16,
            duration: 1000,
          });
          setCurrentCenter({ lat, lng });
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
          performReverseGeocode(lat, lng);
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

  const handleFreezeLocation = () => {
    if (!currentCenter) return;

    performReverseGeocode(currentCenter.lat, currentCenter.lng);
    onLocationConfirm(currentCenter.lat, currentCenter.lng);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onKeyDown={handleKeyDown}
    >
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-6xl mx-auto overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-[#273140]">Set Location on Map</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleFindOnMap}
                disabled={isGeocoding || !crossStreets.trim()}
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
              <button
                type="button"
                onClick={handleFreezeLocation}
                disabled={!hasMovedMap && !currentCenter}
                className="inline-flex items-center px-6 py-2 bg-[#273140] text-white text-sm font-semibold rounded-md hover:bg-[#1a2129] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <MapPin className="w-4 h-4 mr-2" />
                Confirm Location
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>

            {geocodeError && (
              <p className="text-sm text-red-600 mt-2">{geocodeError}</p>
            )}

            {geocodeSuccess && !geocodeError && (
              <div className="flex items-center gap-2 text-sm text-green-600 mt-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>{geocodeSuccess}</span>
              </div>
            )}
          </div>

          <div className="relative">
            <div
              ref={mapContainer}
              className="w-full h-[70vh] rounded-lg border border-gray-300 overflow-hidden"
            />

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none z-10">
              <div className="transition-transform duration-150">
                <MapPin
                  className="w-10 h-10 text-[#273140] drop-shadow-lg"
                  fill="#273140"
                  strokeWidth={1}
                  stroke="white"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span>
                {isReverseGeocoding
                  ? "Detecting neighborhood..."
                  : "Please confirm this location is correct or drag the map to adjust the pin to the correct spot"}
              </span>
            </div>

            {currentCenter && (
              <div className="text-xs text-gray-500">
                Coordinates: {currentCenter.lat.toFixed(6)}, {currentCenter.lng.toFixed(6)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
