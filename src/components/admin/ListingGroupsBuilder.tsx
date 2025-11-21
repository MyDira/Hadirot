import React from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

export interface ListingGroup {
  id: string;
  enabled: boolean;
  limit: number;
  filters: Record<string, any>;
  time_filter: string;
}

interface ListingGroupsBuilderProps {
  groups: ListingGroup[];
  onChange: (groups: ListingGroup[]) => void;
}

export function ListingGroupsBuilder({ groups, onChange }: ListingGroupsBuilderProps) {
  const handleAddGroup = () => {
    const newGroup: ListingGroup = {
      id: `group-${Date.now()}`,
      enabled: true,
      limit: 10,
      filters: {},
      time_filter: 'all'
    };

    onChange([...groups, newGroup]);
  };

  const handleRemoveGroup = (index: number) => {
    const updated = groups.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleToggleEnabled = (index: number) => {
    const updated = [...groups];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    onChange(updated);
  };

  const handleUpdateLimit = (index: number, limit: number) => {
    const updated = [...groups];
    updated[index] = { ...updated[index], limit };
    onChange(updated);
  };

  const handleUpdateTimeFilter = (index: number, time_filter: string) => {
    const updated = [...groups];
    updated[index] = { ...updated[index], time_filter };
    onChange(updated);
  };

  const handleUpdateFilter = (index: number, filterKey: string, value: any) => {
    const updated = [...groups];
    const filters = { ...updated[index].filters };

    if (value === '' || value === undefined) {
      delete filters[filterKey];
    } else {
      filters[filterKey] = value;
    }

    updated[index] = { ...updated[index], filters };
    onChange(updated);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...groups];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onChange(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index === groups.length - 1) return;
    const updated = [...groups];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {groups.map((group, index) => (
        <div
          key={group.id}
          className={`border rounded-lg p-4 ${
            group.enabled ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">
                Group {index + 1}
              </span>
              <button
                type="button"
                onClick={() => handleToggleEnabled(index)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  group.enabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                    group.enabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                className="p-1 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move up"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleMoveDown(index)}
                disabled={index === groups.length - 1}
                className="p-1 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move down"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleRemoveGroup(index)}
                className="p-1 text-red-600 hover:text-red-800"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {/* Limit and Time Filter Row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Listing Limit
                </label>
                <input
                  type="number"
                  value={group.limit}
                  onChange={(e) => handleUpdateLimit(index, parseInt(e.target.value) || 1)}
                  min="1"
                  max="50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time Filter
                </label>
                <select
                  value={group.time_filter}
                  onChange={(e) => handleUpdateTimeFilter(index, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="24h">Last 24h</option>
                  <option value="48h">Last 48h</option>
                  <option value="3d">Last 3 days</option>
                  <option value="7d">Last week</option>
                  <option value="14d">Last 2 weeks</option>
                  <option value="30d">Last month</option>
                  <option value="all">All time</option>
                </select>
              </div>
            </div>

            {/* Filter Section */}
            <div className="bg-white rounded p-3 space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Filters</h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Bedrooms
                  </label>
                  <select
                    value={group.filters.bedrooms || ''}
                    onChange={(e) => handleUpdateFilter(index, 'bedrooms', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Any</option>
                    <option value="0">Studio</option>
                    <option value="1">1 Bed</option>
                    <option value="2">2 Beds</option>
                    <option value="3">3 Beds</option>
                    <option value="4">4+ Beds</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Property Type
                  </label>
                  <select
                    value={group.filters.property_type || ''}
                    onChange={(e) => handleUpdateFilter(index, 'property_type', e.target.value || undefined)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Any</option>
                    <option value="apartment">Apartment</option>
                    <option value="duplex">Duplex</option>
                    <option value="basement">Basement</option>
                    <option value="house">Full House</option>
                    <option value="townhouse">Townhouse</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Min Price
                  </label>
                  <input
                    type="number"
                    value={group.filters.price_min || ''}
                    onChange={(e) => handleUpdateFilter(index, 'price_min', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="No min"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Max Price
                  </label>
                  <input
                    type="number"
                    value={group.filters.price_max || ''}
                    onChange={(e) => handleUpdateFilter(index, 'price_max', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="No max"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Broker Fee
                  </label>
                  <select
                    value={group.filters.broker_fee === undefined ? '' : group.filters.broker_fee.toString()}
                    onChange={(e) => handleUpdateFilter(index, 'broker_fee', e.target.value === '' ? undefined : e.target.value === 'true')}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Any</option>
                    <option value="false">No Fee</option>
                    <option value="true">Fee</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Parking
                  </label>
                  <select
                    value={group.filters.parking || ''}
                    onChange={(e) => handleUpdateFilter(index, 'parking', e.target.value || undefined)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Any</option>
                    <option value="yes">Yes (Separate)</option>
                    <option value="included">Included</option>
                    <option value="optional">Optional</option>
                    <option value="no">No Parking</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="text-xs text-gray-600 bg-gray-100 rounded p-2">
              <span className="font-medium">Summary:</span> Fetch up to {group.limit} listings from{' '}
              {group.time_filter === 'all' ? 'all time' : `the ${group.time_filter.replace('h', ' hours').replace('d', ' days')}`}
              {Object.keys(group.filters).length > 0 && ' with specified filters'}
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAddGroup}
        className="w-full flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        <Plus className="w-5 h-5 mr-2" />
        Add Listing Group
      </button>
    </div>
  );
}
