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

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

type ListingTypeFilter = 'all' | 'residential' | 'commercial';

interface FilterState {
  bedrooms?: number[];
  min_bathrooms?: number;
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
  lease_terms?: string[];
  sort?: SortOption;
  searchBounds?: MapBounds | null;
  searchLocationName?: string;
  listingTypeFilter?: ListingTypeFilter;
  commercial_space_types?: string[];
  min_sf?: number;
  max_sf?: number;
  commercial_lease_types?: string[];
  commercial_conditions?: string[];
  building_classes?: string[];
}

interface ListingFiltersHorizontalProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onSearchClear?: () => void;
  agencies?: string[];
  allNeighborhoods?: string[];
  availableLeaseTerms?: string[];
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

// Minimum price preset options for rental
const RENTAL_MIN_PRICE_OPTIONS = [
  { label: "No Min", value: undefined },
  { label: "$1,000", value: 1000 },
  { label: "$1,500", value: 1500 },
  { label: "$2,000", value: 2000 },
  { label: "$2,500", value: 2500 },
  { label: "$3,000", value: 3000 },
  { label: "$3,500", value: 3500 },
  { label: "$4,000", value: 4000 },
];

const RENTAL_PRICE_PRESETS = [
  { label: "$1,000-$1,500", minValue: 1000, maxValue: 1500 },
  { label: "$1,500-$2,000", minValue: 1500, maxValue: 2000 },
  { label: "$2,000-$2,500", minValue: 2000, maxValue: 2500 },
  { label: "$2,500-$3,000", minValue: 2500, maxValue: 3000 },
  { label: "$3,000-$3,500", minValue: 3000, maxValue: 3500 },
  { label: "$3,500-$4,000", minValue: 3500, maxValue: 4000 },
  { label: "$4,000-$4,500", minValue: 4000, maxValue: 4500 },
  { label: "$4,500-$5,000", minValue: 4500, maxValue: 5000 },
];

// Minimum price preset options for sale listings
const SALE_MIN_PRICE_OPTIONS = [
  { label: "No Min", value: undefined },
  { label: "$500K", value: 500000 },
  { label: "$750K", value: 750000 },
  { label: "$1M", value: 1000000 },
  { label: "$1.5M", value: 1500000 },
  { label: "$2M", value: 2000000 },
  { label: "$3M", value: 3000000 },
];

// Maximum price preset options for sale listings
const SALE_MAX_PRICE_OPTIONS = [
  { label: "$750K", value: 750000 },
  { label: "$1M", value: 1000000 },
  { label: "$1.5M", value: 1500000 },
  { label: "$2M", value: 2000000 },
  { label: "$3M", value: 3000000 },
  { label: "$5M", value: 5000000 },
  { label: "$10M+", value: 10000000 },
];

const LEASE_TERM_LABELS: Record<string, string> = {
  long_term_annual: "Long Term / Annual",
  short_term: "Short Term",
  summer_rental: "Summer Rental",
  winter_rental: "Winter Rental",
};

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "bedrooms_asc", label: "Bedrooms: Low to High" },
  { value: "bedrooms_desc", label: "Bedrooms: High to Low" },
];

const COMMERCIAL_SPACE_TYPES = [
  { value: "retail", label: "Retail" },
  { value: "restaurant", label: "Restaurant" },
  { value: "office", label: "Office" },
  { value: "warehouse", label: "Warehouse" },
  { value: "industrial", label: "Industrial" },
  { value: "mixed_use", label: "Mixed Use" },
  { value: "community", label: "Community" },
  { value: "basement_commercial", label: "Basement Commercial" },
];

const COMMERCIAL_SF_PRESETS = [
  { label: "Under 500 SF", min: undefined, max: 500 },
  { label: "500–1,000 SF", min: 500, max: 1000 },
  { label: "1,000–2,500 SF", min: 1000, max: 2500 },
  { label: "2,500–5,000 SF", min: 2500, max: 5000 },
  { label: "5,000+ SF", min: 5000, max: undefined },
];

