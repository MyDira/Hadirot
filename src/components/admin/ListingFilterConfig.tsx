import React from 'react';

interface ListingFilterConfigProps {
  timeFilter: string;
  filterConfig: Record<string, any>;
  sectionBy: string | null;
  onTimeFilterChange: (filter: string) => void;
  onFilterConfigChange: (config: Record<string, any>) => void;
  onSectionByChange: (sectionBy: string | null) => void;
}

export function ListingFilterConfig({
  timeFilter,
  filterConfig,
  sectionBy,
  onTimeFilterChange,
  onFilterConfigChange,
  onSectionByChange
}: ListingFilterConfigProps) {
  const handleFilterChange = (key: string, value: any) => {
    const updated = { ...filterConfig };
    if (value === '' || value === undefined) {
      delete updated[key];
    } else {
      updated[key] = value;
    }
    onFilterConfigChange(updated);
  };

  const handleBedroomsMultiSelect = (bedroom: number) => {
    const current = Array.isArray(filterConfig.bedrooms) ? filterConfig.bedrooms : [];
    const updated = current.includes(bedroom)
      ? current.filter(b => b !== bedroom)
      : [...current, bedroom];

    if (updated.length === 0) {
      handleFilterChange('bedrooms', undefined);
    } else {
      handleFilterChange('bedrooms', updated);
    }
  };

  const handlePropertyTypesMultiSelect = (type: string) => {
    const current = Array.isArray(filterConfig.property_type) ? filterConfig.property_type : [];
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];

    if (updated.length === 0) {
      handleFilterChange('property_type', undefined);
    } else {
      handleFilterChange('property_type', updated);
    }
  };

  const selectedBedrooms = Array.isArray(filterConfig.bedrooms) ? filterConfig.bedrooms : [];
  const selectedPropertyTypes = Array.isArray(filterConfig.property_type) ? filterConfig.property_type : [];

  return (
    <div className="space-y-6">
      {/* Time Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Time Range
        </label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { value: '24h', label: 'Last 24h' },
            { value: '48h', label: 'Last 48h' },
            { value: '3d', label: 'Last 3 days' },
            { value: '7d', label: 'Last week' },
            { value: '14d', label: 'Last 2 weeks' },
            { value: '30d', label: 'Last month' },
            { value: 'all', label: 'All time' }
          ].map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => onTimeFilterChange(option.value)}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                timeFilter === option.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bedrooms Multi-Select */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Bedrooms (select multiple)
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 0, label: 'Studio' },
            { value: 1, label: '1 Bed' },
            { value: 2, label: '2 Beds' },
            { value: 3, label: '3 Beds' },
            { value: 4, label: '4+ Beds' }
          ].map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleBedroomsMultiSelect(option.value)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                selectedBedrooms.includes(option.value)
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {selectedBedrooms.length > 0 && (
          <p className="mt-2 text-sm text-gray-600">
            Selected: {selectedBedrooms.map(b => b === 0 ? 'Studio' : `${b} bed${b > 1 ? 's' : ''}`).join(', ')}
          </p>
        )}
      </div>

      {/* Property Type Multi-Select */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Property Type (select multiple)
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'apartment', label: 'Apartment' },
            { value: 'duplex', label: 'Duplex' },
            { value: 'basement', label: 'Basement' },
            { value: 'house', label: 'Full House' },
            { value: 'townhouse', label: 'Townhouse' }
          ].map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => handlePropertyTypesMultiSelect(option.value)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                selectedPropertyTypes.includes(option.value)
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {selectedPropertyTypes.length > 0 && (
          <p className="mt-2 text-sm text-gray-600">
            Selected: {selectedPropertyTypes.join(', ')}
          </p>
        )}
      </div>

      {/* Price Range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Min Price
          </label>
          <input
            type="number"
            value={filterConfig.price_min || ''}
            onChange={(e) => handleFilterChange('price_min', e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="No minimum"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Price
          </label>
          <input
            type="number"
            value={filterConfig.price_max || ''}
            onChange={(e) => handleFilterChange('price_max', e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="No maximum"
          />
        </div>
      </div>

      {/* Broker Fee and Parking */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Broker Fee
          </label>
          <select
            value={filterConfig.broker_fee === undefined ? '' : filterConfig.broker_fee.toString()}
            onChange={(e) => handleFilterChange('broker_fee', e.target.value === '' ? undefined : e.target.value === 'true')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Any</option>
            <option value="false">No Fee</option>
            <option value="true">Fee</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Parking
          </label>
          <select
            value={filterConfig.parking === undefined ? '' : filterConfig.parking.toString()}
            onChange={(e) => handleFilterChange('parking', e.target.value === '' ? undefined : e.target.value === 'true')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Any</option>
            <option value="true">With Parking</option>
            <option value="false">No Parking</option>
          </select>
        </div>
      </div>

      {/* Section By */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Group Listings By
        </label>
        <select
          value={sectionBy || ''}
          onChange={(e) => onSectionByChange(e.target.value || null)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">No Grouping</option>
          <option value="bedrooms">Group by Bedrooms</option>
          <option value="property_type">Group by Property Type</option>
        </select>
        <p className="mt-2 text-sm text-gray-500">
          When grouping is enabled, listings will be organized under category headers (e.g., "2 Bedrooms")
        </p>
      </div>
    </div>
  );
}
