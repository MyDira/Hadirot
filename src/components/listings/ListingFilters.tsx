import React from 'react';
import { Filter } from 'lucide-react';

interface FilterState {
  bedrooms?: number;
  poster_type?: string;
  agency_name?: string;
  property_type?: string;
  min_price?: number;
  max_price?: number;
  parking_included?: boolean;
  neighborhoods?: string[];
}

interface ListingFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  agencies: string[];
  allNeighborhoods: string[];
  isMobile?: boolean;
}

export function ListingFilters({ filters, onFiltersChange, agencies, allNeighborhoods, isMobile = false }: ListingFiltersProps) {
  const [showNeighborhoodDropdown, setShowNeighborhoodDropdown] = React.useState(false);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.relative')) {
        setShowNeighborhoodDropdown(false);
      }
    };

    if (showNeighborhoodDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showNeighborhoodDropdown]);

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  return (
    <div className={`bg-white p-4 rounded-lg shadow-sm border border-gray-200 ${!isMobile ? 'mb-6' : ''}`}>
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

      <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7'}`}>
        {/* Bedrooms */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Bedrooms
          </label>
          <select
            value={filters.bedrooms === 0 ? '0' : filters.bedrooms === undefined ? '' : filters.bedrooms}
            onChange={(e) => {
              const selectedValue = e.target.value;
              let newBedroomsFilter: number | undefined;
              if (selectedValue === '') {
                newBedroomsFilter = undefined; // This handles the "Any" option
              } else {
                newBedroomsFilter = parseInt(selectedValue); // This correctly parses "0" as the number 0
              }
              handleFilterChange('bedrooms', newBedroomsFilter);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
          >
            <option value="">Any</option>
            <option value="0">Studio</option>
            <option value="1">1 BR</option>
            <option value="2">2 BR</option>
            <option value="3">3 BR</option>
            <option value="4">4+ BR</option>
          </select>
        </div>

        {/* Who is Listing */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Who is Listing?
          </label>
          <select
            value={filters.poster_type || ''}
            onChange={(e) => {
              const newPosterType = e.target.value;
              const newFilters = { ...filters, poster_type: newPosterType };
              
              // Clear agency_name if not selecting 'agency'
              if (newPosterType !== 'agency') {
                delete newFilters.agency_name;
              }
              
              onFiltersChange(newFilters);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
          >
            <option value="">All Posters</option>
            <option value="landlord">Landlord</option>
            <option value="agency">Agency</option>
          </select>
        </div>

        {/* Agency Name - only show when poster_type is 'agency' */}
        {filters.poster_type === 'agency' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Agency Name
            </label>
            <select
              value={filters.agency_name || ''}
              onChange={(e) => handleFilterChange('agency_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
            >
              <option value="">All Agencies</option>
              {agencies.map((agency) => (
                <option key={agency} value={agency}>
                  {agency}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Neighborhoods */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Neighborhoods
          </label>
          <div className="relative">
            <div
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus-within:ring-[#273140] focus-within:border-[#273140] h-10 cursor-pointer bg-white flex items-center justify-between"
              onClick={() => setShowNeighborhoodDropdown(!showNeighborhoodDropdown)}
            >
              <span className="text-sm text-gray-700 truncate">
                {filters.neighborhoods && filters.neighborhoods.length > 0
                  ? `${filters.neighborhoods.length} selected`
                  : 'Select neighborhoods...'}
              </span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            
            {showNeighborhoodDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {allNeighborhoods.map((neighborhood) => (
                  <div
                    key={neighborhood}
                    className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      const currentNeighborhoods = filters.neighborhoods || [];
                      const isSelected = currentNeighborhoods.includes(neighborhood);
                      
                      let newNeighborhoods;
                      if (isSelected) {
                        newNeighborhoods = currentNeighborhoods.filter(n => n !== neighborhood);
                      } else {
                        newNeighborhoods = [...currentNeighborhoods, neighborhood];
                      }
                      
                      handleFilterChange('neighborhoods', newNeighborhoods.length > 0 ? newNeighborhoods : undefined);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filters.neighborhoods?.includes(neighborhood) || false}
                      onChange={() => {}} // Handled by parent div onClick
                     className="mr-2 h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                    />
                    <span className="text-sm">{neighborhood}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Property Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rental Type
          </label>
          <select
            value={filters.property_type || ''}
            onChange={(e) => handleFilterChange('property_type', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
          >
            <option value="">All Types</option>
            <option value="apartment_building">Apartment in Building</option>
            <option value="apartment_house">Apartment in House</option>
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
            value={filters.min_price || ''}
            onChange={(e) => handleFilterChange('min_price', parseInt(e.target.value) || undefined)}
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
            value={filters.max_price || ''}
            onChange={(e) => handleFilterChange('max_price', parseInt(e.target.value) || undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
          />
        </div>

        {/* Parking Included */}
        <div className="flex items-center pt-6">
          <input
            type="checkbox"
            id="parking_included"
            checked={filters.parking_included || false}
            onChange={(e) => handleFilterChange('parking_included', e.target.checked)}
            className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
          />
          <label htmlFor="parking_included" className="ml-2 text-sm font-medium text-gray-700">
            Parking Included
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

      {/* Selected neighborhoods tags - displayed horizontally below filters */}
      {filters.neighborhoods && filters.neighborhoods.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.neighborhoods.map((neighborhood) => (
            <span
              key={neighborhood}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[#667B9A] text-white"
            >
              {neighborhood}
              <button
                type="button"
                onClick={() => {
                  const newNeighborhoods = filters.neighborhoods?.filter(n => n !== neighborhood);
                  handleFilterChange('neighborhoods', newNeighborhoods?.length ? newNeighborhoods : undefined);
                }}
                className="ml-2 hover:bg-[#5a6b85] rounded-full p-0.5"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}