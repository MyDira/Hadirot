import React, { useState, useEffect } from "react";
import { X } from "lucide-react";

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

interface MoreFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  agencies?: string[];
  allNeighborhoods?: string[];
  listingType?: 'rental' | 'sale';
}

export function MoreFiltersModal({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
  agencies = [],
  allNeighborhoods = [],
  listingType = 'rental',
}: MoreFiltersModalProps) {
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  if (!isOpen) return null;

  const handleLocalFilterChange = (key: keyof FilterState, value: any) => {
    setLocalFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApply = () => {
    onFiltersChange(localFilters);
    onClose();
  };

  const handleClear = () => {
    const clearedFilters: FilterState = {
      bedrooms: filters.bedrooms,
      min_price: filters.min_price,
      max_price: filters.max_price,
    };
    setLocalFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl max-h-[80vh] bg-white rounded-lg shadow-xl z-50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">More Filters</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 overflow-y-auto max-h-[calc(80vh-140px)]">
          <div className="space-y-6">
            {/* Property Type */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Property Type</h3>
              <select
                value={localFilters.property_type || ''}
                onChange={(e) => handleLocalFilterChange('property_type', e.target.value || undefined)}
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

            {/* Neighborhoods */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Neighborhoods</h3>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                {allNeighborhoods.map((neighborhood) => {
                  const isSelected = localFilters.neighborhoods?.includes(neighborhood) || false;
                  return (
                    <label
                      key={neighborhood}
                      className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const current = localFilters.neighborhoods || [];
                          const newNeighborhoods = isSelected
                            ? current.filter(n => n !== neighborhood)
                            : [...current, neighborhood];
                          handleLocalFilterChange('neighborhoods', newNeighborhoods.length > 0 ? newNeighborhoods : undefined);
                        }}
                        className="h-4 w-4 text-brand-700 focus:ring-brand-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700">{neighborhood}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Listed By */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Listed By</h3>
              <select
                value={
                  localFilters.poster_type === 'owner'
                    ? 'owner'
                    : localFilters.poster_type === 'agent'
                      ? localFilters.agency_name ? `agent:${localFilters.agency_name}` : 'agent:any'
                      : ''
                }
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'owner') {
                    setLocalFilters({ ...localFilters, poster_type: 'owner', agency_name: undefined });
                  } else if (value === 'agent:any') {
                    setLocalFilters({ ...localFilters, poster_type: 'agent', agency_name: undefined });
                  } else if (value.startsWith('agent:')) {
                    setLocalFilters({ ...localFilters, poster_type: 'agent', agency_name: value.slice('agent:'.length) });
                  } else {
                    setLocalFilters({ ...localFilters, poster_type: undefined, agency_name: undefined });
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
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Additional Options</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleLocalFilterChange('parking_included', !localFilters.parking_included)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    localFilters.parking_included
                      ? 'bg-brand-700 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Parking
                </button>
                {listingType === 'rental' && (
                  <button
                    onClick={() => handleLocalFilterChange('no_fee_only', !localFilters.no_fee_only)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      localFilters.no_fee_only
                        ? 'bg-brand-700 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    No Fee
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={handleClear}
            className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Clear Filters
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-2.5 px-4 bg-brand-700 text-white rounded-lg font-medium hover:bg-brand-800 transition-colors"
          >
            Show Results
          </button>
        </div>
      </div>
    </>
  );
}
