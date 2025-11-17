import React, { useState, useEffect } from 'react';
import { X, Save, HelpCircle } from 'lucide-react';
import { digestService, DigestTemplate, FilterPreset } from '../../services/digest';

interface DigestTemplateEditorProps {
  template?: DigestTemplate | null;
  onSave: () => void;
  onCancel: () => void;
}

const TEMPLATE_TYPES = [
  { value: 'unsent_only', label: 'Unsent Only', description: 'Send only listings never included in any previous digest' },
  { value: 'recent_by_category', label: 'Recent by Category', description: 'Group recent listings by bedroom count with configurable limits' },
  { value: 'filter_links', label: 'Filter Links', description: 'Send browse page links with live counts for popular filters' },
  { value: 'custom_query', label: 'Custom Query', description: 'Full control over filters including bedrooms, price, location, etc.' },
  { value: 'mixed_layout', label: 'Mixed Layout', description: 'Combine listing cards and filter links in one email' },
  { value: 'all_active', label: 'All Active', description: 'Send all active approved listings regardless of send history' },
];

const SORT_OPTIONS = [
  { value: 'newest_first', label: 'Newest First' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'featured_first', label: 'Featured First' },
];

export function DigestTemplateEditor({ template, onSave, onCancel }: DigestTemplateEditorProps) {
  const [loading, setLoading] = useState(false);
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateType, setTemplateType] = useState<string>('unsent_only');
  const [sortPreference, setSortPreference] = useState<string>('newest_first');
  const [allowResend, setAllowResend] = useState(false);
  const [resendAfterDays, setResendAfterDays] = useState(7);
  const [ignoreSendHistory, setIgnoreSendHistory] = useState(false);
  const [subjectTemplate, setSubjectTemplate] = useState('Daily Listing Digest - {{date}}');
  const [includeFilterLinks, setIncludeFilterLinks] = useState(false);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);

  // Filter config
  const [dateRangeDays, setDateRangeDays] = useState(7);
  const [bedroomsFilter, setBedroomsFilter] = useState<number[]>([]);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [brokerFeeFilter, setBrokerFeeFilter] = useState<string>('all');

  // Category limits
  const [studioLimit, setStudioLimit] = useState(5);
  const [oneBedLimit, setOneBedLimit] = useState(5);
  const [twoBedLimit, setTwoBedLimit] = useState(5);
  const [threeBedLimit, setThreeBedLimit] = useState(3);
  const [fourPlusLimit, setFourPlusLimit] = useState(2);

  useEffect(() => {
    loadFilterPresets();
    if (template) {
      populateForm(template);
    }
  }, [template]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadFilterPresets = async () => {
    try {
      const presets = await digestService.getFilterPresets();
      setFilterPresets(presets);
    } catch (error) {
      console.error('Error loading filter presets:', error);
    }
  };

  const populateForm = (t: DigestTemplate) => {
    setName(t.name);
    setDescription(t.description || '');
    setTemplateType(t.template_type);
    setSortPreference(t.sort_preference);
    setAllowResend(t.allow_resend);
    setResendAfterDays(t.resend_after_days);
    setIgnoreSendHistory(t.ignore_send_history);
    setSubjectTemplate(t.subject_template);
    setIncludeFilterLinks(t.include_filter_links);
    setSelectedPresetIds(t.filter_preset_ids || []);

    // Filter config
    const config = t.filter_config as any;
    setDateRangeDays(config.date_range_days || 7);
    setBedroomsFilter(config.bedrooms || []);
    setPriceMin(config.price_min?.toString() || '');
    setPriceMax(config.price_max?.toString() || '');
    setBrokerFeeFilter(config.broker_fee === false ? 'no_fee' : config.broker_fee === true ? 'fee' : 'all');

    // Category limits
    const limits = t.category_limits as any;
    setStudioLimit(limits.studio || 5);
    setOneBedLimit(limits['1bed'] || 5);
    setTwoBedLimit(limits['2bed'] || 5);
    setThreeBedLimit(limits['3bed'] || 3);
    setFourPlusLimit(limits['4plus'] || 2);
  };

  const handleBedroomToggle = (bedroom: number) => {
    setBedroomsFilter(prev =>
      prev.includes(bedroom)
        ? prev.filter(b => b !== bedroom)
        : [...prev, bedroom]
    );
  };

  const handlePresetToggle = (presetId: string) => {
    setSelectedPresetIds(prev =>
      prev.includes(presetId)
        ? prev.filter(id => id !== presetId)
        : [...prev, presetId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setToast({ message: 'Template name is required', tone: 'error' });
      return;
    }

    setLoading(true);

    try {
      const filterConfig: any = {
        date_range_days: dateRangeDays,
      };

      if (bedroomsFilter.length > 0) {
        filterConfig.bedrooms = bedroomsFilter;
      }

      if (priceMin) {
        filterConfig.price_min = parseInt(priceMin);
      }

      if (priceMax) {
        filterConfig.price_max = parseInt(priceMax);
      }

      if (brokerFeeFilter === 'no_fee') {
        filterConfig.broker_fee = false;
      } else if (brokerFeeFilter === 'fee') {
        filterConfig.broker_fee = true;
      }

      const categoryLimits = {
        studio: studioLimit,
        '1bed': oneBedLimit,
        '2bed': twoBedLimit,
        '3bed': threeBedLimit,
        '4plus': fourPlusLimit,
      };

      const templateData: Partial<DigestTemplate> = {
        name: name.trim(),
        description: description.trim() || undefined,
        template_type: templateType as any,
        filter_config: filterConfig,
        category_limits: categoryLimits,
        sort_preference: sortPreference as any,
        allow_resend: allowResend,
        resend_after_days: resendAfterDays,
        ignore_send_history: ignoreSendHistory,
        subject_template: subjectTemplate,
        include_filter_links: includeFilterLinks,
        filter_preset_ids: selectedPresetIds,
        is_default: false,
      };

      if (template) {
        await digestService.updateTemplate(template.id, templateData);
        setToast({ message: 'Template updated successfully', tone: 'success' });
      } else {
        await digestService.createTemplate(templateData);
        setToast({ message: 'Template created successfully', tone: 'success' });
      }

      setTimeout(() => {
        onSave();
      }, 500);
    } catch (error) {
      console.error('Error saving template:', error);
      setToast({ message: 'Failed to save template', tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {template ? 'Edit Template' : 'Create New Template'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {toast && (
          <div className={`mx-6 mt-4 p-4 rounded-lg ${toast.tone === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {toast.message}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Basic Info Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Weekly 2BR Digest"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={2}
                placeholder="Brief description of this template's purpose"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template Type <span className="text-red-500">*</span>
              </label>
              <select
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {TEMPLATE_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500">
                {TEMPLATE_TYPES.find(t => t.value === templateType)?.description}
              </p>
            </div>
          </div>

          {/* Filter Configuration Section */}
          <div className="space-y-4 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Filter Configuration</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date Range (Days)
              </label>
              <input
                type="number"
                value={dateRangeDays}
                onChange={(e) => setDateRangeDays(parseInt(e.target.value) || 7)}
                min="1"
                max="90"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                Include listings from the last N days
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bedrooms Filter
              </label>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4].map(bedroom => (
                  <button
                    key={bedroom}
                    type="button"
                    onClick={() => handleBedroomToggle(bedroom)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      bedroomsFilter.includes(bedroom)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {bedroom === 0 ? 'Studio' : bedroom === 4 ? '4+' : `${bedroom} BR`}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Leave empty to include all bedroom counts
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Price
                </label>
                <input
                  type="number"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  placeholder="No minimum"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Maximum Price
                </label>
                <input
                  type="number"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  placeholder="No maximum"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Broker Fee Filter
              </label>
              <select
                value={brokerFeeFilter}
                onChange={(e) => setBrokerFeeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Listings</option>
                <option value="no_fee">No Fee Only</option>
                <option value="fee">With Fee Only</option>
              </select>
            </div>
          </div>

          {/* Category Limits Section */}
          {templateType === 'recent_by_category' && (
            <div className="space-y-4 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Category Limits</h3>
              <p className="text-sm text-gray-600">
                Set maximum number of listings per bedroom category
              </p>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Studio</label>
                  <input
                    type="number"
                    value={studioLimit}
                    onChange={(e) => setStudioLimit(parseInt(e.target.value) || 0)}
                    min="0"
                    max="20"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">1 Bedroom</label>
                  <input
                    type="number"
                    value={oneBedLimit}
                    onChange={(e) => setOneBedLimit(parseInt(e.target.value) || 0)}
                    min="0"
                    max="20"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">2 Bedrooms</label>
                  <input
                    type="number"
                    value={twoBedLimit}
                    onChange={(e) => setTwoBedLimit(parseInt(e.target.value) || 0)}
                    min="0"
                    max="20"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">3 Bedrooms</label>
                  <input
                    type="number"
                    value={threeBedLimit}
                    onChange={(e) => setThreeBedLimit(parseInt(e.target.value) || 0)}
                    min="0"
                    max="20"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">4+ Bedrooms</label>
                  <input
                    type="number"
                    value={fourPlusLimit}
                    onChange={(e) => setFourPlusLimit(parseInt(e.target.value) || 0)}
                    min="0"
                    max="20"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Sorting and Deduplication Section */}
          <div className="space-y-4 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Sorting & Deduplication</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sort Preference
              </label>
              <select
                value={sortPreference}
                onChange={(e) => setSortPreference(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {SORT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={ignoreSendHistory}
                  onChange={(e) => setIgnoreSendHistory(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Ignore send history (send all matching listings regardless of previous sends)
                </span>
              </label>

              {!ignoreSendHistory && (
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={allowResend}
                    onChange={(e) => setAllowResend(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Allow resending listings after a certain period
                  </span>
                </label>
              )}

              {allowResend && !ignoreSendHistory && (
                <div className="ml-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Resend after (days)
                  </label>
                  <input
                    type="number"
                    value={resendAfterDays}
                    onChange={(e) => setResendAfterDays(parseInt(e.target.value) || 7)}
                    min="1"
                    max="90"
                    className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Email Settings Section */}
          <div className="space-y-4 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Email Settings</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subject Line Template
              </label>
              <input
                type="text"
                value={subjectTemplate}
                onChange={(e) => setSubjectTemplate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                Use <code className="px-1 bg-gray-100 rounded">{'{{date}}'}</code> for current date,{' '}
                <code className="px-1 bg-gray-100 rounded">{'{{count}}'}</code> for listing count
              </p>
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeFilterLinks}
                  onChange={(e) => setIncludeFilterLinks(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Include filter preset links in email
                </span>
              </label>
            </div>

            {includeFilterLinks && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Filter Presets
                </label>
                <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-lg p-3 space-y-2">
                  {filterPresets.length === 0 ? (
                    <p className="text-sm text-gray-500">No filter presets available</p>
                  ) : (
                    filterPresets.map(preset => (
                      <label key={preset.id} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedPresetIds.includes(preset.id)}
                          onChange={() => handlePresetToggle(preset.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          {preset.display_label}
                        </span>
                        <span className="ml-auto text-xs text-gray-500">
                          ({preset.category})
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {template ? 'Update Template' : 'Create Template'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
