import React, { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";
import { GOOGLE_MAPS_API_KEY } from "@/config/env";

export interface GoogleStreetFeature {
  placeId: string;
  streetName: string;
  formattedName: string;
  /** Coordinates of the street's midpoint — populated after place-details fetch */
  latitude?: number;
  longitude?: number;
  /** Bounding box covering the full length of the street — used to bias the sibling autocomplete */
  viewport?: {
    sw: { lat: number; lng: number };
    ne: { lat: number; lng: number };
  };
}

interface GoogleStreetAutocompleteProps {
  value?: string;
  onSelect: (feature: GoogleStreetFeature | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Bounding box of the sibling street (full length). When set, restrict suggestions
   * to streets whose geometry overlaps this box — narrows Street B to plausible
   * crossings of Street A.
   */
  nearViewport?: {
    sw: { lat: number; lng: number };
    ne: { lat: number; lng: number };
  };
  /** Force the input into an error visual state regardless of internal selection state. */
  invalid?: boolean;
  /** Error message rendered below the input when `invalid` is true. */
  errorMessage?: string | null;
}

declare global {
  interface Window {
    google: typeof google;
    __googleMapsLoading?: Promise<void>;
  }
}

function loadGoogleMapsApi(): Promise<void> {
  if (window.google?.maps?.places) return Promise.resolve();
  if (window.__googleMapsLoading) return window.__googleMapsLoading;

  window.__googleMapsLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps API"));
    document.head.appendChild(script);
  });

  return window.__googleMapsLoading;
}

interface Suggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
}

