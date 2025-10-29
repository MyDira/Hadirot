import React from "react";
import { Filter, ArrowUpDown } from "lucide-react";
import { listingsService } from "../../services/listings";

export type SortOption = 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'bedrooms_asc' | 'bedrooms_desc' | 'bathrooms_asc' | 'bathrooms_desc';

interface FilterState {
  bedrooms?: number[];
  poster_type?: string;
  agency_name?: string;
  property_type?: string;
  min_price?: number;
  max_price?: number;
  parking_included?: boolean;
  no_fee_only?: boolean;
  neighborhoods?: string[];
  sort?: SortOption;
}

interface ListingFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  agencies?: string[];
  allNeighborhoods?: string[];
  isMobile?: boolean;
}

export function ListingFilters({
  filters,
  onFiltersChange,
  agencies = [],
  allNeighborhoods = [],
  isMobile = false,
}: ListingFiltersProps) {
  const [showNeighborhoodDropdown, setShowNeighborhoodDropdown] =
    React.useState(false);
  const [showBedroomDropdown, setShowBedroomDropdown] = React.useState(false);
  const [neighborhoodOptions, setNeighborhoodOptions] = React.useState<string[]>(
    allNeighborhoods,
  );
  const [bedroomOptions, setBedroomOptions] = React.useState<{ bedrooms: number; count: number; label: string }[]>([]);
  const [loadingBedrooms, setLoadingBedrooms] = React.useState(false);

  React.useEffect(() => {
    const loadNeighborhoods = async () => {
      const neighborhoods = await listingsService.getActiveNeighborhoods();
      setNeighborhoodOptions(neighborhoods);
    };
    loadNeighborhoods();
  }, []);

  // Load available bedroom options based on current filters
  React.useEffect(() => {
    const loadBedroomOptions = async () => {
      setLoadingBedrooms(true);
      try {
        const { bedrooms: currentBedrooms, ...otherFilters } = filters;
        const { no_fee_only, ...restFilters } = otherFilters;
        const serviceFilters = { ...restFilters, noFeeOnly: no_fee_only };

        const counts = await listingsService.getAvailableBedroomCounts(serviceFilters);

        const options = counts.map(({ bedrooms, count }) => {
          let label = '';
          if (bedrooms === 0) {
            label = 'Studio';
          } else if (bedrooms >= 4) {
            label = `${bedrooms}+ BR`;
          } else {
            label = `${bedrooms} BR`;
          }
          return { bedrooms, count, label };
        });

        setBedroomOptions(options);
      } catch (error) {
        console.error('Error loading bedroom options:', error);
        setBedroomOptions([]);
      } finally {
        setLoadingBedrooms(false);
      }
    };

    loadBedroomOptions();
  }, [filters.property_type, filters.min_price, filters.max_price, filters.parking_included, filters.no_fee_only, filters.neighborhoods, filters.poster_type, filters.agency_name]);

  // Debug: Log when filters prop changes
  React.useEffect(() => {
    console.log('🎛️ ListingFilters: Received filters prop:', filters);
  }, [filters]);

  // Close dropdowns when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest(".dropdown-container")) {
        setShowNeighborhoodDropdown(false);
        setShowBedroomDropdown(false);
      }
    };

    if (showNeighborhoodDropdown || showBedroomDropdown) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showNeighborhoodDropdown, showBedroomDropdown]);

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    const newFilters = {
      ...filters,
      [key]: value,
    };
    
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  const onWhoChange = (value: string) => {
    if (value === 'owner') {
      onFiltersChange({ ...filters, poster_type: 'owner', agency_name: undefined });
    } else if (value === 'agent:any') {
      onFiltersChange({ ...filters, poster_type: 'agent', agency_name: undefined });
    } else if (value.startsWith('agent:')) {
      onFiltersChange({
        ...filters,
        poster_type: 'agent',
        agency_name: value.slice('agent:'.length),
      });
    } else {
      onFiltersChange({ ...filters, poster_type: undefined, agency_name: undefined });
    }
  };

  return (
    <div
      className={`bg-white p-4 rounded-lg shadow-sm border border-gray-200 ${!isMobile ? "mb-6" : ""}`}
    >
      <div className="flex items-center mb-4">
        <Filter className="w-5 h-5 text-[#273140] mr-2" />
        <h3 className="text-lg font-semibold text-[#273140]">Filters</h3>
        <button
          onClick={clearFilters}
          className="ml-auto text-sm text-gray-500 hover:text-[#273140] transition-colors"
        >
          Clear All
        </button>
      </div>

      <div
        className={`grid gap-4 ${
          isMobile
            ? "grid-cols-1"
            : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-8"
        }`}
      >
        {/* Bedrooms - Multi-select */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Bedrooms
          </label>
          <div className="relative dropdown-container">
            <div
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus-within:ring-[#273140] focus-within:border-[#273140] h-10 cursor-pointer bg-white flex items-center justify-between"
              onClick={() => setShowBedroomDropdown(!showBedroomDropdown)}
            >
              <span className="text-sm text-gray-700 truncate">
                {loadingBedrooms
                  ? "Loading..."
                  : filters.bedrooms && filters.bedrooms.length > 0
                    ? `${filters.bedrooms.length} selected`
                    : "Select bedrooms..."}
              </span>
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>

            {showBedroomDropdown && bedroomOptions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {bedroomOptions.map((option) => {
                  const isSelected = filters.bedrooms?.includes(option.bedrooms) || false;
                  return (
                    <div
                      key={option.bedrooms}
                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentBedrooms = filters.bedrooms || [];
                        let newBedrooms;

                        if (isSelected) {
                          newBedrooms = currentBedrooms.filter((b) => b !== option.bedrooms);
                        } else {
                          newBedrooms = [...currentBedrooms, option.bedrooms];
                        }

                        handleFilterChange(
                          "bedrooms",
                          newBedrooms.length > 0 ? newBedrooms : undefined
                        );
                      }}
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="mr-2 h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                        />
                        <span className="text-sm">{option.label}</span>
                      </div>
                      <span className="text-xs text-gray-500">({option.count})</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Who is Listing */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Who is Listing?
          </label>
          <select
            value={
              filters.poster_type === 'owner'
                ? 'owner'
                : filters.poster_type === 'agent'
                  ? filters.agency_name
                    ? `agent:${filters.agency_name}`
                    : 'agent:any'
                  : ''
            }
            onChange={(e) => onWhoChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
          >
            <option value="">All Posters</option>
            <option value="owner">All Landlords</option>
            <option value="agent:any">All Agencies</option>
            {agencies.length > 0 && (
              <optgroup label="Specific Agencies">
                {agencies.map((agency) => (
                  <option key={agency} value={`agent:${agency}`}>
                    {agency}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* Neighborhoods */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Neighborhoods
          </label>
          {neighborhoodOptions.length > 0 ? (
            <div className="relative">
              <div
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus-within:ring-[#273140] focus-within:border-[#273140] h-10 cursor-pointer bg-white flex items-center justify-between"
                onClick={() =>
                  setShowNeighborhoodDropdown(!showNeighborhoodDropdown)
                }
              >
                <span className="text-sm text-gray-700 truncate">
                  {filters.neighborhoods && filters.neighborhoods.length > 0
                    ? `${filters.neighborhoods.length} selected`
                    : "Select neighborhoods..."}
                </span>
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>

              {showNeighborhoodDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {neighborhoodOptions.map((neighborhood) => (
                    <div
                      key={neighborhood}
                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentNeighborhoods = filters.neighborhoods || [];
                        const isSelected =
                          currentNeighborhoods.includes(neighborhood);

                        let newNeighborhoods;
                        if (isSelected) {
                          newNeighborhoods = currentNeighborhoods.filter(
                            (n) => n !== neighborhood,
                          );
                        } else {
                          newNeighborhoods = [
                            ...currentNeighborhoods,
                            neighborhood,
                          ];
                        }

                        handleFilterChange(
                          "neighborhoods",
                          newNeighborhoods.length > 0
                            ? newNeighborhoods
                            : undefined,
                        );
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={
                          filters.neighborhoods?.includes(neighborhood) || false
                        }
                        onChange={() => {}} // Handled by parent div onClick
                        className="mr-2 h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                      />
                      <span className="text-sm">{neighborhood}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <select
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
            >
              <option>No neighborhoods available</option>
            </select>
          )}
        </div>

        {/* Property Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rental Type
          </label>
          <select
            value={filters.property_type || ""}
            onChange={(e) =>
              handleFilterChange("property_type", e.target.value)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
          >
            <option value="">All Types</option>
            <option value="apartment_building">Apartment in Building</option>
            <option value="apartment_house">Apartment in House</option>
            <option value="duplex">Duplex</option>
            <option value="full_house">Full House</option>
          </select>
        </div>

        {/* Min Price */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Min Price
          </label>
          <input
            type="number"
            placeholder="$"
            value={filters.min_price || ""}
            onChange={(e) =>
              handleFilterChange(
                "min_price",
                parseInt(e.target.value) || undefined,
              )
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
          />
        </div>

        {/* Max Price */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Max Price
          </label>
          <input
            type="number"
            placeholder="$"
            value={filters.max_price || ""}
            onChange={(e) =>
              handleFilterChange(
                "max_price",
                parseInt(e.target.value) || undefined,
              )
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
          />
        </div>

        {/* Sort */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <ArrowUpDown className="w-4 h-4 inline mr-1" />
            Sort By
          </label>
          <select
            value={filters.sort || "newest"}
            onChange={(e) =>
              handleFilterChange("sort", e.target.value || undefined)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
          >
            <option value="newest">Newest to Oldest</option>
            <option value="oldest">Oldest to Newest</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="bedrooms_asc">Bedrooms: Low to High</option>
            <option value="bedrooms_desc">Bedrooms: High to Low</option>
            <option value="bathrooms_asc">Bathrooms: Low to High</option>
            <option value="bathrooms_desc">Bathrooms: High to Low</option>
          </select>
        </div>

        {/* Parking Included & No Fee */}
        <div className="flex flex-col space-y-2 justify-end">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              id="parking_included"
              checked={filters.parking_included || false}
              onChange={(e) =>
                handleFilterChange("parking_included", e.target.checked)
              }
              className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
            />
            <span className="text-sm font-medium text-gray-700">
              Parking Included
            </span>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              id="no_fee_only"
              checked={filters.no_fee_only || false}
              onChange={(e) =>
                handleFilterChange("no_fee_only", e.target.checked)
              }
              className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
            />
            <span className="text-sm font-medium text-gray-700">
              No Broker Fee only
            </span>
          </label>
        </div>
      </div>

      {/* Apply Filters Button for Mobile */}
      {isMobile && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={() => onFiltersChange(filters)}
            className="w-full bg-[#273140] text-white py-3 px-4 rounded-md font-semibold hover:bg-[#1e252f] transition-colors"
          >
            Apply Filters
          </button>
        </div>
      )}

      {/* Selected filter tags - displayed horizontally below filters */}
      {((filters.bedrooms && filters.bedrooms.length > 0) || (filters.neighborhoods && filters.neighborhoods.length > 0)) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Bedroom tags */}
          {filters.bedrooms && filters.bedrooms.length > 0 && filters.bedrooms.map((bedrooms) => {
            const option = bedroomOptions.find(opt => opt.bedrooms === bedrooms);
            const label = option?.label || `${bedrooms} BR`;
            return (
              <span
                key={`bedroom-${bedrooms}`}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[#273140] text-white"
              >
                {label}
                <button
                  type="button"
                  onClick={() => {
                    const newBedrooms = filters.bedrooms?.filter((b) => b !== bedrooms);
                    handleFilterChange(
                      "bedrooms",
                      newBedrooms?.length ? newBedrooms : undefined
                    );
                  }}
                  className="ml-2 hover:bg-[#1e252f] rounded-full p-0.5"
                >
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </span>
            );
          })}

          {/* Neighborhood tags */}
          {filters.neighborhoods && filters.neighborhoods.length > 0 && filters.neighborhoods.map((neighborhood) => (
            <span
              key={neighborhood}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[#667B9A] text-white"
            >
              {neighborhood}
              <button
                type="button"
                onClick={() => {
                  const newNeighborhoods = filters.neighborhoods?.filter(
                    (n) => n !== neighborhood,
                  );
                  handleFilterChange(
                    "neighborhoods",
                    newNeighborhoods?.length ? newNeighborhoods : undefined,
                  );
                }}
                className="ml-2 hover:bg-[#5a6b85] rounded-full p-0.5"
              >
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
