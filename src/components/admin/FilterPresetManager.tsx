import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ExternalLink, TrendingUp, Search } from 'lucide-react';
import { digestService, FilterPreset } from '../../services/digest';

interface FilterPresetManagerProps {
  onPresetsChange?: () => void;
}

const PRESET_CATEGORIES = [
  { value: 'by_bedrooms', label: 'By Bedrooms' },
  { value: 'by_price', label: 'By Price' },
  { value: 'by_neighborhood', label: 'By Neighborhood' },
  { value: 'popular', label: 'Popular Combos' },
  { value: 'other', label: 'Other' },
];

export function FilterPresetManager({ onPresetsChange }: FilterPresetManagerProps) {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPreset, setEditingPreset] = useState<FilterPreset | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('by_bedrooms');
  const [formDisplayLabel, setFormDisplayLabel] = useState('');
  const [formDisplayOrder, setFormDisplayOrder] = useState(0);
  const [formBedrooms, setFormBedrooms] = useState('');
  const [formPriceMin, setFormPriceMin] = useState('');
  const [formPriceMax, setFormPriceMax] = useState('');
  const [formBrokerFee, setFormBrokerFee] = useState<string>('all');

  useEffect(() => {
    loadPresets();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadPresets = async () => {
    try {
      const data = await digestService.getFilterPresets();
      setPresets(data);
    } catch (error) {
      console.error('Error loading presets:', error);
      setToast({ message: 'Failed to load filter presets', tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormCategory('by_bedrooms');
    setFormDisplayLabel('');
    setFormDisplayOrder(0);
    setFormBedrooms('');
    setFormPriceMin('');
    setFormPriceMax('');
    setFormBrokerFee('all');
    setEditingPreset(null);
    setShowCreateForm(false);
  };

  const populateForm = (preset: FilterPreset) => {
    setFormName(preset.name);
    setFormDescription(preset.description || '');
    setFormCategory(preset.category);
    setFormDisplayLabel(preset.display_label);
    setFormDisplayOrder(preset.display_order);

    const params = preset.filter_params as any;
    setFormBedrooms(params.bedrooms !== undefined ? params.bedrooms.toString() : '');
    setFormPriceMin(params.price_min?.toString() || '');
    setFormPriceMax(params.price_max?.toString() || '');
    setFormBrokerFee(
      params.broker_fee === false ? 'no_fee' :
      params.broker_fee === true ? 'fee' : 'all'
    );

    setEditingPreset(preset);
    setShowCreateForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formName.trim() || !formDisplayLabel.trim()) {
      setToast({ message: 'Name and display label are required', tone: 'error' });
      return;
    }

    try {
      const filterParams: any = {};

      if (formBedrooms !== '') {
        filterParams.bedrooms = parseInt(formBedrooms);
      }
      if (formPriceMin) {
        filterParams.price_min = parseInt(formPriceMin);
      }
      if (formPriceMax) {
        filterParams.price_max = parseInt(formPriceMax);
      }
      if (formBrokerFee === 'no_fee') {
        filterParams.broker_fee = false;
      } else if (formBrokerFee === 'fee') {
        filterParams.broker_fee = true;
      }

      const presetData: Partial<FilterPreset> = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        category: formCategory,
        filter_params: filterParams,
        display_label: formDisplayLabel.trim(),
        display_order: formDisplayOrder,
        is_active: true,
      };

      if (editingPreset) {
        await digestService.updateFilterPreset(editingPreset.id, presetData);
        setToast({ message: 'Filter preset updated', tone: 'success' });
      } else {
        await digestService.createFilterPreset(presetData);
        setToast({ message: 'Filter preset created', tone: 'success' });
      }

      resetForm();
      loadPresets();
      onPresetsChange?.();
    } catch (error) {
      console.error('Error saving preset:', error);
      setToast({ message: 'Failed to save filter preset', tone: 'error' });
    }
  };

  const handleDelete = async (preset: FilterPreset) => {
    if (!confirm(`Delete filter preset "${preset.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await digestService.deleteFilterPreset(preset.id);
      setToast({ message: 'Filter preset deleted', tone: 'success' });
      loadPresets();
      onPresetsChange?.();
    } catch (error) {
      console.error('Error deleting preset:', error);
      setToast({ message: 'Failed to delete filter preset', tone: 'error' });
    }
  };

  const handleTestPreset = (preset: FilterPreset) => {
    const params = preset.filter_params as any;
    const queryParams = new URLSearchParams();

    if (params.bedrooms !== undefined) {
      queryParams.set('bedrooms', params.bedrooms.toString());
    }
    if (params.price_min) {
      queryParams.set('minPrice', params.price_min.toString());
    }
    if (params.price_max) {
      queryParams.set('maxPrice', params.price_max.toString());
    }
    if (params.broker_fee === false) {
      queryParams.set('brokerFee', 'no');
    } else if (params.broker_fee === true) {
      queryParams.set('brokerFee', 'yes');
    }

    const url = `/browse?${queryParams.toString()}`;
    window.open(url, '_blank');
  };

  const filteredPresets = presets.filter(preset => {
    const matchesCategory = selectedCategory === 'all' || preset.category === selectedCategory;
    const matchesSearch = preset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          preset.display_label.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const presetsByCategory = PRESET_CATEGORIES.map(cat => ({
    ...cat,
    presets: filteredPresets.filter(p => p.category === cat.value),
    count: presets.filter(p => p.category === cat.value).length,
  }));

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading filter presets...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`p-4 rounded-lg ${toast.tone === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Filter Presets</h3>
          <p className="text-sm text-gray-600 mt-1">
            Reusable filter combinations for digest email links
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreateForm(true);
          }}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Preset
        </button>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search presets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Categories</option>
          {PRESET_CATEGORIES.map(cat => (
            <option key={cat.value} value={cat.value}>
              {cat.label} ({presetsByCategory.find(p => p.value === cat.value)?.count || 0})
            </option>
          ))}
        </select>
      </div>

      {/* Create/Edit Form */}
      {showCreateForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">
            {editingPreset ? 'Edit Filter Preset' : 'Create Filter Preset'}
          </h4>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preset Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 2BR Under $3K"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {PRESET_CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Label <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formDisplayLabel}
                onChange={(e) => setFormDisplayLabel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 2 Bedroom Apartments Under $3,000"
                required
              />
              <p className="mt-1 text-sm text-gray-500">This is how the link appears in emails</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Optional description"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bedrooms
                </label>
                <input
                  type="number"
                  value={formBedrooms}
                  onChange={(e) => setFormBedrooms(e.target.value)}
                  min="0"
                  max="10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Leave empty for all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Price
                </label>
                <input
                  type="number"
                  value={formPriceMin}
                  onChange={(e) => setFormPriceMin(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="No minimum"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Price
                </label>
                <input
                  type="number"
                  value={formPriceMax}
                  onChange={(e) => setFormPriceMax(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="No maximum"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Broker Fee
                </label>
                <select
                  value={formBrokerFee}
                  onChange={(e) => setFormBrokerFee(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Listings</option>
                  <option value="no_fee">No Fee Only</option>
                  <option value="fee">With Fee Only</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Order
                </label>
                <input
                  type="number"
                  value={formDisplayOrder}
                  onChange={(e) => setFormDisplayOrder(parseInt(e.target.value) || 0)}
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-300">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingPreset ? 'Update Preset' : 'Create Preset'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Presets List */}
      {filteredPresets.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500">No filter presets match your search</p>
        </div>
      ) : (
        <div className="space-y-6">
          {presetsByCategory.map(category => {
            if (category.presets.length === 0 && selectedCategory !== 'all') return null;
            if (category.presets.length === 0) return null;

            return (
              <div key={category.value}>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">
                  {category.label} ({category.presets.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {category.presets.map(preset => {
                    const params = preset.filter_params as any;
                    const filterSummary = [];
                    if (params.bedrooms !== undefined) {
                      filterSummary.push(`${params.bedrooms === 0 ? 'Studio' : `${params.bedrooms} BR`}`);
                    }
                    if (params.price_min || params.price_max) {
                      const priceRange = [
                        params.price_min ? `$${params.price_min}+` : '',
                        params.price_max ? `under $${params.price_max}` : ''
                      ].filter(Boolean).join(' - ');
                      filterSummary.push(priceRange);
                    }
                    if (params.broker_fee === false) {
                      filterSummary.push('No Fee');
                    }

                    return (
                      <div
                        key={preset.id}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h5 className="font-semibold text-gray-900">{preset.name}</h5>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleTestPreset(preset)}
                              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                              title="Test in new tab"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => populateForm(preset)}
                              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(preset)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <p className="text-sm text-gray-600 mb-3">{preset.display_label}</p>

                        {filterSummary.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {filterSummary.map((tag, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <div className="flex items-center">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            Used {preset.usage_count} times
                          </div>
                          {preset.last_used_at && (
                            <div>
                              {new Date(preset.last_used_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
