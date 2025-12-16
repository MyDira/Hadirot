import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, X, SlidersHorizontal } from "lucide-react";
import { listingsService } from "../../services/listings";
import { MoreFiltersModal } from "./MoreFiltersModal";

export type SortOption =
  | "newest"
  | "oldest"
  | "price_asc"
  | "price_desc"
  | "bedrooms_asc"
  | "bedrooms_desc"
  | "bathrooms_asc"
  | "bathrooms_desc";

interface FilterState {
  bedrooms?: number[];
  poster_type?: string;
  agency_name?: string;
  property_type?: string;
  property_types?: string[];
  building_types?: string[];
  min_price?: number;
  max_price?: number;
  parking_included?: boolean;
  no_fee_only?: boolean;
  neighborhoods?: string[];
  sort?: SortOption;
}

interface ListingFiltersHorizontalProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  agencies?: string[];
  allNeighborhoods?: string[];
  isMobile?: boolean;
  listingType?: "rental" | "sale";
}

interface FilterDropdownProps {
  label: string;
  value: string;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function FilterDropdown({
  label,
  value,
  isActive,
  isOpen,
  onToggle,
  children,
}: FilterDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all border ${
          isActive
            ? "bg-green-50 text-green-700 border-green-300"
            : isOpen
            ? "bg-gray-100 text-gray-900 border-gray-300"
            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400"
        }`}
      >
        <span className="whitespace-nowrap">{value || label}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 z-50 min-w-[280px] animate-fade-in overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}

const BEDROOM_OPTIONS = [
  { value: -1, label: "Any" },
  { value: 0, label: "Studio" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4+" },
];

const BATH_OPTIONS = [
  { value: -1, label: "Any" },
  { value: 1, label: "1+" },
  { value: 2, label: "2+" },
  { value: 3, label: "3+" },
];

const RENTAL_PRICE_PRESETS = [
  { label: "No Min", value: undefined },
  { label: "$1,500", value: 1500 },
  { label: "$2,000", value: 2000 },
  { label: "$2,500", value: 2500 },
  { label: "$3,000", value: 3000 },
  { label: "$3,500", value: 3500 },
  { label: "$4,000", value: 4000 },
  { label: "$5,000", value: 5000 },
];

const SALE_PRICE_PRESETS = [
  { label: "No Min", value: undefined },
  { label: "$500K", value: 500000 },
  { label: "$750K", value: 750000 },
  { label: "$1M", value: 1000000 },
  { label: "$1.5M", value: 1500000 },
  { label: "$2M", value: 2000000 },
  { label: "$3M", value: 3000000 },
];

export function ListingFiltersHorizontal({
  filters,
  onFiltersChange,
  agencies = [],
  allNeighborhoods = [],
  isMobile = false,
  listingType = "rental",
}: ListingFiltersHorizontalProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [bedroomOptions, setBedroomOptions] = useState<
    { bedrooms: number; count: number; label: string }[]
  >([]);
  const [loadingBedrooms, setLoadingBedrooms] = useState(false);
  const [tempPriceMin, setTempPriceMin] = useState<string>("");
  const [tempPriceMax, setTempPriceMax] = useState<string>("");
  const [tempBedMin, setTempBedMin] = useState<number>(-1);
  const [tempBathMin, setTempBathMin] = useState<number>(-1);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const pricePresets =
    listingType === "sale" ? SALE_PRICE_PRESETS : RENTAL_PRICE_PRESETS;

  useEffect(() => {
    const loadBedroomOptions = async () => {
      setLoadingBedrooms(true);
      try {
        const { bedrooms: currentBedrooms, ...otherFilters } = filters;
        const { no_fee_only, ...restFilters } = otherFilters;
        const serviceFilters = { ...restFilters, noFeeOnly: no_fee_only };

        const counts = await listingsService.getAvailableBedroomCounts(
          serviceFilters
        );

        const options = counts.map(({ bedrooms, count }) => {
          let label = "";
          if (bedrooms === 0) {
            label = "Studio";
          } else if (bedrooms >= 8) {
            label = `${bedrooms}+ BR`;
          } else {
            label = `${bedrooms} BR`;
          }
          return { bedrooms, count, label };
        });

        setBedroomOptions(options);
      } catch (error) {
        console.error("Error loading bedroom options:", error);
        setBedroomOptions([]);
      } finally {
        setLoadingBedrooms(false);
      }
    };

    loadBedroomOptions();
  }, [
    filters.property_type,
    filters.min_price,
    filters.max_price,
    filters.parking_included,
    filters.no_fee_only,
    filters.neighborhoods,
    filters.poster_type,
    filters.agency_name,
  ]);

  useEffect(() => {
    setTempPriceMin(filters.min_price?.toString() || "");
    setTempPriceMax(filters.max_price?.toString() || "");
  }, [filters.min_price, filters.max_price]);

  useEffect(() => {
    if (filters.bedrooms && filters.bedrooms.length > 0) {
      const min = Math.min(...filters.bedrooms);
      setTempBedMin(min);
    } else {
      setTempBedMin(-1);
    }
  }, [filters.bedrooms]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
    };

    if (openDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [openDropdown]);

  const toggleDropdown = (name: string) => {
    setOpenDropdown(openDropdown === name ? null : name);
  };

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const clearFilters = () => {
    onFiltersChange({});
    setTempPriceMin("");
    setTempPriceMax("");
    setTempBedMin(-1);
    setTempBathMin(-1);
  };

  const handlePriceApply = () => {
    const min = tempPriceMin ? parseInt(tempPriceMin) : undefined;
    const max = tempPriceMax ? parseInt(tempPriceMax) : undefined;
    onFiltersChange({
      ...filters,
      min_price: min,
      max_price: max,
    });
    setOpenDropdown(null);
  };

  const handleBedsApply = () => {
    if (tempBedMin === -1) {
      handleFilterChange("bedrooms", undefined);
    } else if (tempBedMin >= 4) {
      handleFilterChange("bedrooms", [4, 5, 6, 7, 8, 9, 10]);
    } else {
      handleFilterChange("bedrooms", [tempBedMin]);
    }
    setOpenDropdown(null);
  };

  const getBedroomsLabel = () => {
    if (!filters.bedrooms || filters.bedrooms.length === 0) return "Beds & Baths";
    if (filters.bedrooms.length === 1) {
      const bed = filters.bedrooms[0];
      if (bed === 0) return "Studio";
      return `${bed} Bed${bed > 1 ? "s" : ""}`;
    }
    if (filters.bedrooms.includes(4)) return "4+ Beds";
    return `${filters.bedrooms.length} Selected`;
  };

  const getPriceLabel = () => {
    const formatPrice = (price: number) => {
      if (listingType === "sale") {
        if (price >= 1000000) return `$${(price / 1000000).toFixed(1)}M`;
        return `$${(price / 1000).toFixed(0)}K`;
      }
      return `$${price.toLocaleString()}`;
    };

    if (filters.min_price && filters.max_price) {
      return `${formatPrice(filters.min_price)} - ${formatPrice(filters.max_price)}`;
    }
    if (filters.min_price) {
      return `${formatPrice(filters.min_price)}+`;
    }
    if (filters.max_price) {
      return `Up to ${formatPrice(filters.max_price)}`;
    }
    return listingType === "sale" ? "Price" : "Rent Range";
  };

  const hasActiveFilters = !!(
    (filters.bedrooms && filters.bedrooms.length > 0) ||
    filters.poster_type ||
    filters.property_type ||
    filters.property_types?.length ||
    filters.building_types?.length ||
    filters.min_price ||
    filters.max_price ||
    filters.parking_included ||
    filters.no_fee_only ||
    (filters.neighborhoods && filters.neighborhoods.length > 0)
  );

  const hasOtherActiveFilters = !!(
    filters.property_type ||
    filters.property_types?.length ||
    filters.building_types?.length ||
    (filters.neighborhoods && filters.neighborhoods.length > 0) ||
    filters.poster_type ||
    filters.parking_included ||
    filters.no_fee_only
  );

  if (isMobile) {
    return (
      <div className="space-y-8">
        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">Beds</h3>
          <div className="flex border border-gray-200 rounded-xl overflow-hidden">
            {BEDROOM_OPTIONS.map((option) => {
              const isSelected =
                option.value === -1
                  ? !filters.bedrooms || filters.bedrooms.length === 0
                  : option.value === 4
                  ? filters.bedrooms?.includes(4)
                  : filters.bedrooms?.includes(option.value);
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    if (option.value === -1) {
                      handleFilterChange("bedrooms", undefined);
                    } else if (option.value >= 4) {
                      handleFilterChange("bedrooms", [4, 5, 6, 7, 8, 9, 10]);
                    } else {
                      handleFilterChange("bedrooms", [option.value]);
                    }
                  }}
                  className={`flex-1 py-3 text-sm font-medium transition-colors border-r border-gray-200 last:border-r-0 ${
                    isSelected
                      ? "bg-green-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            select two tiles for min / max range
          </p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">Baths</h3>
          <div className="flex border border-gray-200 rounded-xl overflow-hidden">
            {BATH_OPTIONS.map((option) => {
              const isSelected = option.value === tempBathMin;
              return (
                <button
                  key={option.value}
                  onClick={() => setTempBathMin(option.value)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors border-r border-gray-200 last:border-r-0 ${
                    isSelected
                      ? "bg-green-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            {listingType === "sale" ? "Price Range" : "Rent Range"}
          </h3>
          <div className="flex gap-3 items-center mb-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Min."
                value={tempPriceMin}
                onChange={(e) => setTempPriceMin(e.target.value.replace(/\D/g, ""))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <span className="text-gray-400">-</span>
            <div className="flex-1">
              <input
                type="text"
                placeholder="Max."
                value={tempPriceMax}
                onChange={(e) => setTempPriceMax(e.target.value.replace(/\D/g, ""))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {pricePresets.map((preset) => {
              const isSelected =
                preset.value === undefined
                  ? !filters.min_price
                  : filters.min_price === preset.value;
              return (
                <button
                  key={preset.label}
                  onClick={() => {
                    setTempPriceMin(preset.value?.toString() || "");
                    handleFilterChange("min_price", preset.value);
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    isSelected
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Neighborhoods
          </h3>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl">
            {allNeighborhoods.map((neighborhood) => {
              const isSelected =
                filters.neighborhoods?.includes(neighborhood) || false;
              return (
                <label
                  key={neighborhood}
                  className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      const current = filters.neighborhoods || [];
                      const newNeighborhoods = isSelected
                        ? current.filter((n) => n !== neighborhood)
                        : [...current, neighborhood];
                      handleFilterChange(
                        "neighborhoods",
                        newNeighborhoods.length > 0 ? newNeighborhoods : undefined
                      );
                    }}
                    className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <span className="ml-3 text-sm text-gray-700">{neighborhood}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Listed By
          </h3>
          <select
            value={
              filters.poster_type === "owner"
                ? "owner"
                : filters.poster_type === "agent"
                ? filters.agency_name
                  ? `agent:${filters.agency_name}`
                  : "agent:any"
                : ""
            }
            onChange={(e) => {
              const value = e.target.value;
              if (value === "owner") {
                onFiltersChange({
                  ...filters,
                  poster_type: "owner",
                  agency_name: undefined,
                });
              } else if (value === "agent:any") {
                onFiltersChange({
                  ...filters,
                  poster_type: "agent",
                  agency_name: undefined,
                });
              } else if (value.startsWith("agent:")) {
                onFiltersChange({
                  ...filters,
                  poster_type: "agent",
                  agency_name: value.slice("agent:".length),
                });
              } else {
                onFiltersChange({
                  ...filters,
                  poster_type: undefined,
                  agency_name: undefined,
                });
              }
            }}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
          >
            <option value="">All Posters</option>
            <option value="owner">By Owner</option>
            <option value="agent:any">By Agency</option>
            {agencies.length > 0 &&
              agencies.map((agency) => (
                <option key={agency} value={`agent:${agency}`}>
                  {agency}
                </option>
              ))}
          </select>
        </div>

        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            More Options
          </h3>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() =>
                handleFilterChange("parking_included", !filters.parking_included)
              }
              className={`px-5 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                filters.parking_included
                  ? "border-green-600 bg-green-50 text-green-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              Parking
            </button>
            {listingType === "rental" && (
              <button
                onClick={() =>
                  handleFilterChange("no_fee_only", !filters.no_fee_only)
                }
                className={`px-5 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                  filters.no_fee_only
                    ? "border-green-600 bg-green-50 text-green-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                No Fee
              </button>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">Sort By</h3>
          <select
            value={filters.sort || "newest"}
            onChange={(e) => handleFilterChange("sort", e.target.value || undefined)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="bedrooms_asc">Bedrooms: Low to High</option>
            <option value="bedrooms_desc">Bedrooms: High to Low</option>
          </select>
        </div>

        <div className="pt-4 border-t border-gray-200 flex items-center gap-4">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-green-600 hover:text-green-700 font-medium text-sm"
            >
              Clear
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={() => onFiltersChange(filters)}
            className="px-8 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div className="flex items-center gap-2 flex-wrap">
        <FilterDropdown
          label={listingType === "sale" ? "Price" : "Rent Range"}
          value={getPriceLabel()}
          isActive={!!(filters.min_price || filters.max_price)}
          isOpen={openDropdown === "price"}
          onToggle={() => toggleDropdown("price")}
        >
          <div className="p-5">
            <div className="text-base font-semibold text-gray-900 mb-4">
              {listingType === "sale" ? "Price Range" : "Rent Range"}
            </div>
            <div className="flex gap-3 items-center mb-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Min."
                  value={tempPriceMin}
                  onChange={(e) =>
                    setTempPriceMin(e.target.value.replace(/\D/g, ""))
                  }
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <span className="text-gray-400">-</span>
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Max."
                  value={tempPriceMax}
                  onChange={(e) =>
                    setTempPriceMax(e.target.value.replace(/\D/g, ""))
                  }
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {pricePresets.map((preset) => {
                const isSelected =
                  preset.value === undefined
                    ? !tempPriceMin
                    : parseInt(tempPriceMin) === preset.value;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setTempPriceMin(preset.value?.toString() || "");
                    }}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      isSelected
                        ? "bg-green-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setTempPriceMin("");
                  setTempPriceMax("");
                }}
                className="text-green-600 hover:text-green-700 font-medium text-sm"
              >
                Clear
              </button>
              <div className="flex-1" />
              <button
                onClick={handlePriceApply}
                className="px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </FilterDropdown>

        <FilterDropdown
          label="Beds & Baths"
          value={getBedroomsLabel()}
          isActive={!!filters.bedrooms && filters.bedrooms.length > 0}
          isOpen={openDropdown === "bedrooms"}
          onToggle={() => toggleDropdown("bedrooms")}
        >
          <div className="p-5 min-w-[320px]">
            <div className="text-base font-semibold text-gray-900 mb-4">Beds</div>
            <div className="flex border border-gray-200 rounded-xl overflow-hidden mb-2">
              {BEDROOM_OPTIONS.map((option) => {
                const isSelected =
                  option.value === -1
                    ? tempBedMin === -1
                    : option.value === 4
                    ? tempBedMin >= 4
                    : tempBedMin === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTempBedMin(option.value)}
                    className={`flex-1 py-3 text-sm font-medium transition-colors border-r border-gray-200 last:border-r-0 min-w-[52px] ${
                      isSelected
                        ? "bg-green-600 text-white"
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mb-6">
              select two tiles for min / max range
            </p>

            <div className="text-base font-semibold text-gray-900 mb-4">Baths</div>
            <div className="flex border border-gray-200 rounded-xl overflow-hidden">
              {BATH_OPTIONS.map((option) => {
                const isSelected = tempBathMin === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTempBathMin(option.value)}
                    className={`flex-1 py-3 text-sm font-medium transition-colors border-r border-gray-200 last:border-r-0 ${
                      isSelected
                        ? "bg-green-600 text-white"
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 pt-5 mt-5 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setTempBedMin(-1);
                  setTempBathMin(-1);
                }}
                className="text-green-600 hover:text-green-700 font-medium text-sm"
              >
                Clear
              </button>
              <div className="flex-1" />
              <button
                onClick={handleBedsApply}
                className="px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </FilterDropdown>

        <button
          onClick={() => setShowMoreFilters(true)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all border ${
            hasOtherActiveFilters
              ? "bg-green-50 text-green-700 border-green-300"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Filters</span>
          {hasOtherActiveFilters && (
            <span className="flex h-2 w-2 rounded-full bg-green-600"></span>
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
            Clear All
          </button>
        )}
      </div>

      <MoreFiltersModal
        isOpen={showMoreFilters}
        onClose={() => setShowMoreFilters(false)}
        filters={filters}
        onFiltersChange={onFiltersChange}
        agencies={agencies}
        allNeighborhoods={allNeighborhoods}
        listingType={listingType}
      />
    </div>
  );
}
