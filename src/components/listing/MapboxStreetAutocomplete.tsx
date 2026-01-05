import React, { useState, useEffect, useRef } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { MAPBOX_ACCESS_TOKEN } from "@/config/env";

const NYC_BOUNDING_BOX = "-74.2591,40.4774,-73.7002,40.9176";
const BROOKLYN_CENTER = "-73.9442,40.6782";

export interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
  text: string;
  place_type: string[];
}

interface MapboxStreetAutocompleteProps {
  value?: string;
  onSelect: (feature: MapboxFeature | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MapboxStreetAutocomplete({
  value = "",
  onSelect,
  placeholder = "Enter street name",
  disabled = false,
}: MapboxStreetAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [selectedFeature, setSelectedFeature] = useState<MapboxFeature | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    if (!inputValue.trim() || selectedFeature) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(inputValue);
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [inputValue, selectedFeature]);

  async function fetchSuggestions(query: string) {
    if (!MAPBOX_ACCESS_TOKEN) {
      setError("Mapbox not configured");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const encodedQuery = encodeURIComponent(query);
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?` +
        `access_token=${MAPBOX_ACCESS_TOKEN}` +
        `&bbox=${NYC_BOUNDING_BOX}` +
        `&proximity=${BROOKLYN_CENTER}` +
        `&types=address` +
        `&country=US` +
        `&limit=5`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch suggestions");
      }

      const data = await response.json();
      setSuggestions(data.features || []);
      setShowDropdown(true);
    } catch (err) {
      console.error("Autocomplete error:", err);
      setError("Failed to load suggestions");
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    setInputValue(newValue);
    setSelectedFeature(null);
    setError(null);
    onSelect(null);
  }

  function handleSelectSuggestion(feature: MapboxFeature) {
    setSelectedFeature(feature);
    setInputValue(feature.text);
    setSuggestions([]);
    setShowDropdown(false);
    onSelect(feature);
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
            if (suggestions.length > 0) {
              setShowDropdown(true);
            }
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
              key={suggestion.id}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion)}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none border-b border-gray-100 last:border-b-0"
            >
              <div className="text-sm font-medium text-gray-900">{suggestion.text}</div>
              <div className="text-xs text-gray-500 truncate">{suggestion.place_name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
