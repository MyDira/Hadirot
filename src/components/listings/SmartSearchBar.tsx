import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, MapPin, Building2, Navigation } from "lucide-react";
import { parseSearchQuery, ParsedSearchQuery } from "../../utils/searchQueryParser";
import { searchLocations, LocationResult } from "../../services/locationSearch";

interface SmartSearchBarProps {
  onSearch: (parsed: ParsedSearchQuery, location: LocationResult | null) => void;
  onClear: () => void;
  placeholder?: string;
  initialValue?: string;
  className?: string;
}

export function SmartSearchBar({
  onSearch,
  onClear,
  placeholder = "Search by location, beds, price...",
  initialValue = "",
  className = "",
}: SmartSearchBarProps) {
  const [inputValue, setInputValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<LocationResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{ key: string; label: string }[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    try {
      const parsed = parseSearchQuery(query);
      const locationQuery = parsed.locationQuery || query;

      const results = await searchLocations(locationQuery);
      setSuggestions(results.slice(0, 6));
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (inputValue.length >= 2) {
      debounceRef.current = setTimeout(() => {
        fetchSuggestions(inputValue);
      }, 200);
    } else {
      setSuggestions([]);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [inputValue, fetchSuggestions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updateActiveFilters = (parsed: ParsedSearchQuery, location: LocationResult | null) => {
    const filters: { key: string; label: string }[] = [];

    if (location) {
      filters.push({ key: "location", label: location.name });
    }

    if (parsed.bedrooms !== undefined) {
      filters.push({
        key: "bedrooms",
        label: parsed.bedrooms === 0 ? "Studio" : `${parsed.bedrooms} Bed`,
      });
    }

    if (parsed.bathrooms !== undefined) {
      filters.push({ key: "bathrooms", label: `${parsed.bathrooms} Bath` });
    }

    if (parsed.minPrice && parsed.maxPrice) {
      filters.push({
        key: "price",
        label: `$${(parsed.minPrice / 1000).toFixed(0)}K - $${(parsed.maxPrice / 1000).toFixed(0)}K`,
      });
    } else if (parsed.maxPrice) {
      filters.push({
        key: "price",
        label: `Under $${(parsed.maxPrice / 1000).toFixed(0)}K`,
      });
    } else if (parsed.minPrice) {
      filters.push({
        key: "price",
        label: `$${(parsed.minPrice / 1000).toFixed(0)}K+`,
      });
    }

    if (parsed.propertyType) {
      const typeLabels: Record<string, string> = {
        apartment_building: "Apartment",
        full_house: "House",
        condo: "Condo",
        duplex: "Duplex",
        basement: "Basement",
        single_family: "Single-Family",
        two_family: "Two-Family",
        four_family: "Multi-Family",
        co_op: "Co-op",
      };
      filters.push({
        key: "propertyType",
        label: typeLabels[parsed.propertyType] || parsed.propertyType,
      });
    }

    setActiveFilters(filters);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setShowSuggestions(true);
    setHighlightedIndex(-1);
    setSelectedLocation(null);
  };

  const handleSelectSuggestion = (location: LocationResult) => {
    setSelectedLocation(location);
    setInputValue(location.name);
    setShowSuggestions(false);
    setHighlightedIndex(-1);

    const parsed = parseSearchQuery(inputValue);
    parsed.locationQuery = location.name;
    updateActiveFilters(parsed, location);
    onSearch(parsed, location);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const parsed = parseSearchQuery(inputValue);

    if (!selectedLocation && suggestions.length > 0) {
      const topSuggestion = suggestions[0];
      setSelectedLocation(topSuggestion);
      updateActiveFilters(parsed, topSuggestion);
      onSearch(parsed, topSuggestion);
    } else {
      updateActiveFilters(parsed, selectedLocation);
      onSearch(parsed, selectedLocation);
    }

    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === "Enter") {
        handleSubmit();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0) {
          handleSelectSuggestion(suggestions[highlightedIndex]);
        } else {
          handleSubmit();
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleClear = () => {
    setInputValue("");
    setSuggestions([]);
    setActiveFilters([]);
    setSelectedLocation(null);
    setShowSuggestions(false);
    inputRef.current?.focus();
    onClear();
  };

  const removeFilter = (key: string) => {
    if (key === "location") {
      setSelectedLocation(null);
      setInputValue("");
    }
    setActiveFilters((prev) => prev.filter((f) => f.key !== key));

    const parsed = parseSearchQuery(inputValue);
    if (key === "bedrooms") parsed.bedrooms = undefined;
    if (key === "bathrooms") parsed.bathrooms = undefined;
    if (key === "price") {
      parsed.minPrice = undefined;
      parsed.maxPrice = undefined;
    }
    if (key === "propertyType") parsed.propertyType = undefined;

    const newLocation = key === "location" ? null : selectedLocation;
    onSearch(parsed, newLocation);
  };

  const getTypeIcon = (type: LocationResult["type"]) => {
    switch (type) {
      case "zip":
        return <Navigation className="w-4 h-4 text-gray-400" />;
      case "neighborhood":
        return <MapPin className="w-4 h-4 text-brand-600" />;
      case "borough":
        return <Building2 className="w-4 h-4 text-brand-700" />;
      default:
        return <MapPin className="w-4 h-4 text-gray-400" />;
    }
  };

  const getTypeLabel = (type: LocationResult["type"]) => {
    switch (type) {
      case "zip":
        return "ZIP Code";
      case "neighborhood":
        return "Neighborhood";
      case "borough":
        return "Borough";
      default:
        return "";
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => inputValue.length >= 2 && setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full pl-4 pr-20 py-2.5 bg-white border border-gray-300 rounded-lg text-sm
                     focus:ring-2 focus:ring-brand-500 focus:border-brand-500
                     placeholder-gray-400 transition-all"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {(inputValue || activeFilters.length > 0) && (
              <button
                type="button"
                onClick={handleClear}
                className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <Search className="w-5 h-5 text-gray-400" />
          </div>
        </div>
      </form>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl
                       border border-gray-200 z-50 overflow-hidden animate-fade-in">
          <div className="py-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                onClick={() => handleSelectSuggestion(suggestion)}
                className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors
                          ${highlightedIndex === index ? "bg-brand-50" : "hover:bg-gray-50"}`}
              >
                <div className="flex-shrink-0">
                  {getTypeIcon(suggestion.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {suggestion.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {getTypeLabel(suggestion.type)}
                    {suggestion.zipCodes && suggestion.zipCodes.length > 0 && (
                      <span className="ml-1">
                        ({suggestion.zipCodes.slice(0, 2).join(", ")}
                        {suggestion.zipCodes.length > 2 && "..."})
                      </span>
                    )}
                  </div>
                </div>
                {suggestion.matchScore >= 90 && (
                  <span className="flex-shrink-0 text-xs text-brand-600 font-medium">
                    Best match
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Tip: Try "Williamsburg 2 bed under 3k" for smart search
            </p>
          </div>
        </div>
      )}

      {isSearching && inputValue.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl
                       border border-gray-200 z-50 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
            <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
            Searching...
          </div>
        </div>
      )}

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {activeFilters.map((filter) => (
            <span
              key={filter.key}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-100
                       text-brand-800 rounded-full text-sm font-medium"
            >
              {filter.label}
              <button
                onClick={() => removeFilter(filter.key)}
                className="hover:bg-brand-200 rounded-full p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