export function ListingFiltersHorizontal({
  filters,
  onFiltersChange,
  onSearchClear,
  agencies = [],
  allNeighborhoods = [],
  availableLeaseTerms = [],
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
  const [tempBedrooms, setTempBedrooms] = useState<number[]>([]);
  const [tempBathMin, setTempBathMin] = useState<number>(-1);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [priceInputFocus, setPriceInputFocus] = useState<'min' | 'max' | null>(null);
  const [tempSfMin, setTempSfMin] = useState<string>("");
  const [tempSfMax, setTempSfMax] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const minInputRef = useRef<HTMLInputElement>(null);
  const maxInputRef = useRef<HTMLInputElement>(null);

  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

  useEffect(() => {
    if (isMobile) {
      setLocalFilters(filters);
    }
  }, [filters, isMobile]);

  // Generate maximum price options based on current minimum
  const generateMaxPriceOptions = () => {
    if (listingType === "sale") {
      // For sales, filter max options that are greater than current minimum
      const minValue = tempPriceMin ? parseInt(tempPriceMin) : 0;
      return SALE_MAX_PRICE_OPTIONS.filter(option => option.value > minValue);
    }

    // For rentals, generate dynamic maximum options
    const minValue = tempPriceMin ? parseInt(tempPriceMin) : 0;
    const startValue = minValue > 0 ? Math.ceil((minValue + 500) / 500) * 500 : 1000;
    const maxOptions = [];

    // Generate options in $500 increments, starting from first value above minimum
    for (let i = 0; i < 16; i++) { // Generate 16 options
      const value = startValue + (i * 500);
      maxOptions.push({
        label: `$${value.toLocaleString()}`,
        value: value,
      });
    }

    return maxOptions;
  };

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
    setTempSfMin(filters.min_sf?.toString() || "");
    setTempSfMax(filters.max_sf?.toString() || "");
  }, [filters.min_sf, filters.max_sf]);

  // Set default focus based on listing type
  useEffect(() => {
    if (isMobile && !priceInputFocus) {
      setPriceInputFocus('min');
    }
  }, [isMobile, listingType]);

  useEffect(() => {
    if (filters.bedrooms && filters.bedrooms.length > 0) {
      setTempBedrooms(filters.bedrooms);
    } else {
      setTempBedrooms([]);
    }
  }, [filters.bedrooms]);

  useEffect(() => {
    if (filters.min_bathrooms && filters.min_bathrooms > 0) {
      setTempBathMin(filters.min_bathrooms);
    } else {
      setTempBathMin(-1);
    }
  }, [filters.min_bathrooms]);

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
    onSearchClear?.();
    setTempPriceMin("");
    setTempPriceMax("");
    setTempBedrooms([]);
    setTempBathMin(-1);
    setPriceInputFocus(null);
    setTempSfMin("");
    setTempSfMax("");
  };

  const removeFilter = (filterKey: keyof FilterState) => {
    const newFilters = { ...filters };
    delete newFilters[filterKey];
    onFiltersChange(newFilters);
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
    setPriceInputFocus(null);
  };

  const handleBedsApply = () => {
    const newFilters = { ...filters };

    if (tempBedrooms.length === 0) {
      delete newFilters.bedrooms;
    } else {
      const hasFourPlus = tempBedrooms.includes(4);
      if (hasFourPlus) {
        const otherBeds = tempBedrooms.filter(b => b < 4);
        const fourPlusBeds = [4, 5, 6, 7, 8, 9, 10];
        newFilters.bedrooms = [...otherBeds, ...fourPlusBeds];
      } else {
        newFilters.bedrooms = tempBedrooms;
      }
    }

    if (tempBathMin > 0) {
      newFilters.min_bathrooms = tempBathMin;
    } else {
      delete newFilters.min_bathrooms;
    }

    onFiltersChange(newFilters);
    setOpenDropdown(null);
  };

  const getBedroomsLabel = () => {
    const hasBeds = filters.bedrooms && filters.bedrooms.length > 0;
    const hasBaths = filters.min_bathrooms && filters.min_bathrooms > 0;

    if (!hasBeds && !hasBaths) return "Beds & Baths";

    let bedsLabel = "";
    if (hasBeds) {
      const uniqueBeds = Array.from(new Set(filters.bedrooms!.filter(b => b < 4)));
      const hasFourPlus = filters.bedrooms!.includes(4);

      if (uniqueBeds.length === 0 && hasFourPlus) {
        bedsLabel = "4+ Beds";
      } else if (uniqueBeds.length === 1 && !hasFourPlus) {
        const bed = uniqueBeds[0];
        bedsLabel = bed === 0 ? "Studio" : `${bed} Bed${bed > 1 ? "s" : ""}`;
      } else {
        const allSelected = [...uniqueBeds];
        if (hasFourPlus) allSelected.push(4);
        allSelected.sort((a, b) => a - b);

        if (allSelected.length <= 3) {
          bedsLabel = allSelected.map(b => b === 0 ? "Studio" : b === 4 ? "4+" : b).join(", ") + " Beds";
        } else {
          bedsLabel = `${allSelected.length} Beds`;
        }
      }
    }

    let bathsLabel = "";
    if (hasBaths) {
      bathsLabel = `${filters.min_bathrooms}+ Baths`;
    }

    if (bedsLabel && bathsLabel) {
      return `${bedsLabel}, ${bathsLabel}`;
    }
    return bedsLabel || bathsLabel;
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
    (filters.min_bathrooms && filters.min_bathrooms > 0) ||
    filters.poster_type ||
    filters.property_type ||
    filters.property_types?.length ||
    filters.building_types?.length ||
    filters.min_price ||
    filters.max_price ||
    filters.parking_included ||
    filters.no_fee_only ||
    (filters.neighborhoods && filters.neighborhoods.length > 0) ||
    filters.lease_terms?.length ||
    filters.searchBounds ||
    filters.commercial_space_types?.length ||
    filters.min_sf ||
    filters.max_sf ||
    filters.commercial_lease_types?.length ||
    filters.commercial_conditions?.length ||
    filters.building_classes?.length
  );

  const hasSearchAreaFilter = !!filters.searchBounds;

  const hasOtherActiveFilters = !!(
    filters.property_type ||
    filters.property_types?.length ||
    filters.building_types?.length ||
    (filters.neighborhoods && filters.neighborhoods.length > 0) ||
    filters.lease_terms?.length ||
    filters.poster_type ||
    filters.parking_included ||
    filters.no_fee_only ||
    filters.commercial_lease_types?.length ||
    filters.commercial_conditions?.length ||
    filters.building_classes?.length
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
                  ? !localFilters.bedrooms || localFilters.bedrooms.length === 0
                  : option.value === 4
                  ? localFilters.bedrooms?.includes(4)
                  : localFilters.bedrooms?.includes(option.value);
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    if (option.value === -1) {
                      setLocalFilters(prev => ({ ...prev, bedrooms: undefined }));
                    } else if (option.value >= 4) {
                      setLocalFilters(prev => ({ ...prev, bedrooms: [4, 5, 6, 7, 8, 9, 10] }));
                    } else {
                      setLocalFilters(prev => ({ ...prev, bedrooms: [option.value] }));
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
              const isSelected =
                option.value === -1
                  ? !localFilters.min_bathrooms || localFilters.min_bathrooms <= 0
                  : localFilters.min_bathrooms === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    if (option.value === -1) {
                      setLocalFilters(prev => ({ ...prev, min_bathrooms: undefined }));
                    } else {
                      setLocalFilters(prev => ({ ...prev, min_bathrooms: option.value }));
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
                onFocus={() => setPriceInputFocus('min')}
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  priceInputFocus === 'min' ? 'border-green-500 ring-2 ring-green-500' : 'border-gray-200'
                }`}
              />
            </div>
            <span className="text-gray-400">-</span>
            <div className="flex-1">
              <input
                type="text"
                placeholder="Max."
                value={tempPriceMax}
                onChange={(e) => setTempPriceMax(e.target.value.replace(/\D/g, ""))}
                onFocus={() => setPriceInputFocus('max')}
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  priceInputFocus === 'max' ? 'border-green-500 ring-2 ring-green-500' : 'border-gray-200'
                }`}
              />
            </div>
          </div>

          {/* Show minimum options when min input is focused */}
          {priceInputFocus === 'min' && (
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-3">Select Minimum</div>
              <div className="flex flex-wrap gap-2">
                {(listingType === "sale" ? SALE_MIN_PRICE_OPTIONS : RENTAL_MIN_PRICE_OPTIONS).map((option) => {
                  const isSelected = option.value === undefined
                    ? !tempPriceMin
                    : parseInt(tempPriceMin) === option.value;
                  return (
                    <button
                      key={option.label}
                      onClick={() => {
                        if (option.value === undefined) {
                          setTempPriceMin("");
                          setLocalFilters(prev => ({ ...prev, min_price: undefined }));
                        } else {
                          setTempPriceMin(option.value.toString());
                          setLocalFilters(prev => ({ ...prev, min_price: option.value }));
                        }
                        setPriceInputFocus('max');
                        if (listingType === "sale") {
                          setTimeout(() => maxInputRef.current?.focus(), 150);
                        }
                      }}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                        isSelected
                          ? "bg-green-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Show maximum options when max input is focused */}
          {priceInputFocus === 'max' && (
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-3">Select Maximum</div>
              <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                {generateMaxPriceOptions().map((option) => {
                  const isSelected = parseInt(tempPriceMax) === option.value;
                  return (
                    <button
                      key={option.label}
                      onClick={() => {
                        setTempPriceMax(option.value.toString());
                        setLocalFilters(prev => ({ ...prev, max_price: option.value }));
                      }}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                        isSelected
                          ? "bg-green-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Show preset ranges only for rentals when no input is focused */}
          {listingType === "rental" && !priceInputFocus && (
            <div className="flex flex-wrap gap-2">
              {RENTAL_PRICE_PRESETS.map((preset) => {
                const isSelected = localFilters.min_price === preset.minValue && localFilters.max_price === preset.maxValue;
                return (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setTempPriceMin(preset.minValue.toString());
                      setTempPriceMax(preset.maxValue.toString());
                      setLocalFilters(prev => ({
                        ...prev,
                        min_price: preset.minValue,
                        max_price: preset.maxValue,
                      }));
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
          )}
        </div>

        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Neighborhoods
          </h3>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl">
            {allNeighborhoods.map((neighborhood) => {
              const isSelected =
                localFilters.neighborhoods?.includes(neighborhood) || false;
              return (
                <label
                  key={neighborhood}
                  className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      const current = localFilters.neighborhoods || [];
                      const newNeighborhoods = isSelected
                        ? current.filter((n) => n !== neighborhood)
                        : [...current, neighborhood];
                      setLocalFilters(prev => ({
                        ...prev,
                        neighborhoods: newNeighborhoods.length > 0 ? newNeighborhoods : undefined,
                      }));
                    }}
                    className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <span className="ml-3 text-sm text-gray-700">{neighborhood}</span>
                </label>
              );
            })}
          </div>
        </div>

        {listingType === "rental" && availableLeaseTerms.length > 0 && (
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Lease Length
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Long Term / Annual excludes short-term and seasonal rentals
            </p>
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl">
              {availableLeaseTerms.map((term) => {
                const isSelected =
                  localFilters.lease_terms?.includes(term) || false;
                return (
                  <label
                    key={term}
                    className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        const current = localFilters.lease_terms || [];
                        const newLeaseTerms = isSelected
                          ? current.filter((t) => t !== term)
                          : [...current, term];
                        setLocalFilters(prev => ({
                          ...prev,
                          lease_terms: newLeaseTerms.length > 0 ? newLeaseTerms : undefined,
                        }));
                      }}
                      className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                    />
                    <span className="ml-3 text-sm text-gray-700">
                      {LEASE_TERM_LABELS[term] || term}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Listed By
          </h3>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl">
            <label className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
              <input
                type="radio"
                checked={!localFilters.poster_type}
                onChange={() => {
                  setLocalFilters(prev => ({
                    ...prev,
                    poster_type: undefined,
                    agency_name: undefined,
                  }));
                }}
                className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300"
              />
              <span className="ml-3 text-sm text-gray-700">All Posters</span>
            </label>
            <label className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
              <input
                type="radio"
                checked={localFilters.poster_type === "owner"}
                onChange={() => {
                  setLocalFilters(prev => ({
                    ...prev,
                    poster_type: "owner",
                    agency_name: undefined,
                  }));
                }}
                className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300"
              />
              <span className="ml-3 text-sm text-gray-700">By Owner</span>
            </label>
            <label className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
              <input
                type="radio"
                checked={localFilters.poster_type === "agent" && !localFilters.agency_name}
                onChange={() => {
                  setLocalFilters(prev => ({
                    ...prev,
                    poster_type: "agent",
                    agency_name: undefined,
                  }));
                }}
                className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300"
              />
              <span className="ml-3 text-sm text-gray-700">By Agency (All)</span>
            </label>
            {agencies.length > 0 &&
              agencies.map((agency) => (
                <label
                  key={agency}
                  className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                >
                  <input
                    type="radio"
                    checked={
                      localFilters.poster_type === "agent" &&
                      localFilters.agency_name === agency
                    }
                    onChange={() => {
                      setLocalFilters(prev => ({
                        ...prev,
                        poster_type: "agent",
                        agency_name: agency,
                      }));
                    }}
                    className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300"
                  />
                  <span className="ml-3 text-sm text-gray-700">{agency}</span>
                </label>
              ))}
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            More Options
          </h3>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() =>
                setLocalFilters(prev => ({
                  ...prev,
                  parking_included: !prev.parking_included,
                }))
              }
              className={`px-5 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                localFilters.parking_included
                  ? "border-green-600 bg-green-50 text-green-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              Parking
            </button>
            {listingType === "rental" && (
              <button
                onClick={() =>
                  setLocalFilters(prev => ({
                    ...prev,
                    no_fee_only: !prev.no_fee_only,
                  }))
                }
                className={`px-5 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                  localFilters.no_fee_only
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
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl">
            {SORT_OPTIONS.map((option) => {
              const isSelected = (localFilters.sort || "newest") === option.value;
              return (
                <label
                  key={option.value}
                  className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                >
                  <input
                    type="radio"
                    checked={isSelected}
                    onChange={() => setLocalFilters(prev => ({ ...prev, sort: option.value as SortOption }))}
                    className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300"
                  />
                  <span className="ml-3 text-sm text-gray-700">{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200 flex items-center gap-3">
          {(() => {
            const hasActiveLocalFilters = !!(
              (localFilters.bedrooms && localFilters.bedrooms.length > 0) ||
              (localFilters.min_bathrooms && localFilters.min_bathrooms > 0) ||
              localFilters.poster_type ||
              localFilters.property_type ||
              localFilters.property_types?.length ||
              localFilters.building_types?.length ||
              localFilters.min_price ||
              localFilters.max_price ||
              localFilters.parking_included ||
              localFilters.no_fee_only ||
              (localFilters.neighborhoods && localFilters.neighborhoods.length > 0) ||
              localFilters.lease_terms?.length ||
              localFilters.searchBounds
            );
            return hasActiveLocalFilters ? (
              <button
                onClick={() => {
                  setLocalFilters({});
                  setTempPriceMin("");
                  setTempPriceMax("");
                  setPriceInputFocus(null);
                }}
                className="flex items-center gap-2 px-5 py-3 bg-green-50 text-green-700 rounded-xl font-medium border border-green-300 hover:bg-green-100 transition-all"
              >
                <X className="w-4 h-4" />
                Clear All Filters
              </button>
            ) : null;
          })()}
          <div className="flex-1" />
          <button
            onClick={() => {
              const finalFilters = {
                ...localFilters,
                min_price: tempPriceMin ? parseInt(tempPriceMin) : undefined,
                max_price: tempPriceMax ? parseInt(tempPriceMax) : undefined,
              };
              onFiltersChange(finalFilters);
            }}
            className="px-8 py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  const listingTypeFilterValue = filters.listingTypeFilter || 'all';
  const showResidentialFilters = listingTypeFilterValue !== 'commercial';

  const getListingTypeLabel = () => {
    if (listingTypeFilterValue === 'residential') return 'Residential';
    if (listingTypeFilterValue === 'commercial') return 'Commercial';
    return 'Listing Type';
  };

  return (
    <div ref={containerRef}>
      <div className="flex items-center gap-2 flex-wrap">
        <FilterDropdown
          label="Listing Type"
          value={getListingTypeLabel()}
          isActive={listingTypeFilterValue !== 'all'}
          isOpen={openDropdown === "listing_type"}
          onToggle={() => toggleDropdown("listing_type")}
        >
          <div className="p-3 min-w-[200px]">
            {(['all', 'residential', 'commercial'] as const).map((opt) => {
              const labels = { all: 'All', residential: 'Residential Only', commercial: 'Commercial Only' };
              const isSelected = listingTypeFilterValue === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onFiltersChange({ ...filters, listingTypeFilter: opt === 'all' ? undefined : opt });
                    setOpenDropdown(null);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    isSelected
                      ? 'bg-green-50 text-green-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {labels[opt]}
                </button>
              );
            })}
          </div>
        </FilterDropdown>

        <FilterDropdown
          label={listingType === "sale" ? "Price" : "Rent Range"}
          value={getPriceLabel()}
          isActive={!!(filters.min_price || filters.max_price)}
          isOpen={openDropdown === "price"}
          onToggle={() => {
            const willBeOpen = openDropdown !== "price";
            toggleDropdown("price");
            if (willBeOpen) {
              // Default to showing minimum options when opening
              setPriceInputFocus('min');
            } else {
              // Reset focus when closing
              setPriceInputFocus(null);
            }
          }}
        >
          <div className="p-5">
            <div className="text-base font-semibold text-gray-900 mb-4">
              {listingType === "sale" ? "Price Range" : "Rent Range"}
            </div>
            <div className="flex gap-3 items-center mb-4">
              <div className="flex-1 relative">
                <input
                  ref={minInputRef}
                  type="text"
                  placeholder="Min."
                  value={tempPriceMin}
                  onChange={(e) => {
                    setTempPriceMin(e.target.value.replace(/\D/g, ""));
                  }}
                  onFocus={() => setPriceInputFocus('min')}
                  className={`w-full px-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                    priceInputFocus === 'min' ? 'border-green-500 ring-2 ring-green-500' : 'border-gray-200'
                  }`}
                />
              </div>
              <span className="text-gray-400">-</span>
              <div className="flex-1 relative">
                <input
                  ref={maxInputRef}
                  type="text"
                  placeholder="Max."
                  value={tempPriceMax}
                  onChange={(e) => {
                    setTempPriceMax(e.target.value.replace(/\D/g, ""));
                  }}
                  onFocus={() => setPriceInputFocus('max')}
                  className={`w-full px-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                    priceInputFocus === 'max' ? 'border-green-500 ring-2 ring-green-500' : 'border-gray-200'
                  }`}
                />
              </div>
            </div>

            {/* Dynamic option display based on focused input */}
            {priceInputFocus === 'min' && (
              <div className="mb-4">
                <div className="text-sm font-medium text-gray-700 mb-3">Select Minimum</div>
                <div className="flex flex-wrap gap-2">
                  {(listingType === "sale" ? SALE_MIN_PRICE_OPTIONS : RENTAL_MIN_PRICE_OPTIONS).map((option) => {
                    const isSelected = option.value === undefined
                      ? !tempPriceMin
                      : parseInt(tempPriceMin) === option.value;
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => {
                          if (option.value === undefined) {
                            setTempPriceMin("");
                          } else {
                            setTempPriceMin(option.value.toString());
                          }
                          // Automatically switch to maximum input after selection
                          setTimeout(() => {
                            setPriceInputFocus('max');
                            maxInputRef.current?.focus();
                          }, 150);
                        }}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                          isSelected
                            ? "bg-green-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {priceInputFocus === 'max' && (
              <div className="mb-4">
                <div className="text-sm font-medium text-gray-700 mb-3">Select Maximum</div>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {generateMaxPriceOptions().map((option) => {
                    const isSelected = parseInt(tempPriceMax) === option.value;
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => {
                          setTempPriceMax(option.value.toString());
                        }}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                          isSelected
                            ? "bg-green-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Show preset ranges only for rentals when no input is focused */}
            {listingType === "rental" && !priceInputFocus && (
              <div className="flex flex-wrap gap-2 mb-4">
                {RENTAL_PRICE_PRESETS.map((preset) => {
                  const isSelected = parseInt(tempPriceMin) === preset.minValue && parseInt(tempPriceMax) === preset.maxValue;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setTempPriceMin(preset.minValue.toString());
                        setTempPriceMax(preset.maxValue.toString());
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
            )}

            <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setTempPriceMin("");
                  setTempPriceMax("");
                  setPriceInputFocus(null);
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

        {listingTypeFilterValue === 'commercial' && (
          <FilterDropdown
            label="Space Type"
            value={
              filters.commercial_space_types && filters.commercial_space_types.length > 0
                ? filters.commercial_space_types.length === 1
                  ? (COMMERCIAL_SPACE_TYPES.find(t => t.value === filters.commercial_space_types![0])?.label || filters.commercial_space_types[0])
                  : `${filters.commercial_space_types.length} Types`
                : "Space Type"
            }
            isActive={!!(filters.commercial_space_types && filters.commercial_space_types.length > 0)}
            isOpen={openDropdown === "space_type"}
            onToggle={() => toggleDropdown("space_type")}
          >
            <div className="p-5 min-w-[260px]">
              <div className="text-base font-semibold text-gray-900 mb-4">Space Type</div>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {COMMERCIAL_SPACE_TYPES.map((type) => {
                  const isSelected = filters.commercial_space_types?.includes(type.value) || false;
                  return (
                    <label
                      key={type.value}
                      className="flex items-center px-2 py-2 hover:bg-gray-50 cursor-pointer rounded-lg"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const current = filters.commercial_space_types || [];
                          const updated = isSelected
                            ? current.filter(v => v !== type.value)
                            : [...current, type.value];
                          onFiltersChange({ ...filters, commercial_space_types: updated.length > 0 ? updated : undefined });
                        }}
                        className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                      />
                      <span className="ml-3 text-sm text-gray-700">{type.label}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 pt-4 mt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    onFiltersChange({ ...filters, commercial_space_types: undefined });
                    setOpenDropdown(null);
                  }}
                  className="text-green-600 hover:text-green-700 font-medium text-sm"
                >
                  Clear
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setOpenDropdown(null)}
                  className="px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </FilterDropdown>
        )}

        {listingTypeFilterValue === 'commercial' && (
          <FilterDropdown
            label="Size (SF)"
            value={
              filters.min_sf && filters.max_sf
                ? `${filters.min_sf.toLocaleString()}–${filters.max_sf.toLocaleString()} SF`
                : filters.min_sf
                ? `${filters.min_sf.toLocaleString()}+ SF`
                : filters.max_sf
                ? `Up to ${filters.max_sf.toLocaleString()} SF`
                : "Size (SF)"
            }
            isActive={!!(filters.min_sf || filters.max_sf)}
            isOpen={openDropdown === "sf_range"}
            onToggle={() => toggleDropdown("sf_range")}
          >
            <div className="p-5 min-w-[280px]">
              <div className="text-base font-semibold text-gray-900 mb-4">Size Range (SF)</div>
              <div className="flex gap-3 items-center mb-4">
                <input
                  type="text"
                  placeholder="Min SF"
                  value={tempSfMin}
                  onChange={(e) => setTempSfMin(e.target.value.replace(/\D/g, ""))}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
                <span className="text-gray-400">–</span>
                <input
                  type="text"
                  placeholder="Max SF"
                  value={tempSfMax}
                  onChange={(e) => setTempSfMax(e.target.value.replace(/\D/g, ""))}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {COMMERCIAL_SF_PRESETS.map((preset) => {
                  const isSelected = filters.min_sf === preset.min && filters.max_sf === preset.max;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setTempSfMin(preset.min?.toString() || "");
                        setTempSfMax(preset.max?.toString() || "");
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        isSelected ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
                    setTempSfMin("");
                    setTempSfMax("");
                  }}
                  className="text-green-600 hover:text-green-700 font-medium text-sm"
                >
                  Clear
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => {
                    onFiltersChange({
                      ...filters,
                      min_sf: tempSfMin ? parseInt(tempSfMin) : undefined,
                      max_sf: tempSfMax ? parseInt(tempSfMax) : undefined,
                    });
                    setOpenDropdown(null);
                  }}
                  className="px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </FilterDropdown>
        )}

        {showResidentialFilters && <FilterDropdown
          label="Beds & Baths"
          value={getBedroomsLabel()}
          isActive={!!(filters.bedrooms && filters.bedrooms.length > 0) || !!(filters.min_bathrooms && filters.min_bathrooms > 0)}
          isOpen={openDropdown === "bedrooms"}
          onToggle={() => toggleDropdown("bedrooms")}
        >
          <div className="p-5 min-w-[320px]">
            <div className="text-base font-semibold text-gray-900 mb-4">Beds</div>
            <div className="flex border border-gray-200 rounded-xl overflow-hidden mb-2">
              {BEDROOM_OPTIONS.map((option) => {
                const isSelected =
                  option.value === -1
                    ? tempBedrooms.length === 0
                    : option.value === 4
                    ? tempBedrooms.includes(4) || tempBedrooms.some(b => b >= 4)
                    : tempBedrooms.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      if (option.value === -1) {
                        setTempBedrooms([]);
                      } else {
                        if (isSelected) {
                          // Remove from selection
                          if (option.value === 4) {
                            setTempBedrooms(tempBedrooms.filter(b => b < 4));
                          } else {
                            setTempBedrooms(tempBedrooms.filter(b => b !== option.value));
                          }
                        } else {
                          // Add to selection
                          if (option.value === 4) {
                            setTempBedrooms([...tempBedrooms.filter(b => b < 4), 4]);
                          } else {
                            setTempBedrooms([...tempBedrooms, option.value]);
                          }
                        }
                      }
                    }}
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
              Click multiple options to select range
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
                  setTempBedrooms([]);
                  setTempBathMin(-1);
                  const newFilters = { ...filters };
                  delete newFilters.bedrooms;
                  delete newFilters.min_bathrooms;
                  onFiltersChange(newFilters);
                  setOpenDropdown(null);
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
        </FilterDropdown>}

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
            className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all border bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
          >
            <X className="w-4 h-4" />
            Clear All Filters
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
        availableLeaseTerms={availableLeaseTerms}
        listingType={listingType}
        listingTypeFilter={listingTypeFilterValue}
      />
    </div>
  );
}
