import React, { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { MapPin, Loader2, Maximize2, Check } from "lucide-react";
import { MAPBOX_ACCESS_TOKEN } from "@/config/env";
import { geocodeCrossStreets, formatCorrectionMessage } from "@/services/geocoding";
import { reverseGeocode } from "@/services/reverseGeocode";
import { MapModal } from "./MapModal";
import { GoogleStreetFeature } from "./GoogleStreetAutocomplete";

const DEFAULT_CENTER: [number, number] = [-73.9442, 40.6782];
const PREVIEW_ZOOM = 15;

interface LocationPickerProps {
  crossStreets: string;
  crossStreetAFeature?: GoogleStreetFeature | null;
  crossStreetBFeature?: GoogleStreetFeature | null;
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
  preResolvedLatitude?: number | null;
  preResolvedLongitude?: number | null;
  hideFindOnMap?: boolean;
  /** Pre-seed the confirmed state when returning to this step with an already-confirmed location */
  initialConfirmed?: boolean;
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
  preResolvedLatitude,
  preResolvedLongitude,
  hideFindOnMap = false,
  initialConfirmed = false,
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
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(initialConfirmed);

  // Track previous pre-resolved coords to detect a new address being selected
  const prevPreResolvedLat = useRef(preResolvedLatitude);
  const prevPreResolvedLng = useRef(preResolvedLongitude);

  // Track previous crossStreets string to detect when the user picks a new combination
  const prevCrossStreets = useRef(crossStreets);

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

  // Confirm the geocoded address without opening the modal (full-address mode)
  const handleDirectConfirm = useCallback(() => {
    if (latitude && longitude) {
      setIsLocationConfirmed(true);
      setRequiresConfirmation(false);
      if (onConfirmationStatusChange) onConfirmationStatusChange(true);
    }
  }, [latitude, longitude, onConfirmationStatusChange]);

  // When a new address is picked in full-address mode, reset confirmation and
  // auto-populate neighborhood via reverse geocoding (same as cross-streets mode).
  useEffect(() => {
    if (!hideFindOnMap) return;
    const latChanged = preResolvedLatitude !== prevPreResolvedLat.current;
    const lngChanged = preResolvedLongitude !== prevPreResolvedLng.current;
    prevPreResolvedLat.current = preResolvedLatitude;
    prevPreResolvedLng.current = preResolvedLongitude;

    if ((latChanged || lngChanged) && preResolvedLatitude != null && preResolvedLongitude != null) {
      setIsLocationConfirmed(false);
      setRequiresConfirmation(false);
      if (onConfirmationStatusChange) onConfirmationStatusChange(false);
      // Auto-fill neighborhood from the geocoded address
      performReverseGeocode(preResolvedLatitude, preResolvedLongitude);
    }
  }, [preResolvedLatitude, preResolvedLongitude, hideFindOnMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-geocode when both cross streets are selected and the combined string changes.
  // Mirrors how full-address mode auto-drops a pin when a Google Place is selected.
  useEffect(() => {
    if (hideFindOnMap) return; // full-address mode uses preResolved coords instead
    if (!crossStreetAFeature || !crossStreetBFeature) return;

    const changed = crossStreets !== prevCrossStreets.current;
    prevCrossStreets.current = crossStreets;
    if (!changed || !crossStreets.trim()) return;

    setIsGeocoding(true);
    setGeocodeError(null);
    setGeocodeSuccess(null);
    setIsLocationConfirmed(false);
    if (onConfirmationStatusChange) onConfirmationStatusChange(false);
    if (onGeocodeStatusChange) onGeocodeStatusChange(null, null);

    geocodeCrossStreets({ crossStreets: crossStreets.trim(), neighborhood: neighborhood?.trim() })
      .then(result => {
        if (result.success && result.coordinates) {
          const { latitude: lat, longitude: lng } = result.coordinates;
          setIsLocationSet(true);
          onLocationChange(lat, lng);
          if (map.current) map.current.flyTo({ center: [lng, lat], zoom: 16, duration: 1000 });

          const correctionMessage = formatCorrectionMessage(result);
          if (correctionMessage) {
            setGeocodeSuccess(correctionMessage);
            if (onGeocodeStatusChange) onGeocodeStatusChange(null, correctionMessage);
          }

          if (result.neighborhood && onNeighborhoodChange) {
            onNeighborhoodChange(result.neighborhood);
          } else {
            performReverseGeocode(lat, lng);
          }
        } else {
          const errorMsg = "No intersection found — these streets may not cross in this area. Try a nearby block or check the street names.";
          setGeocodeError(errorMsg);
          if (onGeocodeStatusChange) onGeocodeStatusChange(errorMsg, null);
        }
      })
      .catch(() => {
        const errorMsg = "Failed to find location. Please try again.";
        setGeocodeError(errorMsg);
        if (onGeocodeStatusChange) onGeocodeStatusChange(errorMsg, null);
      })
      .finally(() => setIsGeocoding(false));
  }, [crossStreets, crossStreetAFeature, crossStreetBFeature]); // eslint-disable-line react-hooks/exhaustive-deps

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
    } else {
      // Coordinates were cleared externally (e.g. address field was cleared)
      setIsLocationSet(false);
      setIsLocationConfirmed(false);
    }
  }, [latitude, longitude, mapLoaded]);

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
          {/* ── Geocoding spinner (cross-streets auto-geocoding in progress) ── */}
          {isGeocoding && (
            <span className="inline-flex items-center px-4 py-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Finding location…
            </span>
          )}

          {/* ── Confirm button — shown after geocoding, before user confirms ── */}
          {isLocationSet && !isLocationConfirmed && !isGeocoding && (
            <button
              type="button"
              onClick={handleDirectConfirm}
              disabled={disabled}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="w-4 h-4 mr-2" />
              Confirm Location
            </button>
          )}

          {/* ── Confirmed badge ── */}
          {isLocationSet && isLocationConfirmed && !isGeocoding && (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md">
              <Check className="w-4 h-4" />
              Location Confirmed
            </span>
          )}

          {/* ── Set Pin Manually + Clear — shown whenever a location is set ── */}
          {isLocationSet && !isGeocoding && (
            <>
              <button
                type="button"
                onClick={handleOpenModalManually}
                disabled={disabled}
                className="inline-flex items-center px-4 py-2 border border-[#273140] text-[#273140] text-sm font-medium rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <MapPin className="w-4 h-4 mr-2" />
                Set Pin Manually
              </button>

              <button
                type="button"
                onClick={handleClearLocation}
                disabled={disabled}
                className="inline-flex items-center px-3 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Clear
              </button>
            </>
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
          <MapPin className="w-4 h-4 flex-shrink-0 text-gray-400" />
          {isGeocoding ? (
            <span className="text-gray-500">Locating intersection…</span>
          ) : isLocationSet ? (
            <span className={isLocationConfirmed ? "text-gray-600" : "text-amber-700"}>
              {isReverseGeocoding
                ? "Detecting neighborhood…"
                : isLocationConfirmed
                ? "Location confirmed. Use 'Set Pin Manually' to reposition if needed."
                : "Pin placed — confirm the location or use 'Set Pin Manually' if it landed in the wrong spot."}
            </span>
          ) : (
            <span className="text-gray-500">
              {hideFindOnMap
                ? "Enter your address above to drop a pin on the map."
                : "Select both cross streets above to automatically drop a pin on the map."}
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
