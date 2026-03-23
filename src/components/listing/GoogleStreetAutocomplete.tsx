import React, { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";
import { GOOGLE_MAPS_API_KEY } from "@/config/env";

export interface GoogleStreetFeature {
  placeId: string;
  streetName: string;
  formattedName: string;
}

interface GoogleStreetAutocompleteProps {
  value?: string;
  onSelect: (feature: GoogleStreetFeature | null) => void;
  placeholder?: string;
  disabled?: boolean;
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
}: GoogleStreetAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedFeature, setSelectedFeature] = useState<GoogleStreetFeature | null>(null);
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

    autocompleteService.current.getPlacePredictions(
      {
        input: query,
        types: ["route"],
        componentRestrictions: { country: "us" },
        locationBias: new window.google.maps.LatLngBounds(
          { lat: 40.4774, lng: -74.2591 },
          { lat: 40.9176, lng: -73.7002 }
        ),
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

  function handleSelectSuggestion(suggestion: Suggestion) {
    const feature: GoogleStreetFeature = {
      placeId: suggestion.placeId,
      streetName: suggestion.mainText,
      formattedName: suggestion.description,
    };
    setSelectedFeature(feature);
    setInputValue(suggestion.mainText);
    setSuggestions([]);
    setShowDropdown(false);
    onSelect(feature);
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

  const isValid = !!selectedFeature;
  const hasInput = inputValue.trim().length > 0;

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
              : hasInput && !isLoading
              ? "border-red-500"
              : "border-gray-300"
          }`}
        />

        {!isValid && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            {isLoading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
            {!isLoading && hasInput && <X className="w-4 h-4 text-red-500" />}
          </div>
        )}

        {isValid && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

      {!isValid && hasInput && !isLoading && suggestions.length === 0 && !error && (
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