export function GoogleStreetAutocomplete({
  value = "",
  onSelect,
  placeholder = "Enter street name",
  disabled = false,
  nearViewport,
  invalid = false,
  errorMessage = null,
}: GoogleStreetAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // Seed from `value` on first mount so the input shows as valid (green, no red
  // glow) when the user navigates back to a step where a street was already picked.
  const [selectedFeature, setSelectedFeature] = useState<GoogleStreetFeature | null>(
    value ? { placeId: "external-value", streetName: value, formattedName: value } : null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState(false);

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);

  useEffect(() => {
    loadGoogleMapsApi()
      .then(() => {
        autocompleteService.current = new window.google.maps.places.AutocompleteService();
        setApiReady(true);
      })
      .catch(() => setError("Google Maps failed to load"));
  }, []);

  useEffect(() => {
    if (value !== undefined && value !== inputValue) {
      setInputValue(value);
      if (value) {
        setSelectedFeature({
          placeId: "external-value",
          streetName: value,
          formattedName: value,
        });
      } else {
        // Parent cleared the value (e.g. mode switch or Clear button) — reset.
        setSelectedFeature(null);
      }
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!inputValue.trim() || selectedFeature || !apiReady) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => fetchSuggestions(inputValue), 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [inputValue, selectedFeature, apiReady]);

  function fetchSuggestions(query: string) {
    if (!autocompleteService.current) return;

    setIsLoading(true);
    setError(null);

    // When Street A has been picked, hard-restrict Street B to a box covering
    // Street A's full length (its Places viewport) plus a small pad — so only
    // streets whose geometry plausibly overlaps Street A can appear. This is
    // strictly a narrowing step: the authoritative intersection check happens
    // when the pair is geocoded with result_type=intersection.
    // Without a nearViewport (i.e. Street A itself), just bias toward NYC.
    const PAD = 0.003; // ≈ 300 m pad so cross streets at the very edge still appear
    const locationOptions = nearViewport
      ? {
          bounds: new window.google.maps.LatLngBounds(
            { lat: nearViewport.sw.lat - PAD, lng: nearViewport.sw.lng - PAD },
            { lat: nearViewport.ne.lat + PAD, lng: nearViewport.ne.lng + PAD }
          ),
          strictBounds: true,
        }
      : {
          locationBias: new window.google.maps.LatLngBounds(
            { lat: 40.4774, lng: -74.2591 },
            { lat: 40.9176, lng: -73.7002 }
          ),
        };

    autocompleteService.current.getPlacePredictions(
      {
        input: query,
        types: ["route"],
        componentRestrictions: { country: "us" },
        ...locationOptions,
      },
      (predictions, status) => {
        setIsLoading(false);
        if (
          status === window.google.maps.places.PlacesServiceStatus.OK &&
          predictions
        ) {
          setSuggestions(
            predictions.map((p) => ({
              placeId: p.place_id,
              mainText: p.structured_formatting.main_text,
              secondaryText: p.structured_formatting.secondary_text,
              description: p.description,
            }))
          );
          setShowDropdown(true);
        } else if (
          status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS
        ) {
          setSuggestions([]);
          setShowDropdown(false);
        } else {
          setError("Failed to load suggestions");
          setSuggestions([]);
        }
      }
    );
  }

  /** Fetch the midpoint + viewport for a placeId via the Places Details API. */
  function fetchPlaceGeometry(placeId: string): Promise<{
    lat: number;
    lng: number;
    viewport?: { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } };
  } | null> {
    return new Promise((resolve) => {
      const service = new window.google.maps.places.PlacesService(
        document.createElement("div")
      );
      service.getDetails(
        { placeId, fields: ["geometry"] },
        (result, status) => {
          if (
            status === window.google.maps.places.PlacesServiceStatus.OK &&
            result?.geometry?.location
          ) {
            const vp = result.geometry.viewport;
            resolve({
              lat: result.geometry.location.lat(),
              lng: result.geometry.location.lng(),
              viewport: vp
                ? {
                    sw: { lat: vp.getSouthWest().lat(), lng: vp.getSouthWest().lng() },
                    ne: { lat: vp.getNorthEast().lat(), lng: vp.getNorthEast().lng() },
                  }
                : undefined,
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  async function handleSelectSuggestion(suggestion: Suggestion) {
    // Show the locked/selected state immediately for a snappy UI.
    const tempFeature: GoogleStreetFeature = {
      placeId: suggestion.placeId,
      streetName: suggestion.mainText,
      formattedName: suggestion.description,
    };
    setSelectedFeature(tempFeature);
    setInputValue(suggestion.mainText);
    setSuggestions([]);
    setShowDropdown(false);
    onSelect(tempFeature);

    // Enrich the feature with midpoint + viewport so the sibling autocomplete
    // can restrict its suggestions to streets that overlap this street's full
    // length. This fires a single Places Details call and is transparent to
    // the user.
    const geom = await fetchPlaceGeometry(suggestion.placeId);
    if (geom) {
      const enriched: GoogleStreetFeature = {
        ...tempFeature,
        latitude: geom.lat,
        longitude: geom.lng,
        viewport: geom.viewport,
      };
      setSelectedFeature(enriched);
      onSelect(enriched);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
    setSelectedFeature(null);
    setError(null);
    onSelect(null);
  }

  function handleClear() {
    setInputValue("");
    setSelectedFeature(null);
    setSuggestions([]);
    setShowDropdown(false);
    setError(null);
    onSelect(null);
  }

  const isValid = !!selectedFeature && !invalid;
  const hasInput = inputValue.trim().length > 0;
  const showExternalError = invalid && !!errorMessage;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) setShowDropdown(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full px-3 py-2 pr-10 border rounded-md focus:ring-brand-700 focus:border-brand-700 disabled:opacity-50 disabled:cursor-not-allowed ${
            isValid
              ? "border-green-500 bg-green-50"
              : invalid
              ? "border-red-500 bg-red-50"
              : hasInput && !isLoading
              ? "border-red-500"
              : "border-gray-300"
          }`}
        />

        {!selectedFeature && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            {isLoading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
            {!isLoading && hasInput && <X className="w-4 h-4 text-red-500" />}
          </div>
        )}

        {selectedFeature && (
          <button
            type="button"
            onClick={handleClear}
            className={`absolute inset-y-0 right-0 flex items-center pr-3 ${
              invalid ? "text-red-500 hover:text-red-700" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

      {showExternalError && <p className="text-xs text-red-600 mt-1">{errorMessage}</p>}

      {!isValid && !invalid && hasInput && !isLoading && suggestions.length === 0 && !error && (
        <p className="text-xs text-red-600 mt-1">Please select a street from the dropdown</p>
      )}

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion)}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none border-b border-gray-100 last:border-b-0"
            >
              <div className="text-sm font-medium text-gray-900">{suggestion.mainText}</div>
              <div className="text-xs text-gray-500 truncate">{suggestion.secondaryText}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
