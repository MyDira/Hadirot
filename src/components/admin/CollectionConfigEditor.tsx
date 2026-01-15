import React from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

export interface CollectionConfig {
  id: string;
  enabled: boolean;
  label: string;
  filters: Record<string, any>;
  cta_format: string;
  order: number;
}

interface CollectionConfigEditorProps {
  collections: CollectionConfig[];
  onChange: (collections: CollectionConfig[]) => void;
}

export function CollectionConfigEditor({ collections, onChange }: CollectionConfigEditorProps) {
  const handleAddCollection = () => {
    if (collections.length >= 20) {
      alert('Maximum of 20 collections allowed');
      return;
    }

    const newCollection: CollectionConfig = {
      id: `collection-${Date.now()}`,
      enabled: true,
      label: '2 bedroom apartments',
      filters: {},
      cta_format: 'Click here to see all {count} of our {label}',
      order: collections.length
    };

    onChange([...collections, newCollection]);
  };

  const handleRemoveCollection = (index: number) => {
    const updated = collections.filter((_, i) => i !== index);
    onChange(updated.map((c, i) => ({ ...c, order: i })));
  };

  const handleToggleEnabled = (index: number) => {
    const updated = [...collections];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    onChange(updated);
  };

  const handleUpdateLabel = (index: number, label: string) => {
    const updated = [...collections];
    updated[index] = { ...updated[index], label };
    onChange(updated);
  };

  const handleUpdateCTAFormat = (index: number, cta_format: string) => {
    const updated = [...collections];
    updated[index] = { ...updated[index], cta_format };
    onChange(updated);
  };

  const handleUpdateFilter = (index: number, filterKey: string, value: any) => {
    const updated = [...collections];
    updated[index] = {
      ...updated[index],
      filters: { ...updated[index].filters, [filterKey]: value }
    };
    onChange(updated);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...collections];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onChange(updated.map((c, i) => ({ ...c, order: i })));
  };

  const handleMoveDown = (index: number) => {
    if (index === collections.length - 1) return;
    const updated = [...collections];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onChange(updated.map((c, i) => ({ ...c, order: i })));
  };

  return (
    <div className="space-y-4">
      {collections.map((collection, index) => (
        <div
          key={index}
          className={`border rounded-lg p-4 ${
            collection.enabled ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">
                Collection {index + 1}
              </span>
              <button
                type="button"
                onClick={() => handleToggleEnabled(index)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  collection.enabled ? 'bg-green-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                    collection.enabled ? 'translate-x-5' : 'translate-x-1'
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
                disabled={index === collections.length - 1}
                className="p-1 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move down"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleRemoveCollection(index)}
                className="p-1 text-red-600 hover:text-red-800"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Collection Label
              </label>
              <input
                type="text"
                value={collection.label}
                onChange={(e) => handleUpdateLabel(index, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 2 bedroom apartments"
              />
              <p className="text-xs text-gray-500 mt-1">Used in the CTA as the {'{label}'} variable</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Call-to-Action Format
              </label>
              <input
                type="text"
                value={collection.cta_format || 'Click here to see all {count} of our {label}'}
                onChange={(e) => handleUpdateCTAFormat(index, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Click here to see all {count} of our {label}"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use {'{count}'} for listing count and {'{label}'} for the label above
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Listing Type
                </label>
                <select
                  value={collection.filters.listing_type || ''}
                  onChange={(e) => handleUpdateFilter(index, 'listing_type', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Both</option>
                  <option value="rental">Rentals</option>
                  <option value="sale">Sales</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bedrooms
                </label>
                <select
                  value={collection.filters.bedrooms || ''}
                  onChange={(e) => handleUpdateFilter(index, 'bedrooms', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property Type
                </label>
                <select
                  value={collection.filters.property_type || ''}
                  onChange={(e) => handleUpdateFilter(index, 'property_type', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Price
                </label>
                <input
                  type="number"
                  value={collection.filters.price_min || ''}
                  onChange={(e) => handleUpdateFilter(index, 'price_min', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="No min"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Price
                </label>
                <input
                  type="number"
                  value={collection.filters.price_max || ''}
                  onChange={(e) => handleUpdateFilter(index, 'price_max', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="No max"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Broker Fee
                </label>
                <select
                  value={collection.filters.broker_fee === undefined ? '' : collection.filters.broker_fee.toString()}
                  onChange={(e) => handleUpdateFilter(index, 'broker_fee', e.target.value === '' ? undefined : e.target.value === 'true')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Any</option>
                  <option value="false">No Fee</option>
                  <option value="true">Fee</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parking
                </label>
                <select
                  value={collection.filters.parking || ''}
                  onChange={(e) => handleUpdateFilter(index, 'parking', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
        </div>
      ))}

      <button
        type="button"
        onClick={handleAddCollection}
        disabled={collections.length >= 20}
        className={`w-full flex items-center justify-center px-4 py-3 border-2 border-dashed rounded-lg transition-colors ${
          collections.length >= 20
            ? 'border-gray-200 text-gray-400 cursor-not-allowed'
            : 'border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600'
        }`}
      >
        <Plus className="w-5 h-5 mr-2" />
        Add Collection ({collections.length}/20)
      </button>
    </div>
  );
}
