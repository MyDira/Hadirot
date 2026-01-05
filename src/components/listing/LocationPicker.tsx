import React, { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { MapPin, Search, Loader2, CheckCircle, Maximize2 } from "lucide-react";
import { MAPBOX_ACCESS_TOKEN } from "@/config/env";
import { geocodeCrossStreets, formatCorrectionMessage } from "@/services/geocoding";
import { reverseGeocode } from "@/services/reverseGeocode";
import { MapModal } from "./MapModal";
import { MapboxFeature } from "./MapboxStreetAutocomplete";

const DEFAULT_CENTER: [number, number] = [-73.9442, 40.6782];
const PREVIEW_ZOOM = 15;

interface LocationPickerProps {
  crossStreets: string;
  crossStreetAFeature?: MapboxFeature | null;
  crossStreetBFeature?: MapboxFeature | null;
  neighborhood?: string;
  city?: string;
  latitude: number | null;
  longitude: number | null;
  onLocationChange: (lat: number | null, lng: number | null) => void;
  onNeighborhoodChange?: (neighborhood: string) => void;
  onZipCodeChange?: (zipCode: string) => void;
  onCityChange?: (city: string) => void;
  onGeocodeStatusChange?: (error: string | null, success: string | null) => void;
  onConfirmationStatusChange?: (confirmed: boolean) => void;
  disabled?: boolean;
}

export function LocationPicker({
  crossStreets,
  crossStreetAFeature,
  crossStreetBFeature,
  neighborhood,
  city,
  latitude,
  longitude,
  onLocationChange,
  onNeighborhoodChange,
  onZipCodeChange,
  onCityChange,
  onGeocodeStatusChange,
  onConfirmationStatusChange,
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
  const [showMapModal, setShowMapModal] = useState(false);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(false);

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
    if (!mapContainer.current || !MAPBOX_ACCESS_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    const initialCenter: [number, number] =
      longitude && latitude ? [longitude, latitude] : DEFAULT_CENTER;

    const hasInitialLocation = !!(latitude && longitude);

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: initialCenter,
      zoom: hasInitialLocation ? 16 : PREVIEW_ZOOM,
      interactive: false,
    });

    map.current.on("load", () => {
      setMapLoaded(true);
      if (hasInitialLocation) {
        setIsLocationSet(true);
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    if (latitude && longitude) {
      map.current.flyTo({
        center: [longitude, latitude],
        zoom: 16,
        duration: 1000,
      });
      setIsLocationSet(true);
    }
  }, [latitude, longitude, mapLoaded]);

  const handleFindOnMap = async () => {
    if (!crossStreets.trim()) {
      const errorMsg = "Please enter cross streets first";
      setGeocodeError(errorMsg);
      setGeocodeSuccess(null);
      if (onGeocodeStatusChange) onGeocodeStatusChange(errorMsg, null);
      return;
    }

    setIsGeocoding(true);
    setGeocodeError(null);
    setGeocodeSuccess(null);
    if (onGeocodeStatusChange) onGeocodeStatusChange(null, null);

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
        let successMsg = null;
        if (correctionMessage) {
          successMsg = correctionMessage;
          setGeocodeSuccess(correctionMessage);
        } else if (result.normalizedQuery && result.normalizedQuery !== crossStreets.trim()) {
          successMsg = `Found: ${result.normalizedQuery}`;
          setGeocodeSuccess(successMsg);
        }
        if (onGeocodeStatusChange) onGeocodeStatusChange(null, successMsg);

        if (result.neighborhood && onNeighborhoodChange) {
          onNeighborhoodChange(result.neighborhood);
        } else {
          performReverseGeocode(lat, lng);
        }

        // Set unconfirmed and open modal in confirmation mode
        setIsLocationConfirmed(false);
        if (onConfirmationStatusChange) onConfirmationStatusChange(false);
        setRequiresConfirmation(true);
        setShowMapModal(true);
      } else {
        const errorMsg = result.error || "Location not found. Try a different format (e.g., 'Avenue J & East 15th Street')";
        setGeocodeError(errorMsg);
        if (onGeocodeStatusChange) onGeocodeStatusChange(errorMsg, null);
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      const errorMsg = "Failed to find location. Please try again.";
      setGeocodeError(errorMsg);
      if (onGeocodeStatusChange) onGeocodeStatusChange(errorMsg, null);
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleLocationConfirm = (lat: number, lng: number) => {
    setIsLocationSet(true);
    onLocationChange(lat, lng);
    setIsLocationConfirmed(true);
    if (onConfirmationStatusChange) onConfirmationStatusChange(true);

    if (map.current) {
      map.current.flyTo({
        center: [lng, lat],
        zoom: 16,
        duration: 1000,
      });
    }
  };

  const handleClearLocation = () => {
    setIsLocationSet(false);
    setGeocodeSuccess(null);
    setGeocodeError(null);
    setIsLocationConfirmed(false);
    if (onConfirmationStatusChange) onConfirmationStatusChange(false);
    onLocationChange(null, null);
    if (map.current) {
      map.current.flyTo({
        center: DEFAULT_CENTER,
        zoom: PREVIEW_ZOOM,
        duration: 1000,
      });
    }
  };

  const handleOpenModalManually = () => {
    setRequiresConfirmation(false);
    setShowMapModal(true);
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
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleFindOnMap}
            disabled={
              disabled ||
              isGeocoding ||
              (crossStreetAFeature !== undefined || crossStreetBFeature !== undefined
                ? !crossStreetAFeature || !crossStreetBFeature
                : !crossStreets.trim())
            }
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
            onClick={handleOpenModalManually}
            disabled={disabled}
            className="inline-flex items-center px-4 py-2 border border-[#273140] text-[#273140] text-sm font-medium rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <MapPin className="w-4 h-4 mr-2" />
            Set Pin Location
          </button>

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

        <div
          className="relative cursor-pointer group"
          onClick={handleOpenModalManually}
        >
          <div
            ref={mapContainer}
            className="w-full h-56 rounded-lg border-2 border-gray-300 overflow-hidden shadow-sm transition-all group-hover:border-accent-400 group-hover:shadow-md"
          />

          {isLocationSet && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none z-10">
              <MapPin
                className="w-8 h-8 text-[#273140] drop-shadow-lg"
                fill="#273140"
                strokeWidth={1}
                stroke="white"
              />
            </div>
          )}

          {!isLocationSet && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
              <div className="w-8 h-8 border-2 border-dashed border-gray-400 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-gray-400 rounded-full" />
              </div>
            </div>
          )}

          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all flex items-center justify-center pointer-events-none">
            <div className="bg-white px-4 py-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
              <Maximize2 className="w-4 h-4 text-[#273140]" />
              <span className="text-sm font-medium text-[#273140]">Click to expand</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <MapPin className="w-4 h-4 flex-shrink-0" />
          {isLocationSet ? (
            <span className={isLocationConfirmed ? "text-gray-600" : "text-amber-700"}>
              {isReverseGeocoding ? (
                "Detecting neighborhood..."
              ) : isLocationConfirmed ? (
                "Location confirmed. Click map to adjust or use 'Set Pin Location' button."
              ) : (
                "Location needs confirmation - click to review and confirm"
              )}
            </span>
          ) : (
            <span className="text-gray-600">
              Use "Find on Map" to geocode address, or click "Set Pin Location" to manually position.
            </span>
          )}
        </div>
      </div>

      <MapModal
        isOpen={showMapModal}
        onClose={() => setShowMapModal(false)}
        crossStreets={crossStreets}
        crossStreetAFeature={crossStreetAFeature}
        crossStreetBFeature={crossStreetBFeature}
        neighborhood={neighborhood}
        city={city}
        initialLatitude={latitude}
        initialLongitude={longitude}
        onLocationConfirm={handleLocationConfirm}
        onNeighborhoodChange={onNeighborhoodChange}
        onZipCodeChange={onZipCodeChange}
        onCityChange={onCityChange}
        requiresConfirmation={requiresConfirmation}
      />
    </>
  );
}
