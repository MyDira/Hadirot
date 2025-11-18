import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Save, Eye, Send, Copy, Plus, Edit2, Trash2, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { digestService, DigestTemplate } from '@/services/digest';
import { WhatsAppFormatter, CollectionLink, FormattedListing } from '@/utils/whatsappFormatter';
import { supabase, Listing } from '@/config/supabase';
import { CollectionConfigEditor, CollectionConfig } from '@/components/admin/CollectionConfigEditor';
import { ListingFilterConfig } from '@/components/admin/ListingFilterConfig';

export function DigestManager() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Template management
  const [templates, setTemplates] = useState<DigestTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [currentTemplate, setCurrentTemplate] = useState<Partial<DigestTemplate>>({
    name: 'New WhatsApp Digest',
    template_type: 'custom_query',
    whatsapp_intro_text: 'Here are the latest apartments posted on Hadirot:',
    whatsapp_outro_text: 'Join the Hadirot WhatsApp Community:\nhttps://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt',
    include_collections: false,
    collection_configs: [],
    listings_time_filter: 'all',
    listings_filter_config: {},
    section_by_filter: null,
    output_format: 'whatsapp'
  });

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    intro: true,
    collections: false,
    listings: false,
    outro: true
  });

  // Preview state
  const [previewText, setPreviewText] = useState('');
  const [previewListings, setPreviewListings] = useState<FormattedListing[]>([]);
  const [previewCollections, setPreviewCollections] = useState<CollectionLink[]>([]);
  const [copySuccess, setCopySuccess] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!profile?.is_admin) {
      navigate('/');
      return;
    }
    loadTemplates();
  }, [profile, navigate]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await digestService.getTemplates();
      setTemplates(data);

      // Select default template or first template
      const defaultTemplate = data.find(t => t.is_default);
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id);
        setCurrentTemplate(defaultTemplate);
      } else if (data.length > 0) {
        setSelectedTemplateId(data[0].id);
        setCurrentTemplate(data[0]);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      setToast({ message: 'Failed to load templates', tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = async (templateId: string) => {
    if (!templateId) {
      // New template
      setSelectedTemplateId('');
      setCurrentTemplate({
        name: 'New WhatsApp Digest',
        template_type: 'custom_query',
        whatsapp_intro_text: 'Here are the latest apartments posted on Hadirot:',
        whatsapp_outro_text: 'Join the Hadirot WhatsApp Community:\nhttps://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt',
        include_collections: false,
        collection_configs: [],
        listings_time_filter: 'all',
        listings_filter_config: {},
        section_by_filter: null,
        output_format: 'whatsapp'
      });
      return;
    }

    try {
      const template = await digestService.getTemplate(templateId);
      if (template) {
        setSelectedTemplateId(templateId);
        setCurrentTemplate(template);
      }
    } catch (error) {
      console.error('Error loading template:', error);
      setToast({ message: 'Failed to load template', tone: 'error' });
    }
  };

  const handleSaveTemplate = async () => {
    if (!currentTemplate.name?.trim()) {
      setToast({ message: 'Please enter a template name', tone: 'error' });
      return;
    }

    setSaving(true);
    try {
      if (selectedTemplateId) {
        // Update existing
        await digestService.updateTemplate(selectedTemplateId, currentTemplate);
        setToast({ message: 'Template updated successfully', tone: 'success' });
      } else {
        // Create new
        const newTemplate = await digestService.createTemplate(currentTemplate);
        setSelectedTemplateId(newTemplate.id);
        setToast({ message: 'Template created successfully', tone: 'success' });
      }
      loadTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      setToast({ message: 'Failed to save template', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplateId) return;

    if (!confirm('Delete this template? This cannot be undone.')) {
      return;
    }

    try {
      await digestService.deleteTemplate(selectedTemplateId);
      setToast({ message: 'Template deleted successfully', tone: 'success' });
      setSelectedTemplateId('');
      setCurrentTemplate({
        name: 'New WhatsApp Digest',
        template_type: 'custom_query',
        whatsapp_intro_text: 'Here are the latest apartments posted on Hadirot:',
        whatsapp_outro_text: 'Join the Hadirot WhatsApp Community:\nhttps://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt',
        include_collections: false,
        collection_configs: [],
        listings_time_filter: 'all',
        listings_filter_config: {},
        section_by_filter: null,
        output_format: 'whatsapp'
      });
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      setToast({ message: 'Failed to delete template', tone: 'error' });
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleGeneratePreview = async () => {
    setGenerating(true);
    try {
      // Fetch collections data if enabled
      let collections: CollectionLink[] = [];
      if (currentTemplate.include_collections && currentTemplate.collection_configs) {
        collections = await Promise.all(
          (currentTemplate.collection_configs as CollectionConfig[])
            .filter(c => c.enabled)
            .map(async (config) => {
              const count = await getListingCount(config.filters);
              return {
                label: config.label,
                count,
                url: generateBrowseUrl(config.filters),
                enabled: true
              };
            })
        );
      }

      // Fetch listings if filter is configured
      let listings: FormattedListing[] = [];
      const hasListingFilters =
        currentTemplate.listings_time_filter !== 'all' ||
        Object.keys(currentTemplate.listings_filter_config || {}).length > 0;

      if (hasListingFilters) {
        const listingsData = await fetchListings(
          currentTemplate.listings_time_filter || 'all',
          currentTemplate.listings_filter_config || {}
        );

        listings = listingsData.map(listing =>
          WhatsAppFormatter.formatListingData(
            listing,
            (listing as any).short_url_code,
            currentTemplate.section_by_filter as any
          )
        );
      }

      // Generate preview text
      const previewOutput = WhatsAppFormatter.formatDigest({
        introText: currentTemplate.whatsapp_intro_text || '',
        outroText: currentTemplate.whatsapp_outro_text || '',
        collections: collections.length > 0 ? collections : undefined,
        listings: listings.length > 0 ? listings : undefined,
        sectionByFilter: currentTemplate.section_by_filter as any
      });

      setPreviewText(previewOutput);
      setPreviewCollections(collections);
      setPreviewListings(listings);
      setToast({ message: 'Preview generated successfully', tone: 'success' });
    } catch (error) {
      console.error('Error generating preview:', error);
      setToast({ message: 'Failed to generate preview', tone: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(previewText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      setToast({ message: 'Failed to copy to clipboard', tone: 'error' });
    }
  };

  const getListingCount = async (filters: Record<string, any>): Promise<number> => {
    try {
      let query = supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('approved', true)
        .eq('is_active', true);

      // Apply filters
      if (filters.bedrooms !== undefined) {
        if (Array.isArray(filters.bedrooms)) {
          query = query.in('bedrooms', filters.bedrooms);
        } else {
          query = query.eq('bedrooms', filters.bedrooms);
        }
      }

      if (filters.property_type) {
        if (Array.isArray(filters.property_type)) {
          query = query.in('property_type', filters.property_type);
        } else {
          query = query.eq('property_type', filters.property_type);
        }
      }

      if (filters.price_min !== undefined) {
        query = query.gte('price', filters.price_min);
      }

      if (filters.price_max !== undefined) {
        query = query.lte('price', filters.price_max);
      }

      if (filters.broker_fee !== undefined) {
        query = query.eq('broker_fee', filters.broker_fee);
      }

      if (filters.parking !== undefined) {
        query = query.eq('parking', filters.parking);
      }

      const { count } = await query;
      return count || 0;
    } catch (error) {
      console.error('Error getting listing count:', error);
      return 0;
    }
  };

  const fetchListings = async (
    timeFilter: string,
    filterConfig: Record<string, any>
  ): Promise<Listing[]> => {
    try {
      let query = supabase
        .from('listings')
        .select(`
          *,
          owner:profiles!listings_user_id_fkey(full_name, agency),
          short_url:short_urls!short_urls_listing_id_fkey(code)
        `)
        .eq('approved', true)
        .eq('is_active', true);

      // Apply time filter
      if (timeFilter !== 'all') {
        const hours = {
          '24h': 24,
          '48h': 48,
          '3d': 72,
          '7d': 168,
          '14d': 336,
          '30d': 720
        }[timeFilter] || 0;

        if (hours > 0) {
          const cutoffDate = new Date();
          cutoffDate.setHours(cutoffDate.getHours() - hours);
          query = query.gte('created_at', cutoffDate.toISOString());
        }
      }

      // Apply filter config
      if (filterConfig.bedrooms !== undefined) {
        if (Array.isArray(filterConfig.bedrooms)) {
          query = query.in('bedrooms', filterConfig.bedrooms);
        } else {
          query = query.eq('bedrooms', filterConfig.bedrooms);
        }
      }

      if (filterConfig.property_type) {
        if (Array.isArray(filterConfig.property_type)) {
          query = query.in('property_type', filterConfig.property_type);
        } else {
          query = query.eq('property_type', filterConfig.property_type);
        }
      }

      if (filterConfig.price_min !== undefined) {
        query = query.gte('price', filterConfig.price_min);
      }

      if (filterConfig.price_max !== undefined) {
        query = query.lte('price', filterConfig.price_max);
      }

      if (filterConfig.broker_fee !== undefined) {
        query = query.eq('broker_fee', filterConfig.broker_fee);
      }

      if (filterConfig.parking !== undefined) {
        query = query.eq('parking', filterConfig.parking);
      }

      query = query.order('created_at', { ascending: false });
      query = query.limit(100);

      const { data, error } = await query;

      if (error) throw error;

      // Map short_url to short_url_code
      return (data || []).map(listing => ({
        ...listing,
        short_url_code: (listing as any).short_url?.[0]?.code
      }));
    } catch (error) {
      console.error('Error fetching listings:', error);
      return [];
    }
  };

  const generateBrowseUrl = (filters: Record<string, any>): string => {
    const params = new URLSearchParams();

    if (filters.bedrooms !== undefined) {
      if (Array.isArray(filters.bedrooms)) {
        params.set('bedrooms', filters.bedrooms.join(','));
      } else {
        params.set('bedrooms', filters.bedrooms.toString());
      }
    }

    if (filters.property_type) {
      if (Array.isArray(filters.property_type)) {
        params.set('property_type', filters.property_type.join(','));
      } else {
        params.set('property_type', filters.property_type);
      }
    }

    if (filters.price_min !== undefined) {
      params.set('price_min', filters.price_min.toString());
    }

    if (filters.price_max !== undefined) {
      params.set('price_max', filters.price_max.toString());
    }

    if (filters.broker_fee !== undefined) {
      params.set('broker_fee', filters.broker_fee.toString());
    }

    if (filters.parking !== undefined) {
      params.set('parking', filters.parking.toString());
    }

    const queryString = params.toString();
    return `https://hadirot.com/browse${queryString ? '?' + queryString : ''}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading digest manager...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!profile?.is_admin) {
    return null;
  }

  const stats = previewText ? WhatsAppFormatter.getStats(previewText) : { characters: 0, lines: 0 };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Mail className="w-8 h-8 mr-3 text-blue-600" />
            WhatsApp Digest Manager
          </h1>
          <p className="mt-2 text-gray-600">
            Create and manage WhatsApp-formatted digest messages for admins
          </p>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mb-6 p-4 rounded-lg ${toast.tone === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {toast.message}
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Template Editor */}
          <div className="lg:col-span-2 space-y-6">
            {/* Template Selector */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Template</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTemplateSelect('')}
                    className="flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    New
                  </button>
                  {selectedTemplateId && (
                    <button
                      onClick={handleDeleteTemplate}
                      className="flex items-center px-3 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Template
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">New Template</option>
                    {templates.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.name} {template.is_default ? '(Default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template Name
                  </label>
                  <input
                    type="text"
                    value={currentTemplate.name || ''}
                    onChange={(e) => setCurrentTemplate(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Weekly New Listings"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={currentTemplate.description || ''}
                    onChange={(e) => setCurrentTemplate(prev => ({ ...prev, description: e.target.value }))}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Optional description of this template"
                  />
                </div>
              </div>
            </div>

            {/* Introduction Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                type="button"
                onClick={() => toggleSection('intro')}
                className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
              >
                <h3 className="text-lg font-semibold text-gray-900">Introduction (Always Included)</h3>
                {expandedSections.intro ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {expandedSections.intro && (
                <div className="px-6 pb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Introduction Text
                  </label>
                  <textarea
                    value={currentTemplate.whatsapp_intro_text || ''}
                    onChange={(e) => setCurrentTemplate(prev => ({ ...prev, whatsapp_intro_text: e.target.value }))}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Here are the latest apartments posted on Hadirot:"
                  />
                </div>
              )}
            </div>

            {/* Collections Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                type="button"
                onClick={() => toggleSection('collections')}
                className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-gray-900">Collections</h3>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentTemplate(prev => ({ ...prev, include_collections: !prev.include_collections }));
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      currentTemplate.include_collections ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                        currentTemplate.include_collections ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-gray-600">
                    {currentTemplate.include_collections ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                {expandedSections.collections ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {expandedSections.collections && currentTemplate.include_collections && (
                <div className="px-6 pb-6">
                  <CollectionConfigEditor
                    collections={(currentTemplate.collection_configs as CollectionConfig[]) || []}
                    onChange={(collections) => setCurrentTemplate(prev => ({ ...prev, collection_configs: collections }))}
                  />
                </div>
              )}
            </div>

            {/* Listings Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                type="button"
                onClick={() => toggleSection('listings')}
                className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
              >
                <h3 className="text-lg font-semibold text-gray-900">Listings (Optional)</h3>
                {expandedSections.listings ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {expandedSections.listings && (
                <div className="px-6 pb-6">
                  <ListingFilterConfig
                    timeFilter={currentTemplate.listings_time_filter || 'all'}
                    filterConfig={currentTemplate.listings_filter_config || {}}
                    sectionBy={currentTemplate.section_by_filter || null}
                    onTimeFilterChange={(filter) => setCurrentTemplate(prev => ({ ...prev, listings_time_filter: filter }))}
                    onFilterConfigChange={(config) => setCurrentTemplate(prev => ({ ...prev, listings_filter_config: config }))}
                    onSectionByChange={(sectionBy) => setCurrentTemplate(prev => ({ ...prev, section_by_filter: sectionBy }))}
                  />
                </div>
              )}
            </div>

            {/* Conclusion Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                type="button"
                onClick={() => toggleSection('outro')}
                className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
              >
                <h3 className="text-lg font-semibold text-gray-900">Conclusion (Always Included)</h3>
                {expandedSections.outro ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {expandedSections.outro && (
                <div className="px-6 pb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Conclusion Text (WhatsApp Link)
                  </label>
                  <textarea
                    value={currentTemplate.whatsapp_outro_text || ''}
                    onChange={(e) => setCurrentTemplate(prev => ({ ...prev, whatsapp_outro_text: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Join the Hadirot WhatsApp Community:&#10;https://chat.whatsapp.com/..."
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Preview */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sticky top-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>

              {previewText ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 max-h-96 overflow-y-auto">
                    <pre className="text-sm whitespace-pre-wrap font-sans text-gray-900">
                      {previewText}
                    </pre>
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>{stats.characters} characters</span>
                    <span>{stats.lines} lines</span>
                  </div>

                  <button
                    onClick={handleCopyToClipboard}
                    className="w-full flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    {copySuccess ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy to Clipboard
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Eye className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">Click "Generate Preview" to see your digest</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={handleGeneratePreview}
            disabled={generating}
            className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Eye className="w-5 h-5 mr-2" />
                Generate Preview
              </>
            )}
          </button>

          <button
            onClick={handleSaveTemplate}
            disabled={saving}
            className="flex items-center px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                Save Template
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
