import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Save, Eye, Send, Copy, Plus, Edit2, Trash2, ChevronDown, ChevronUp, Check, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { digestService, DigestTemplate, CollectionConfig, ListingGroup } from '@/services/digest';
import { WhatsAppFormatter, CollectionLink, FormattedListing } from '@/utils/whatsappFormatter';
import { supabase, Listing } from '@/config/supabase';
import { CollectionConfigEditor } from '@/components/admin/CollectionConfigEditor';
import { ListingGroupsBuilder } from '@/components/admin/ListingGroupsBuilder';
import { digestGlobalSettingsService } from '@/services/digestGlobalSettings';

export function DigestManager() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Template management
  const [templates, setTemplates] = useState<DigestTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [currentTemplate, setCurrentTemplate] = useState<Partial<DigestTemplate>>({
    name: 'New WhatsApp Digest',
    template_type: 'custom_query',
    use_global_header: true,
    use_global_footer: true,
    custom_header_override: '',
    custom_footer_override: '',
    include_collections: false,
    collection_configs: [],
    section_by_filter: null,
    output_format: 'whatsapp',
    category: 'marketing'
  });

  // Listing groups state (replaces old listings_filter_config)
  const [listingGroups, setListingGroups] = useState<ListingGroup[]>([]);

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

  // Send modal state
  const [showSendModal, setShowSendModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);

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
        use_global_header: true,
        use_global_footer: true,
        custom_header_override: '',
        custom_footer_override: '',
        include_collections: false,
        collection_configs: [],
        section_by_filter: null,
        output_format: 'whatsapp',
        category: 'marketing'
      });
      setListingGroups([]);
      return;
    }

    try {
      const template = await digestService.getTemplate(templateId);
      if (template) {
        setSelectedTemplateId(templateId);
        setCurrentTemplate(template);

        // Extract listing groups from listings_filter_config if it exists
        if (template.listings_filter_config && typeof template.listings_filter_config === 'object') {
          const groups = (template.listings_filter_config as any).groups || [];
          setListingGroups(groups);
        } else {
          setListingGroups([]);
        }
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
      // Prepare template data with listing groups
      const templateData = {
        ...currentTemplate,
        listings_filter_config: {
          groups: listingGroups
        }
      };

      if (selectedTemplateId) {
        // Update existing
        await digestService.updateTemplate(selectedTemplateId, templateData);
        setToast({ message: 'Template updated successfully', tone: 'success' });
      } else {
        // Create new
        const newTemplate = await digestService.createTemplate(templateData);
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

  const createShortUrlForCollection = async (fullUrl: string): Promise<string> => {
    try {
      const urlObj = new URL(fullUrl);
      const shortCode = Math.random().toString(36).substring(2, 8);

      const { data, error } = await supabase
        .from('short_urls')
        .insert({
          short_code: shortCode,
          original_url: fullUrl,
          source: 'digest_collection',
          listing_id: null
        })
        .select('short_code')
        .single();

      if (error) {
        console.warn('Failed to create short URL:', error);
        return fullUrl;
      }

      return `https://hadirot.com/l/${data.short_code}`;
    } catch (error) {
      console.warn('Error creating short URL:', error);
      return fullUrl;
    }
  };

  const handleGeneratePreview = async () => {
    setGenerating(true);
    try {
      console.log('Starting preview generation...');

      // Get global settings for header/footer
      console.log('Fetching global settings...');
      const globalSettings = await digestGlobalSettingsService.getSettings();
      console.log('Global settings:', globalSettings);

      // Determine header and footer text
      const headerText = currentTemplate.use_global_header
        ? globalSettings.default_header_text
        : (currentTemplate.custom_header_override || '');

      const footerText = currentTemplate.use_global_footer
        ? globalSettings.default_footer_text
        : (currentTemplate.custom_footer_override || '');

      console.log('Header text:', headerText);
      console.log('Footer text:', footerText);

      // Fetch collections data if enabled
      let collections: CollectionLink[] = [];
      if (currentTemplate.include_collections && currentTemplate.collection_configs) {
        console.log('Fetching collections...');
        collections = await Promise.all(
          (currentTemplate.collection_configs as CollectionConfig[])
            .filter(c => c.enabled)
            .map(async (config) => {
              const count = await digestService.getCollectionCount(config.filters);
              const fullUrl = generateBrowseUrl(config.filters);
              const shortUrl = await createShortUrlForCollection(fullUrl);
              const ctaText = digestService.formatCollectionCTA(
                config.cta_format || 'Click here to see all {count}+ of our {label}',
                config.label,
                count
              );
              return {
                label: ctaText,
                count,
                url: shortUrl,
                enabled: true
              };
            })
        );
        console.log('Collections:', collections);
      }

      // Fetch listings using listing groups
      let listings: FormattedListing[] = [];
      if (listingGroups.length > 0) {
        console.log('Fetching listings from groups...');
        const enabledGroups = listingGroups.filter(g => g.enabled);
        console.log('Enabled groups:', enabledGroups.length);

        for (const group of enabledGroups) {
          console.log('Fetching group:', group);
          const groupListings = await digestService.fetchListingsByGroup(group);
          console.log('Group listings fetched:', groupListings.length);

          // Format each listing
          const formattedGroupListings = await Promise.all(
            groupListings.map(async (listing) => {
              // short_url is an array from the relationship
              const shortCode = Array.isArray((listing as any).short_url)
                ? (listing as any).short_url[0]?.code
                : (listing as any).short_url?.code;
              return WhatsAppFormatter.formatListingData(
                listing,
                shortCode,
                null
              );
            })
          );

          listings.push(...formattedGroupListings);
        }
        console.log('Total listings formatted:', listings.length);
      }

      // Generate preview text
      console.log('Generating preview text...');
      const previewOutput = WhatsAppFormatter.formatDigest({
        introText: headerText,
        outroText: footerText,
        collections: collections.length > 0 ? collections : undefined,
        listings: listings.length > 0 ? listings : undefined,
        sectionByFilter: null
      });
      console.log('Preview generated successfully');

      setPreviewText(previewOutput);
      setPreviewCollections(collections);
      setPreviewListings(listings);
      setToast({ message: 'Preview generated successfully', tone: 'success' });
    } catch (error) {
      console.error('Error generating preview:', error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      setToast({ message: `Failed to generate preview: ${error instanceof Error ? error.message : 'Unknown error'}`, tone: 'error' });
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

  const handleSendDigest = async (dryRun: boolean = false) => {
    if (!previewText) {
      setToast({ message: 'Please generate a preview first', tone: 'error' });
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      console.log('Sending WhatsApp digest via email...');
      console.log('Preview text length:', previewText.length);

      if (dryRun) {
        // For dry run, just show what would be sent
        console.log('Dry run - would send:', previewText.substring(0, 200) + '...');
        setSendResult({
          success: true,
          dry_run: true,
          listingCount: previewListings.length,
          adminCount: 0,
          message: 'Dry run successful - no emails sent'
        });
        setToast({ message: 'Dry run completed successfully', tone: 'success' });
        return;
      }

      // Send the WhatsApp text via email to admins
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await supabase.functions.invoke('send-email', {
        body: {
          type: 'admin_notification',
          subject: `WhatsApp Digest - ${currentTemplate.name || 'Preview'}`,
          html: `
            <h2>WhatsApp Digest</h2>
            <p>Copy the text below and paste it into WhatsApp:</p>
            <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px; white-space: pre-wrap; font-family: monospace;">${previewText}</pre>
          `
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      console.log('Email response:', response);

      if (response.error) {
        console.error('Email error:', response.error);
        throw new Error(response.error.message || 'Failed to send email');
      }

      // Check if the response data indicates success
      const data = response.data;
      if (!data || (data.error && !data.success)) {
        console.error('Email failed:', data);
        throw new Error(data?.error || data?.message || 'Failed to send email');
      }

      console.log('Email sent successfully:', data);

      // Calculate recipient count from the response
      let recipientCount = 1;
      if (data.to && Array.isArray(data.to)) {
        recipientCount = data.to.length;
      } else if (typeof data.recipientCount === 'number') {
        recipientCount = data.recipientCount;
      }

      setSendResult({
        success: true,
        dry_run: false,
        listingCount: previewListings.length,
        adminCount: recipientCount,
        message: 'WhatsApp digest sent to admin emails'
      });
      setToast({ message: 'Digest sent to admins successfully!', tone: 'success' });
      setShowSendModal(false);
    } catch (error) {
      console.error('Error sending digest:', error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
      setSendResult({
        success: false,
        dry_run: dryRun,
        listingCount: 0,
        adminCount: 0,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      setToast({ message: `Failed to send digest: ${error instanceof Error ? error.message : 'Unknown error'}`, tone: 'error' });
    } finally {
      setSending(false);
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

      if (filterConfig.parking !== undefined && filterConfig.parking !== null && filterConfig.parking !== '') {
        query = query.eq('parking', filterConfig.parking);
      }

      if (filterConfig.location) {
        if (Array.isArray(filterConfig.location)) {
          query = query.in('location', filterConfig.location);
        } else {
          query = query.eq('location', filterConfig.location);
        }
      }

      if (filterConfig.neighborhood) {
        if (Array.isArray(filterConfig.neighborhood)) {
          query = query.in('neighborhood', filterConfig.neighborhood);
        } else {
          query = query.eq('neighborhood', filterConfig.neighborhood);
        }
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <Mail className="w-8 h-8 mr-3 text-blue-600" />
                WhatsApp Digest Manager
              </h1>
              <p className="mt-2 text-gray-600">
                Create and manage WhatsApp-formatted digest messages for admins
              </p>
            </div>
            <button
              onClick={() => navigate('/admin/digest-settings')}
              className="flex items-center px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <SettingsIcon className="w-4 h-4 mr-2" />
              Global Settings
            </button>
          </div>
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
                <div className="px-6 pb-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="use-global-header"
                      checked={currentTemplate.use_global_header ?? true}
                      onChange={(e) => setCurrentTemplate(prev => ({ ...prev, use_global_header: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="use-global-header" className="text-sm font-medium text-gray-700">
                      Use Global Header (can be changed in Global Settings)
                    </label>
                  </div>

                  {!currentTemplate.use_global_header && (
                    <>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Custom Header Text
                      </label>
                      <textarea
                        value={currentTemplate.custom_header_override || ''}
                        onChange={(e) => setCurrentTemplate(prev => ({ ...prev, custom_header_override: e.target.value }))}
                        rows={2}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Here are the latest apartments posted on Hadirot:"
                      />
                    </>
                  )}
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
                  <ListingGroupsBuilder
                    groups={listingGroups}
                    onChange={setListingGroups}
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
                <div className="px-6 pb-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="use-global-footer"
                      checked={currentTemplate.use_global_footer ?? true}
                      onChange={(e) => setCurrentTemplate(prev => ({ ...prev, use_global_footer: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="use-global-footer" className="text-sm font-medium text-gray-700">
                      Use Global Footer (can be changed in Global Settings)
                    </label>
                  </div>

                  {!currentTemplate.use_global_footer && (
                    <>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Custom Footer Text (WhatsApp Link)
                      </label>
                      <textarea
                        value={currentTemplate.custom_footer_override || ''}
                        onChange={(e) => setCurrentTemplate(prev => ({ ...prev, custom_footer_override: e.target.value }))}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Join the Hadirot WhatsApp Community:&#10;https://chat.whatsapp.com/..."
                      />
                    </>
                  )}
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
                  {/* Stats Summary */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-blue-50 rounded p-2 border border-blue-200">
                      <p className="text-xs text-blue-600 font-medium">Collections</p>
                      <p className="text-lg font-bold text-blue-900">{previewCollections.length}</p>
                    </div>
                    <div className="bg-green-50 rounded p-2 border border-green-200">
                      <p className="text-xs text-green-600 font-medium">Listings</p>
                      <p className="text-lg font-bold text-green-900">{previewListings.length}</p>
                    </div>
                  </div>

                  {/* Collections Preview */}
                  {previewCollections.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-3">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">Collections</h3>
                      <div className="space-y-2">
                        {previewCollections.map((collection, idx) => (
                          <div key={idx} className="bg-gray-50 rounded p-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900">{collection.label}</span>
                              <span className="text-blue-600 font-semibold">{collection.count}</span>
                            </div>
                            <a
                              href={collection.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline truncate block mt-1"
                            >
                              {collection.url}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Listings Preview */}
                  {previewListings.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-3">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">
                        Listings ({previewListings.length})
                      </h3>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {previewListings.slice(0, 5).map((listing, idx) => (
                          <div key={idx} className="bg-gray-50 rounded p-2 text-xs">
                            <div className="font-semibold text-gray-900">{listing.price}</div>
                            <div className="text-gray-600">{listing.specs}</div>
                            <div className="text-gray-500 truncate">{listing.location}</div>
                          </div>
                        ))}
                        {previewListings.length > 5 && (
                          <div className="text-center text-xs text-gray-500 py-2">
                            +{previewListings.length - 5} more listings
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* WhatsApp Text Preview */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">WhatsApp Format</h3>
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 max-h-64 overflow-y-auto">
                      <pre className="text-xs whitespace-pre-wrap font-sans text-gray-900">
                        {previewText}
                      </pre>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-600 pt-2 border-t border-gray-200">
                    <span>{stats.characters} chars</span>
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

          <button
            onClick={() => setShowSendModal(true)}
            disabled={!previewText || previewListings.length === 0 && previewCollections.length === 0}
            className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5 mr-2" />
            Send Digest
          </button>
        </div>

        {/* Send Confirmation Modal */}
        {showSendModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Send WhatsApp Digest</h2>
                <button
                  onClick={() => setShowSendModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <span className="text-2xl">&times;</span>
                </button>
              </div>

              <div className="p-6 space-y-4">
                {sendResult ? (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-lg ${
                      sendResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                    }`}>
                      <h3 className={`font-semibold mb-2 ${
                        sendResult.success ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {sendResult.success ? 'Send Successful!' : 'Send Failed'}
                      </h3>
                      {sendResult.message && (
                        <p className={sendResult.success ? 'text-green-700' : 'text-red-700'}>
                          {sendResult.message}
                        </p>
                      )}
                    </div>

                    {sendResult.success && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                          <p className="text-sm text-blue-600 font-medium">Recipients</p>
                          <p className="text-2xl font-bold text-blue-900">{sendResult.adminCount || 0}</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                          <p className="text-sm text-green-600 font-medium">Listings</p>
                          <p className="text-2xl font-bold text-green-900">{sendResult.listingCount || 0}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-800">
                        This will email the WhatsApp digest text to all admin users so they can easily copy and paste it into WhatsApp. You can do a dry run first to test without actually sending emails.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between py-2 border-b border-gray-200">
                        <span className="text-gray-700">Collections:</span>
                        <span className="font-semibold text-gray-900">{previewCollections.length}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-gray-200">
                        <span className="text-gray-700">Listings:</span>
                        <span className="font-semibold text-gray-900">{previewListings.length}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-gray-700">Characters:</span>
                        <span className="font-semibold text-gray-900">{stats.characters}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => {
                    setShowSendModal(false);
                    setSendResult(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {sendResult ? 'Close' : 'Cancel'}
                </button>
                {!sendResult && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleSendDigest(true)}
                      disabled={sending}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {sending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4 mr-2" />
                          Dry Run
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleSendDigest(false)}
                      disabled={sending}
                      className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {sending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Send Now
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
