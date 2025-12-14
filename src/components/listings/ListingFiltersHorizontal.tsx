import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, X, ArrowUpDown } from "lucide-react";
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

interface ListingFiltersHorizontalProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  agencies?: string[];
  allNeighborhoods?: string[];
  isMobile?: boolean;
  listingType?: 'rental' | 'sale';
}

interface FilterDropdownProps {
  label: string;
  value: string;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function FilterDropdown({ label, value, isActive, isOpen, onToggle, children }: FilterDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
          isActive
            ? 'bg-brand-700 text-white'
            : isOpen
              ? 'bg-gray-200 text-gray-900'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        <span className="whitespace-nowrap">{value || label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 z-50 min-w-[240px] animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

export function ListingFiltersHorizontal({
  filters,
  onFiltersChange,
  agencies = [],
  allNeighborhoods = [],
  isMobile = false,
  listingType = 'rental',
}: ListingFiltersHorizontalProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [bedroomOptions, setBedroomOptions] = useState<{ bedrooms: number; count: number; label: string }[]>([]);
  const [loadingBedrooms, setLoadingBedrooms] = useState(false);
  const [tempPriceMin, setTempPriceMin] = useState<string>('');
  const [tempPriceMax, setTempPriceMax] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
          } else if (bedrooms >= 8) {
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

  useEffect(() => {
    setTempPriceMin(filters.min_price?.toString() || '');
    setTempPriceMax(filters.max_price?.toString() || '');
  }, [filters.min_price, filters.max_price]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };

    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
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
    setTempPriceMin('');
    setTempPriceMax('');
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

  const getBedroomsLabel = () => {
    if (!filters.bedrooms || filters.bedrooms.length === 0) return 'Beds';
    if (filters.bedrooms.length === 1) {
      const bed = filters.bedrooms[0];
      return bed === 0 ? 'Studio' : `${bed} Bed${bed > 1 ? 's' : ''}`;
    }
    return `${filters.bedrooms.length} Selected`;
  };

  const getPriceLabel = () => {
    if (filters.min_price && filters.max_price) {
      return `$${(filters.min_price / 1000).toFixed(0)}K - $${(filters.max_price / 1000).toFixed(0)}K`;
    }
    if (filters.min_price) {
      return `$${(filters.min_price / 1000).toFixed(0)}K+`;
    }
    if (filters.max_price) {
      return `Up to $${(filters.max_price / 1000).toFixed(0)}K`;
    }
    return 'Price';
  };

  const getPropertyTypeLabel = () => {
    if (!filters.property_type) return 'Type';
    const labels: Record<string, string> = {
      apartment_building: 'Apt Building',
      apartment_house: 'Apt in House',
      duplex: 'Duplex',
      full_house: 'Full House',
      basement: 'Basement',
      single_family: 'Single-Family',
      two_family: 'Two-Family',
      three_family: 'Three-Family',
      four_family: 'Four-Family',
      condo: 'Condo',
      co_op: 'Co-op',
    };
    return labels[filters.property_type] || 'Type';
  };

  const getNeighborhoodsLabel = () => {
    if (!filters.neighborhoods || filters.neighborhoods.length === 0) return 'Neighborhoods';
    if (filters.neighborhoods.length === 1) return filters.neighborhoods[0];
    return `${filters.neighborhoods.length} Areas`;
  };

  const getPosterLabel = () => {
    if (!filters.poster_type) return 'Listed By';
    if (filters.poster_type === 'owner') return 'By Owner';
    if (filters.poster_type === 'agent') {
      if (filters.agency_name) return filters.agency_name;
      return 'By Agency';
    }
    return 'Listed By';
  };

  const getSortLabel = () => {
    const labels: Record<string, string> = {
      newest: 'Newest',
      oldest: 'Oldest',
      price_asc: 'Price: Low-High',
      price_desc: 'Price: High-Low',
      bedrooms_asc: 'Beds: Low-High',
      bedrooms_desc: 'Beds: High-Low',
      bathrooms_asc: 'Baths: Low-High',
      bathrooms_desc: 'Baths: High-Low',
    };
    return labels[filters.sort || 'newest'] || 'Sort';
  };

  const hasActiveFilters = !!(
    (filters.bedrooms && filters.bedrooms.length > 0) ||
    filters.poster_type ||
    filters.property_type ||
    filters.min_price ||
    filters.max_price ||
    filters.parking_included ||
    filters.no_fee_only ||
    (filters.neighborhoods && filters.neighborhoods.length > 0)
  );

  const activeFilterTags: { key: string; label: string; onRemove: () => void }[] = [];

  if (filters.bedrooms && filters.bedrooms.length > 0) {
    filters.bedrooms.forEach((bed) => {
      const label = bed === 0 ? 'Studio' : `${bed} BR`;
      activeFilterTags.push({
        key: `bed-${bed}`,
        label,
        onRemove: () => {
          const newBedrooms = filters.bedrooms?.filter(b => b !== bed);
          handleFilterChange('bedrooms', newBedrooms?.length ? newBedrooms : undefined);
        },
      });
    });
  }

  if (filters.neighborhoods && filters.neighborhoods.length > 0) {
    filters.neighborhoods.forEach((n) => {
      activeFilterTags.push({
        key: `neighborhood-${n}`,
        label: n,
        onRemove: () => {
          const newNeighborhoods = filters.neighborhoods?.filter(x => x !== n);
          handleFilterChange('neighborhoods', newNeighborhoods?.length ? newNeighborhoods : undefined);
        },
      });
    });
  }

  if (filters.parking_included) {
    activeFilterTags.push({
      key: 'parking',
      label: 'Parking',
      onRemove: () => handleFilterChange('parking_included', false),
    });
  }

  if (filters.no_fee_only) {
    activeFilterTags.push({
      key: 'no-fee',
      label: 'No Fee',
      onRemove: () => handleFilterChange('no_fee_only', false),
    });
  }

  if (isMobile) {
    return (
      <div className="space-y-6">
        {/* Bedrooms */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Bedrooms</h3>
          <div className="flex flex-wrap gap-2">
            {loadingBedrooms ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : (
              bedroomOptions.map((option) => {
                const isSelected = filters.bedrooms?.includes(option.bedrooms) || false;
                return (
                  <button
                    key={option.bedrooms}
                    onClick={() => {
                      const currentBedrooms = filters.bedrooms || [];
                      const newBedrooms = isSelected
                        ? currentBedrooms.filter(b => b !== option.bedrooms)
                        : [...currentBedrooms, option.bedrooms];
                      handleFilterChange('bedrooms', newBedrooms.length > 0 ? newBedrooms : undefined);
                    }}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-brand-700 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {option.label} ({option.count})
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Price Range */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Price Range</h3>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Min</label>
              <input
                type="number"
                placeholder="$0"
                value={tempPriceMin}
                onChange={(e) => setTempPriceMin(e.target.value)}
                onBlur={handlePriceApply}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Max</label>
              <input
                type="number"
                placeholder="No max"
                value={tempPriceMax}
                onChange={(e) => setTempPriceMax(e.target.value)}
                onBlur={handlePriceApply}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Neighborhoods */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Neighborhoods</h3>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
            {allNeighborhoods.map((neighborhood) => {
              const isSelected = filters.neighborhoods?.includes(neighborhood) || false;
              return (
                <label
                  key={neighborhood}
                  className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      const current = filters.neighborhoods || [];
                      const newNeighborhoods = isSelected
                        ? current.filter(n => n !== neighborhood)
                        : [...current, neighborhood];
                      handleFilterChange('neighborhoods', newNeighborhoods.length > 0 ? newNeighborhoods : undefined);
                    }}
                    className="h-4 w-4 text-brand-700 focus:ring-brand-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">{neighborhood}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Property Type */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Property Type</h3>
          <select
            value={filters.property_type || ''}
            onChange={(e) => handleFilterChange('property_type', e.target.value || undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          >
            <option value="">All Types</option>
            {listingType === 'sale' ? (
              <>
                <option value="single_family">Single-Family</option>
                <option value="two_family">Two-Family</option>
                <option value="three_family">Three-Family</option>
                <option value="four_family">Four-Family</option>
                <option value="condo">Condo</option>
                <option value="co_op">Co-op</option>
              </>
            ) : (
              <>
                <option value="apartment_building">Apartment in Building</option>
                <option value="apartment_house">Apartment in House</option>
                <option value="duplex">Duplex</option>
                <option value="full_house">Full House</option>
                <option value="basement">Basement</option>
              </>
            )}
          </select>
        </div>

        {/* Listed By */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Listed By</h3>
          <select
            value={
              filters.poster_type === 'owner'
                ? 'owner'
                : filters.poster_type === 'agent'
                  ? filters.agency_name ? `agent:${filters.agency_name}` : 'agent:any'
                  : ''
            }
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'owner') {
                onFiltersChange({ ...filters, poster_type: 'owner', agency_name: undefined });
              } else if (value === 'agent:any') {
                onFiltersChange({ ...filters, poster_type: 'agent', agency_name: undefined });
              } else if (value.startsWith('agent:')) {
                onFiltersChange({ ...filters, poster_type: 'agent', agency_name: value.slice('agent:'.length) });
              } else {
                onFiltersChange({ ...filters, poster_type: undefined, agency_name: undefined });
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          >
            <option value="">All Posters</option>
            <option value="owner">By Owner</option>
            <option value="agent:any">By Agency</option>
            {agencies.length > 0 && agencies.map((agency) => (
              <option key={agency} value={`agent:${agency}`}>{agency}</option>
            ))}
          </select>
        </div>

        {/* Quick Filters */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Filters</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleFilterChange('parking_included', !filters.parking_included)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                filters.parking_included
                  ? 'bg-brand-700 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Parking
            </button>
            {listingType === 'rental' && (
              <button
                onClick={() => handleFilterChange('no_fee_only', !filters.no_fee_only)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  filters.no_fee_only
                    ? 'bg-brand-700 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                No Fee
              </button>
            )}
          </div>
        </div>

        {/* Sort */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Sort By</h3>
          <select
            value={filters.sort || 'newest'}
            onChange={(e) => handleFilterChange('sort', e.target.value || undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="bedrooms_asc">Bedrooms: Low to High</option>
            <option value="bedrooms_desc">Bedrooms: High to Low</option>
          </select>
        </div>

        {/* Apply Button */}
        <div className="pt-4 border-t border-gray-200 flex gap-3">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Clear All
            </button>
          )}
          <button
            onClick={() => onFiltersChange(filters)}
            className="flex-1 py-3 px-4 bg-brand-700 text-white rounded-lg font-medium hover:bg-brand-800 transition-colors"
          >
            Show Results
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-3">
      {/* Filter Pills Row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Bedrooms */}
        <FilterDropdown
          label="Beds"
          value={getBedroomsLabel()}
          isActive={!!filters.bedrooms && filters.bedrooms.length > 0}
          isOpen={openDropdown === 'bedrooms'}
          onToggle={() => toggleDropdown('bedrooms')}
        >
          <div className="p-3">
            <div className="text-sm font-semibold text-gray-900 mb-2">Bedrooms</div>
            {loadingBedrooms ? (
              <div className="text-sm text-gray-500 py-2">Loading...</div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {bedroomOptions.map((option) => {
                  const isSelected = filters.bedrooms?.includes(option.bedrooms) || false;
                  return (
                    <label
                      key={option.bedrooms}
                      className="flex items-center justify-between px-2 py-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const currentBedrooms = filters.bedrooms || [];
                            const newBedrooms = isSelected
                              ? currentBedrooms.filter(b => b !== option.bedrooms)
                              : [...currentBedrooms, option.bedrooms];
                            handleFilterChange('bedrooms', newBedrooms.length > 0 ? newBedrooms : undefined);
                          }}
                          className="h-4 w-4 text-brand-700 focus:ring-brand-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">{option.label}</span>
                      </div>
                      <span className="text-xs text-gray-500">({option.count})</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </FilterDropdown>

        {/* Price */}
        <FilterDropdown
          label="Price"
          value={getPriceLabel()}
          isActive={!!(filters.min_price || filters.max_price)}
          isOpen={openDropdown === 'price'}
          onToggle={() => toggleDropdown('price')}
        >
          <div className="p-3 w-64">
            <div className="text-sm font-semibold text-gray-900 mb-3">Price Range</div>
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <input
                  type="number"
                  placeholder="Min"
                  value={tempPriceMin}
                  onChange={(e) => setTempPriceMin(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
              <span className="text-gray-400">-</span>
              <div className="flex-1">
                <input
                  type="number"
                  placeholder="Max"
                  value={tempPriceMax}
                  onChange={(e) => setTempPriceMax(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
            </div>
            <button
              onClick={handlePriceApply}
              className="w-full mt-3 py-2 bg-brand-700 text-white rounded-md text-sm font-medium hover:bg-brand-800 transition-colors"
            >
              Apply
            </button>
          </div>
        </FilterDropdown>

        {/* Property Type */}
        <FilterDropdown
          label="Type"
          value={getPropertyTypeLabel()}
          isActive={!!filters.property_type}
          isOpen={openDropdown === 'type'}
          onToggle={() => toggleDropdown('type')}
        >
          <div className="py-1">
            <button
              onClick={() => {
                handleFilterChange('property_type', undefined);
                setOpenDropdown(null);
              }}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${!filters.property_type ? 'text-brand-700 font-medium' : 'text-gray-700'}`}
            >
              All Types
            </button>
            {listingType === 'sale' ? (
              <>
                {['single_family', 'two_family', 'three_family', 'four_family', 'condo', 'co_op'].map((type) => {
                  const labels: Record<string, string> = {
                    single_family: 'Single-Family',
                    two_family: 'Two-Family',
                    three_family: 'Three-Family',
                    four_family: 'Four-Family',
                    condo: 'Condo',
                    co_op: 'Co-op',
                  };
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        handleFilterChange('property_type', type);
                        setOpenDropdown(null);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${filters.property_type === type ? 'text-brand-700 font-medium' : 'text-gray-700'}`}
                    >
                      {labels[type]}
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                {['apartment_building', 'apartment_house', 'duplex', 'full_house', 'basement'].map((type) => {
                  const labels: Record<string, string> = {
                    apartment_building: 'Apartment in Building',
                    apartment_house: 'Apartment in House',
                    duplex: 'Duplex',
                    full_house: 'Full House',
                    basement: 'Basement',
                  };
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        handleFilterChange('property_type', type);
                        setOpenDropdown(null);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${filters.property_type === type ? 'text-brand-700 font-medium' : 'text-gray-700'}`}
                    >
                      {labels[type]}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </FilterDropdown>

        {/* Neighborhoods */}
        <FilterDropdown
          label="Neighborhoods"
          value={getNeighborhoodsLabel()}
          isActive={!!filters.neighborhoods && filters.neighborhoods.length > 0}
          isOpen={openDropdown === 'neighborhoods'}
          onToggle={() => toggleDropdown('neighborhoods')}
        >
          <div className="p-3 w-72">
            <div className="text-sm font-semibold text-gray-900 mb-2">Neighborhoods</div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {allNeighborhoods.map((neighborhood) => {
                const isSelected = filters.neighborhoods?.includes(neighborhood) || false;
                return (
                  <label
                    key={neighborhood}
                    className="flex items-center px-2 py-2 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        const current = filters.neighborhoods || [];
                        const newNeighborhoods = isSelected
                          ? current.filter(n => n !== neighborhood)
                          : [...current, neighborhood];
                        handleFilterChange('neighborhoods', newNeighborhoods.length > 0 ? newNeighborhoods : undefined);
                      }}
                      className="h-4 w-4 text-brand-700 focus:ring-brand-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">{neighborhood}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </FilterDropdown>

        {/* Listed By */}
        <FilterDropdown
          label="Listed By"
          value={getPosterLabel()}
          isActive={!!filters.poster_type}
          isOpen={openDropdown === 'poster'}
          onToggle={() => toggleDropdown('poster')}
        >
          <div className="py-1 w-56">
            <button
              onClick={() => {
                onFiltersChange({ ...filters, poster_type: undefined, agency_name: undefined });
                setOpenDropdown(null);
              }}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${!filters.poster_type ? 'text-brand-700 font-medium' : 'text-gray-700'}`}
            >
              All Posters
            </button>
            <button
              onClick={() => {
                onFiltersChange({ ...filters, poster_type: 'owner', agency_name: undefined });
                setOpenDropdown(null);
              }}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${filters.poster_type === 'owner' ? 'text-brand-700 font-medium' : 'text-gray-700'}`}
            >
              By Owner
            </button>
            <button
              onClick={() => {
                onFiltersChange({ ...filters, poster_type: 'agent', agency_name: undefined });
                setOpenDropdown(null);
              }}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${filters.poster_type === 'agent' && !filters.agency_name ? 'text-brand-700 font-medium' : 'text-gray-700'}`}
            >
              All Agencies
            </button>
            {agencies.length > 0 && (
              <>
                <div className="border-t border-gray-100 my-1"></div>
                <div className="px-4 py-1 text-xs font-medium text-gray-500 uppercase">Specific Agency</div>
                {agencies.map((agency) => (
                  <button
                    key={agency}
                    onClick={() => {
                      onFiltersChange({ ...filters, poster_type: 'agent', agency_name: agency });
                      setOpenDropdown(null);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${filters.agency_name === agency ? 'text-brand-700 font-medium' : 'text-gray-700'}`}
                  >
                    {agency}
                  </button>
                ))}
              </>
            )}
          </div>
        </FilterDropdown>

        {/* Quick Filters */}
        <button
          onClick={() => handleFilterChange('parking_included', !filters.parking_included)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            filters.parking_included
              ? 'bg-brand-700 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Parking
        </button>

        {listingType === 'rental' && (
          <button
            onClick={() => handleFilterChange('no_fee_only', !filters.no_fee_only)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              filters.no_fee_only
                ? 'bg-brand-700 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            No Fee
          </button>
        )}

        {/* Sort */}
        <FilterDropdown
          label="Sort"
          value={getSortLabel()}
          isActive={!!filters.sort && filters.sort !== 'newest'}
          isOpen={openDropdown === 'sort'}
          onToggle={() => toggleDropdown('sort')}
        >
          <div className="py-1">
            {[
              { value: 'newest', label: 'Newest First' },
              { value: 'oldest', label: 'Oldest First' },
              { value: 'price_asc', label: 'Price: Low to High' },
              { value: 'price_desc', label: 'Price: High to Low' },
              { value: 'bedrooms_asc', label: 'Bedrooms: Low to High' },
              { value: 'bedrooms_desc', label: 'Bedrooms: High to Low' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  handleFilterChange('sort', option.value);
                  setOpenDropdown(null);
                }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${
                  (filters.sort || 'newest') === option.value ? 'text-brand-700 font-medium' : 'text-gray-700'
                }`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                {option.label}
              </button>
            ))}
          </div>
        </FilterDropdown>

        {/* Clear All */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Active Filter Tags */}
      {activeFilterTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {activeFilterTags.map((tag) => (
            <span
              key={tag.key}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-100 text-brand-800 rounded-full text-sm font-medium"
            >
              {tag.label}
              <button
                onClick={tag.onRemove}
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
