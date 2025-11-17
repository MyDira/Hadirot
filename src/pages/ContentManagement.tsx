import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FileText, Star, MessageSquare, Save, Trash2, Plus, Eye, EyeOff, Edit2, X, Settings, Search, ChevronLeft, Monitor, Smartphone, BarChart3, Users, Power, Mail, Send, Clock, CheckCircle, XCircle, AlertCircle, Image } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { staticPagesService, StaticPage } from '../services/staticPages';
import { modalsService, ModalPopup, CreateModalInput } from '../services/modals';
import { bannersService, CreateBannerInput } from '../services/banners';
import { digestService, DigestTemplate } from '../services/digest';
import { supabase, Profile, HeroBanner, BannerButton } from '../config/supabase';
import { ModalPreview } from '../components/admin/ModalPreview';
import { ModalManagement } from '../components/admin/ModalManagement';
import { ModalEditor } from '../components/admin/ModalEditor';
import { BannerManagement } from '../components/admin/BannerManagement';
import { BannerEditor } from '../components/admin/BannerEditor';

const CONTENT_TAB_KEYS = ['static-pages', 'featured', 'modals', 'hero-banners', 'email-tools'] as const;
type ContentTabKey = (typeof CONTENT_TAB_KEYS)[number];

const isValidContentTab = (value: string | null): value is ContentTabKey =>
  value !== null && CONTENT_TAB_KEYS.includes(value as ContentTabKey);

const CONTENT_TABS: { id: ContentTabKey; label: string; icon: React.ElementType }[] = [
  { id: 'static-pages', label: 'Static Pages', icon: FileText },
  { id: 'featured', label: 'Featured Settings', icon: Star },
  { id: 'modals', label: 'Modal Popups', icon: MessageSquare },
  { id: 'hero-banners', label: 'Hero Banners', icon: Image },
  { id: 'email-tools', label: 'Email Tools', icon: Mail },
];

export function ContentManagement() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawTabParam = params.get('tab');
  const initialTab: ContentTabKey = isValidContentTab(rawTabParam) ? rawTabParam : 'static-pages';
  const [activeTab, setActiveTab] = useState<ContentTabKey>(initialTab);
  const [loading, setLoading] = useState(true);

  // Static Pages state
  const [staticPages, setStaticPages] = useState<StaticPage[]>([]);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [pageEdits, setPageEdits] = useState<{ [key: string]: { title: string; content: string } }>({});

  // Featured Settings state
  const [users, setUsers] = useState<Profile[]>([]);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Modals state
  const [modals, setModals] = useState<ModalPopup[]>([]);
  const [editingModalId, setEditingModalId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalForm, setModalForm] = useState<CreateModalInput>({
    name: '',
    heading: '',
    subheading: '',
    additional_text_lines: [],
    button_text: '',
    button_url: '',
    is_active: false,
    trigger_pages: [],
    display_frequency: 'once_per_session',
    delay_seconds: 0,
    priority: 0,
  });
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [modalStats, setModalStats] = useState<{ [key: string]: { totalShown: number; totalClicked: number; totalDismissed: number; clickThroughRate: number } }>({});
  const [selectedModal, setSelectedModal] = useState<ModalPopup | null>(null);

  // Featured Settings state
  const [globalFeaturedLimit, setGlobalFeaturedLimit] = useState<number>(9);
  const [perUserFeaturedLimit, setPerUserFeaturedLimit] = useState<number>(0);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [savingGlobalSettings, setSavingGlobalSettings] = useState(false);

  // Static Pages state
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [showPageEditor, setShowPageEditor] = useState(false);

  // Email Tools state
  const [digestConfig, setDigestConfig] = useState<any>(null);
  const [digestLogs, setDigestLogs] = useState<any[]>([]);
  const [sendingTestDigest, setSendingTestDigest] = useState(false);
  const [loadingEmailData, setLoadingEmailData] = useState(false);
  const [updatingConfig, setUpdatingConfig] = useState(false);
  const [editingDeliveryTime, setEditingDeliveryTime] = useState(false);
  const [tempDeliveryTime, setTempDeliveryTime] = useState('');
  const [digestTemplates, setDigestTemplates] = useState<DigestTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [showDigestPreview, setShowDigestPreview] = useState(false);
  const [digestPreview, setDigestPreview] = useState<any>(null);

  // Hero Banners state
  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [showCreateBanner, setShowCreateBanner] = useState(false);
  const [selectedBanner, setSelectedBanner] = useState<HeroBanner | null>(null);

  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!profile?.is_admin) {
      navigate('/');
      return;
    }

    const normalized: ContentTabKey = isValidContentTab(rawTabParam) ? rawTabParam : 'static-pages';
    if (normalized !== activeTab) {
      setActiveTab(normalized);
    }
    if (normalized !== rawTabParam) {
      setParams(prev => {
        const search = new URLSearchParams(prev);
        search.set('tab', normalized);
        return search;
      }, { replace: true });
    }
  }, [rawTabParam, profile, navigate]);

  useEffect(() => {
    if (profile?.is_admin) {
      loadData();
    }
  }, [activeTab, profile]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleTabChange = (nextTab: ContentTabKey) => {
    setActiveTab(nextTab);
    setParams(prev => {
      const search = new URLSearchParams(prev);
      search.set('tab', nextTab);
      return search;
    }, { replace: true });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'static-pages') {
        const pages = await staticPagesService.getAllStaticPages();
        setStaticPages(pages);
        if (pages.length > 0 && !selectedPageId) {
          setSelectedPageId(pages[0].id);
        }
      } else if (activeTab === 'featured') {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('full_name');
        if (!error && data) {
          setUsers(data);
        }

        // Load global settings
        const { data: settingsData } = await supabase
          .from('admin_settings')
          .select('max_featured_listings, max_featured_per_user')
          .single();

        if (settingsData) {
          setGlobalFeaturedLimit(settingsData.max_featured_listings || 9);
          setPerUserFeaturedLimit(settingsData.max_featured_per_user || 0);
        }
      } else if (activeTab === 'modals') {
        const allModals = await modalsService.getAllModals();
        setModals(allModals);

        // Load statistics for each modal
        const stats: { [key: string]: any } = {};
        for (const modal of allModals) {
          try {
            const modalStats = await modalsService.getModalStatistics(modal.id);
            stats[modal.id] = modalStats;
          } catch (e) {
            console.error('Error loading stats for modal:', modal.id, e);
          }
        }
        setModalStats(stats);
      } else if (activeTab === 'hero-banners') {
        const allBanners = await bannersService.getAllBanners();
        setBanners(allBanners);
      } else if (activeTab === 'email-tools') {
        await loadEmailTools();
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setToast({ message: 'Failed to load data', tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadEmailTools = async () => {
    setLoadingEmailData(true);
    try {
      // Load digest configuration
      const { data: configData, error: configError } = await supabase
        .from('daily_admin_digest_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (configError) {
        console.error('Error loading digest config:', configError);
      } else {
        setDigestConfig(configData);
      }

      // Load recent digest logs
      const { data: logsData, error: logsError } = await supabase
        .from('daily_admin_digest_logs')
        .select('*')
        .order('run_at', { ascending: false })
        .limit(10);

      if (logsError) {
        console.error('Error loading digest logs:', logsError);
      } else {
        setDigestLogs(logsData || []);
      }

      // Load digest templates
      try {
        const templates = await digestService.getTemplates();
        setDigestTemplates(templates);
        // Set default template as selected
        const defaultTemplate = templates.find(t => t.is_default);
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
        }
      } catch (error) {
        console.error('Error loading digest templates:', error);
      }
    } catch (error) {
      console.error('Error loading email tools data:', error);
      setToast({ message: 'Failed to load email tools data', tone: 'error' });
    } finally {
      setLoadingEmailData(false);
    }
  };

  const previewDigest = async () => {
    try {
      const result = await digestService.sendDigest({
        template_id: selectedTemplateId || undefined,
        dry_run: true,
      });

      setDigestPreview(result);
      setShowDigestPreview(true);
      setToast({ message: 'Preview loaded successfully', tone: 'success' });
    } catch (error) {
      console.error('Error previewing digest:', error);
      setToast({ message: error instanceof Error ? error.message : 'Failed to preview digest', tone: 'error' });
    }
  };

  const sendTestDigest = async () => {
    const selectedTemplate = digestTemplates.find(t => t.id === selectedTemplateId);
    const confirmMessage = selectedTemplate
      ? `Send digest using "${selectedTemplate.name}" template? This will send an email to all admins.`
      : 'Send digest email now? This will send an email to all admins.';

    if (!confirm(confirmMessage)) {
      return;
    }

    setSendingTestDigest(true);
    try {
      const result = await digestService.sendDigest({
        template_id: selectedTemplateId || undefined,
        dry_run: false,
      });

      if (result.listingCount === 0) {
        setToast({ message: 'No listings to send in the digest.', tone: 'success' });
      } else {
        setToast({
          message: `Digest sent successfully! ${result.listingCount} listing(s) sent to ${result.adminCount} admin(s).`,
          tone: 'success'
        });
      }

      await loadEmailTools();
    } catch (error) {
      console.error('Error sending digest:', error);
      setToast({
        message: error instanceof Error ? error.message : 'Failed to send digest',
        tone: 'error'
      });
    } finally {
      setSendingTestDigest(false);
    }
  };

  const toggleDigestEnabled = async () => {
    if (!digestConfig) return;

    setUpdatingConfig(true);
    try {
      const newEnabledState = !digestConfig.enabled;

      const { error } = await supabase
        .from('daily_admin_digest_config')
        .update({ enabled: newEnabledState, updated_at: new Date().toISOString() })
        .eq('id', digestConfig.id);

      if (error) {
        console.error('Error updating digest config:', error);
        setToast({ message: 'Failed to update configuration', tone: 'error' });
        return;
      }

      setDigestConfig({ ...digestConfig, enabled: newEnabledState });
      setToast({
        message: `Daily digest ${newEnabledState ? 'enabled' : 'disabled'} successfully`,
        tone: 'success'
      });
    } catch (error) {
      console.error('Error toggling digest:', error);
      setToast({ message: 'Failed to update configuration', tone: 'error' });
    } finally {
      setUpdatingConfig(false);
    }
  };

  const updateDeliveryTime = async () => {
    if (!digestConfig || !tempDeliveryTime) return;

    setUpdatingConfig(true);
    try {
      const { error } = await supabase
        .from('daily_admin_digest_config')
        .update({ delivery_time: tempDeliveryTime, updated_at: new Date().toISOString() })
        .eq('id', digestConfig.id);

      if (error) {
        console.error('Error updating delivery time:', error);
        setToast({ message: 'Failed to update delivery time', tone: 'error' });
        return;
      }

      setDigestConfig({ ...digestConfig, delivery_time: tempDeliveryTime });
      setEditingDeliveryTime(false);
      setToast({ message: 'Delivery time updated successfully', tone: 'success' });
    } catch (error) {
      console.error('Error updating delivery time:', error);
      setToast({ message: 'Failed to update delivery time', tone: 'error' });
    } finally {
      setUpdatingConfig(false);
    }
  };

  const handleEditPage = (pageId: string) => {
    const page = staticPages.find(p => p.id === pageId);
    if (page) {
      setPageEdits(prev => ({
        ...prev,
        [pageId]: { title: page.title, content: page.content }
      }));
      setEditingPageId(pageId);
    }
  };

  const handleSavePage = async (pageId: string) => {
    try {
      const edits = pageEdits[pageId];
      if (!edits) return;

      await staticPagesService.updateStaticPage(pageId, {
        title: edits.title,
        content: edits.content,
      });

      setToast({ message: 'Page updated successfully', tone: 'success' });
      setEditingPageId(null);
      loadData();
    } catch (error) {
      console.error('Error saving page:', error);
      setToast({ message: 'Failed to save page', tone: 'error' });
    }
  };

  const handleCancelEdit = (pageId: string) => {
    setEditingPageId(null);
    setPageEdits(prev => {
      const updated = { ...prev };
      delete updated[pageId];
      return updated;
    });
  };

  const handleUpdateFeaturedLimit = async (userId: string, newLimit: number) => {
    setUpdatingUserId(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ max_featured_listings_per_user: newLimit })
        .eq('id', userId);

      if (error) throw error;

      setToast({ message: 'Featured limit updated successfully', tone: 'success' });
      loadData();
    } catch (error) {
      console.error('Error updating featured limit:', error);
      setToast({ message: 'Failed to update featured limit', tone: 'error' });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleModalActive = async (modalId: string, currentActive: boolean) => {
    try {
      await modalsService.updateModal(modalId, { is_active: !currentActive });
      setToast({ message: `Modal ${!currentActive ? 'activated' : 'deactivated'}`, tone: 'success' });
      loadData();
    } catch (error) {
      console.error('Error toggling modal:', error);
      setToast({ message: 'Failed to toggle modal status', tone: 'error' });
    }
  };

  const handleDeleteModal = async (modalId: string) => {
    if (!confirm('Are you sure you want to delete this modal?')) return;

    try {
      await modalsService.deleteModal(modalId);
      setToast({ message: 'Modal deleted successfully', tone: 'success' });
      loadData();
    } catch (error) {
      console.error('Error deleting modal:', error);
      setToast({ message: 'Failed to delete modal', tone: 'error' });
    }
  };

  const handleCreateModal = async () => {
    try {
      const newModal = await modalsService.createModal(modalForm);
      setToast({ message: 'Modal created successfully', tone: 'success' });
      setShowCreateModal(false);
      setSelectedModal(newModal);
      setEditingModalId(newModal.id);
      setModalForm({
        name: '',
        heading: '',
        subheading: '',
        additional_text_lines: [],
        button_text: '',
        button_url: '',
        is_active: false,
        trigger_pages: [],
        display_frequency: 'once_per_session',
        delay_seconds: 0,
        priority: 0,
      });
      loadData();
    } catch (error) {
      console.error('Error creating modal:', error);
      setToast({ message: 'Failed to create modal', tone: 'error' });
    }
  };

  const handleEditModal = (modal: ModalPopup) => {
    setSelectedModal(modal);
    setEditingModalId(modal.id);
    setModalForm({
      name: modal.name,
      heading: modal.heading,
      subheading: modal.subheading || '',
      additional_text_lines: modal.additional_text_lines || [],
      button_text: modal.button_text,
      button_url: modal.button_url,
      is_active: modal.is_active,
      trigger_pages: modal.trigger_pages || [],
      display_frequency: modal.display_frequency,
      custom_interval_hours: modal.custom_interval_hours,
      delay_seconds: modal.delay_seconds,
      priority: modal.priority,
    });
  };

  const handleSaveModal = async () => {
    if (!editingModalId) return;

    try {
      await modalsService.updateModal(editingModalId, modalForm);
      setToast({ message: 'Modal updated successfully', tone: 'success' });
      setEditingModalId(null);
      setSelectedModal(null);
      loadData();
    } catch (error) {
      console.error('Error updating modal:', error);
      setToast({ message: 'Failed to update modal', tone: 'error' });
    }
  };

  const handleCancelModalEdit = () => {
    setEditingModalId(null);
    setSelectedModal(null);
    setModalForm({
      name: '',
      heading: '',
      subheading: '',
      additional_text_lines: [],
      button_text: '',
      button_url: '',
      is_active: false,
      trigger_pages: [],
      display_frequency: 'once_per_session',
      delay_seconds: 0,
      priority: 0,
    });
  };

  const handleSaveGlobalSettings = async () => {
    setSavingGlobalSettings(true);
    try {
      const { error } = await supabase
        .from('admin_settings')
        .update({
          max_featured_listings: globalFeaturedLimit,
          max_featured_per_user: perUserFeaturedLimit,
        })
        .eq('id', (await supabase.from('admin_settings').select('id').single()).data?.id);

      if (error) throw error;

      setToast({ message: 'Global settings saved successfully', tone: 'success' });
    } catch (error) {
      console.error('Error saving global settings:', error);
      setToast({ message: 'Failed to save global settings', tone: 'error' });
    } finally {
      setSavingGlobalSettings(false);
    }
  };

  const handleToggleBannerActive = async (bannerId: string, currentActive: boolean) => {
    try {
      await bannersService.updateBanner(bannerId, { is_active: !currentActive });
      setToast({ message: `Banner ${!currentActive ? 'activated' : 'deactivated'}`, tone: 'success' });
      loadData();
    } catch (error) {
      console.error('Error toggling banner:', error);
      setToast({ message: 'Failed to toggle banner status', tone: 'error' });
    }
  };

  const handleDeleteBanner = async (bannerId: string) => {
    if (!confirm('Are you sure you want to delete this banner?')) return;

    try {
      await bannersService.deleteBanner(bannerId);
      setToast({ message: 'Banner deleted successfully', tone: 'success' });
      loadData();
    } catch (error) {
      console.error('Error deleting banner:', error);
      setToast({ message: 'Failed to delete banner', tone: 'error' });
    }
  };

  const handleCreateBanner = () => {
    setShowCreateBanner(true);
    setEditingBannerId(null);
    setSelectedBanner(null);
  };

  const handleEditBanner = (banner: HeroBanner) => {
    setSelectedBanner(banner);
    setEditingBannerId(banner.id);
    setShowCreateBanner(false);
  };

  const handleSaveBanner = async (bannerData: any, buttons: any[]) => {
    try {
      // Filter out buttons with empty text or URL
      const validButtons = buttons.filter(
        button => button.button_text && button.button_text.trim() &&
                  button.button_url && button.button_url.trim()
      );

      if (validButtons.length === 0) {
        setToast({ message: 'At least one button is required', tone: 'error' });
        return;
      }

      if (editingBannerId) {
        await bannersService.updateBanner(editingBannerId, bannerData);
        await bannersService.deleteButtonsByBannerId(editingBannerId);
        for (const button of validButtons) {
          await bannersService.createButton({
            banner_id: editingBannerId,
            button_text: button.button_text,
            button_url: button.button_url,
            button_style: button.button_style || 'primary',
            icon_name: button.icon_name || undefined,
            display_order: button.display_order || 0
          });
        }
        setToast({ message: 'Banner updated successfully', tone: 'success' });
      } else {
        const newBanner = await bannersService.createBanner(bannerData);
        for (const button of validButtons) {
          await bannersService.createButton({
            banner_id: newBanner.id,
            button_text: button.button_text,
            button_url: button.button_url,
            button_style: button.button_style || 'primary',
            icon_name: button.icon_name || undefined,
            display_order: button.display_order || 0
          });
        }
        setToast({ message: 'Banner created successfully', tone: 'success' });
      }
      setEditingBannerId(null);
      setSelectedBanner(null);
      setShowCreateBanner(false);
      loadData();
    } catch (error: any) {
      console.error('Error saving banner:', error);
      const errorMessage = error?.message || 'Failed to save banner';
      setToast({ message: errorMessage, tone: 'error' });
    }
  };

  const handleCancelBannerEdit = () => {
    setEditingBannerId(null);
    setSelectedBanner(null);
    setShowCreateBanner(false);
  };

  const handleReorderBanner = async (bannerId: string, direction: 'up' | 'down') => {
    const currentIndex = banners.findIndex(b => b.id === bannerId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= banners.length) return;

    try {
      await bannersService.updateBanner(banners[currentIndex].id, { display_order: targetIndex });
      await bannersService.updateBanner(banners[targetIndex].id, { display_order: currentIndex });
      setToast({ message: 'Banner order updated', tone: 'success' });
      loadData();
    } catch (error) {
      console.error('Error reordering banner:', error);
      setToast({ message: 'Failed to reorder banner', tone: 'error' });
    }
  };

  if (!profile?.is_admin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Content Management</h1>
          <p className="mt-2 text-gray-600">Manage static pages, featured settings, and modal popups</p>
        </div>

        {toast && (
          <div className={`mb-6 p-4 rounded-lg ${toast.tone === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {toast.message}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {CONTENT_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`flex items-center px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-brand-600 text-brand-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-2" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <>
                {activeTab === 'static-pages' && (
                  <div className="flex gap-6 h-[calc(100vh-300px)]">
                    {/* Page Selector Sidebar */}
                    <div className="w-80 flex-shrink-0 border-r border-gray-200 pr-6">
                      <div className="space-y-4">
                        <button
                          className="w-full flex items-center justify-center px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Create New Page
                        </button>

                        <div className="space-y-2">
                          {staticPages.map((page) => (
                            <button
                              key={page.id}
                              onClick={() => {
                                setSelectedPageId(page.id);
                                setEditingPageId(page.id);
                                handleEditPage(page.id);
                              }}
                              className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                                selectedPageId === page.id
                                  ? 'bg-gray-800 text-white'
                                  : 'bg-white border border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <div className="font-medium">{page.title}</div>
                            </button>
                          ))}
                        </div>

                        {staticPages.length > 0 && (
                          <div className="text-xs text-gray-500 pt-4">
                            Last updated: {new Date().toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Page Editor */}
                    {selectedPageId && editingPageId && (
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-xl font-bold text-gray-900">
                            Editing: {staticPages.find(p => p.id === selectedPageId)?.title}
                          </h2>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleCancelEdit(selectedPageId)}
                              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSavePage(selectedPageId)}
                              className="flex items-center px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600"
                            >
                              <Save className="w-4 h-4 mr-2" />
                              Save
                            </button>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Page Title
                            </label>
                            <input
                              type="text"
                              value={pageEdits[selectedPageId]?.title || ''}
                              onChange={(e) => setPageEdits(prev => ({
                                ...prev,
                                [selectedPageId]: { ...prev[selectedPageId], title: e.target.value, content: prev[selectedPageId]?.content || '' }
                              }))}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                              placeholder="Page Title"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Page Content
                            </label>
                            <textarea
                              value={pageEdits[selectedPageId]?.content || ''}
                              onChange={(e) => setPageEdits(prev => ({
                                ...prev,
                                [selectedPageId]: { ...prev[selectedPageId], title: prev[selectedPageId]?.title || '', content: e.target.value }
                              }))}
                              rows={20}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                              placeholder="HTML Content"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {!selectedPageId && (
                      <div className="flex-1 flex items-center justify-center text-gray-500">
                        Select a page to edit or create a new one
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'featured' && (
                  <div className="space-y-8">
                    {/* Global Limits Section */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                      <div className="flex items-center mb-6">
                        <Settings className="w-5 h-5 text-gray-600 mr-2" />
                        <h2 className="text-xl font-bold text-gray-900">Global Limits</h2>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Maximum Featured Listings (Platform-wide)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={globalFeaturedLimit}
                            onChange={(e) => setGlobalFeaturedLimit(parseInt(e.target.value) || 0)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent text-2xl font-semibold text-center"
                          />
                          <p className="mt-2 text-xs text-gray-500">
                            Total number of listings that can be featured at once across the entire platform
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Maximum Per User
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={perUserFeaturedLimit}
                            onChange={(e) => setPerUserFeaturedLimit(parseInt(e.target.value) || 0)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent text-2xl font-semibold text-center"
                          />
                          <p className="mt-2 text-xs text-gray-500">
                            Maximum number of listings each user can feature simultaneously
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={handleSaveGlobalSettings}
                          disabled={savingGlobalSettings}
                          className="flex items-center px-6 py-3 bg-accent-500 text-white rounded-lg hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                          <Save className="w-4 h-4 mr-2" />
                          {savingGlobalSettings ? 'Saving...' : 'Save Settings'}
                        </button>
                      </div>
                    </div>

                    {/* User Permissions Section */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                      <div className="flex items-center mb-6">
                        <Users className="w-5 h-5 text-gray-600 mr-2" />
                        <h2 className="text-xl font-bold text-gray-900">User Permissions</h2>
                      </div>

                      {/* Search Bar */}
                      <div className="mb-6">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search users by name, email, agency, or role..."
                            value={userSearchTerm}
                            onChange={(e) => setUserSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                          />
                        </div>
                      </div>

                      {/* User Table */}
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                <input type="checkbox" className="rounded" />
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                User
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Role
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Listings
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Featured
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Max Featured (User)
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {users
                              .filter(user =>
                                !userSearchTerm ||
                                user.full_name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                                user.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                                (user.agency && user.agency.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
                                user.role.toLowerCase().includes(userSearchTerm.toLowerCase())
                              )
                              .map((user) => (
                              <tr key={user.id} className="hover:bg-gray-50">
                                <td className="px-4 py-4">
                                  <input type="checkbox" className="rounded" />
                                </td>
                                <td className="px-4 py-4">
                                  <div>
                                    <div className="font-medium text-gray-900">{user.full_name}</div>
                                    <div className="text-sm text-gray-500">{user.email}</div>
                                    {user.agency && (
                                      <div className="text-xs text-gray-400">{user.agency}</div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                    user.role === 'landlord' ? 'bg-green-100 text-green-800' :
                                    user.role === 'agent' ? 'bg-blue-100 text-blue-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {user.role}
                                  </span>
                                </td>
                                <td className="px-4 py-4 text-sm text-gray-900">
                                  1
                                </td>
                                <td className="px-4 py-4 text-sm text-gray-900">
                                  0 / 0
                                </td>
                                <td className="px-4 py-4">
                                  <input
                                    type="number"
                                    min="0"
                                    value={user.max_featured_listings_per_user || 0}
                                    onChange={(e) => handleUpdateFeaturedLimit(user.id, parseInt(e.target.value) || 0)}
                                    disabled={updatingUserId === user.id}
                                    className="w-20 px-3 py-2 border border-gray-300 rounded-md text-center focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                                  />
                                </td>
                                <td className="px-4 py-4 text-sm">
                                  <div className="flex items-center gap-2">
                                    <button className="text-blue-600 hover:text-blue-800 font-medium">
                                      Default
                                    </button>
                                    <button className="text-red-600 hover:text-red-800 font-medium">
                                      Remove
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'modals' && (
                  <>
                    {editingModalId || showCreateModal ? (
                      <ModalEditor
                        modalForm={modalForm}
                        isEditing={!!editingModalId}
                        onSave={editingModalId ? handleSaveModal : handleCreateModal}
                        onCancel={handleCancelModalEdit}
                        onChange={(updates) => setModalForm(prev => ({ ...prev, ...updates }))}
                      />
                    ) : (
                      <ModalManagement
                        modals={modals}
                        modalStats={modalStats}
                        onToggleActive={handleToggleModalActive}
                        onDelete={handleDeleteModal}
                        onCreate={() => {
                          setShowCreateModal(true);
                          setModalForm({
                            name: '',
                            heading: '',
                            subheading: '',
                            additional_text_lines: [],
                            button_text: '',
                            button_url: '',
                            is_active: false,
                            trigger_pages: [],
                            display_frequency: 'once_per_session',
                            delay_seconds: 3,
                            priority: 100,
                          });
                        }}
                        onEdit={handleEditModal}
                      />
                    )}
                  </>
                )}

                {activeTab === 'hero-banners' && (
                  <>
                    {editingBannerId || showCreateBanner ? (
                      <BannerEditor
                        banner={selectedBanner}
                        isEditing={!!editingBannerId}
                        onSave={handleSaveBanner}
                        onCancel={handleCancelBannerEdit}
                      />
                    ) : (
                      <BannerManagement
                        banners={banners}
                        onToggleActive={handleToggleBannerActive}
                        onDelete={handleDeleteBanner}
                        onCreate={handleCreateBanner}
                        onEdit={handleEditBanner}
                        onReorder={handleReorderBanner}
                      />
                    )}
                  </>
                )}

                {activeTab === 'email-tools' && (
                  <div className="space-y-6">
                    {/* Configuration Status Section */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center">
                          <Mail className="w-6 h-6 text-blue-600 mr-3" />
                          <div>
                            <h2 className="text-xl font-bold text-gray-900">Daily Digest Email System</h2>
                            <p className="text-sm text-gray-600 mt-1">
                              Automatically sends digest emails to admins with new approved listings
                            </p>
                          </div>
                        </div>
                      </div>

                      {loadingEmailData ? (
                        <div className="text-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                          <p className="text-gray-600 mt-2">Loading configuration...</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Status with Toggle */}
                            <div className="bg-gray-50 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-700">Automated Digest</span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={digestConfig?.enabled}
                                  onClick={toggleDigestEnabled}
                                  disabled={updatingConfig}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                    digestConfig?.enabled ? 'bg-green-600' : 'bg-gray-300'
                                  } ${updatingConfig ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
                                >
                                  <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                                      digestConfig?.enabled ? 'translate-x-5' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              </div>
                              <div className={`flex items-center ${digestConfig?.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                                {digestConfig?.enabled ? (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    <span className="text-xs font-semibold">Active</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-4 h-4 mr-1" />
                                    <span className="text-xs font-semibold">Inactive</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Delivery Time with Editor */}
                            <div className="bg-gray-50 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-700">Delivery Time</span>
                                {!editingDeliveryTime && (
                                  <button
                                    onClick={() => {
                                      setEditingDeliveryTime(true);
                                      setTempDeliveryTime(digestConfig?.delivery_time || '09:00:00');
                                    }}
                                    className="text-blue-600 hover:text-blue-800 transition-colors"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                              {editingDeliveryTime ? (
                                <div className="space-y-2">
                                  <input
                                    type="time"
                                    value={tempDeliveryTime}
                                    onChange={(e) => setTempDeliveryTime(e.target.value)}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={updateDeliveryTime}
                                      disabled={updatingConfig}
                                      className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingDeliveryTime(false)}
                                      className="flex-1 px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center text-gray-900">
                                  <Clock className="w-4 h-4 mr-1 text-blue-600" />
                                  <span className="text-xs font-semibold">
                                    {digestConfig?.delivery_time ? new Date('2000-01-01T' + digestConfig.delivery_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'N/A'} EST
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Last Run */}
                            <div className="bg-gray-50 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-700">Last Successful Run</span>
                              </div>
                              <div className="flex items-center text-gray-900">
                                <BarChart3 className="w-4 h-4 mr-1 text-blue-600" />
                                <span className="text-xs font-semibold">
                                  {digestLogs.find(log => log.success)
                                    ? new Date(digestLogs.find(log => log.success)!.run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                    : 'Never'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Info Box */}
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-start">
                              <AlertCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                              <div className="text-sm text-blue-900">
                                <p className="font-medium mb-1">How it works:</p>
                                <ul className="list-disc list-inside space-y-1 text-blue-800">
                                  <li>When <strong>Active</strong>, the system sends automatic digest emails at the scheduled time</li>
                                  <li>You can manually trigger a digest anytime using the button below</li>
                                  <li>Manual triggers work regardless of the Active/Inactive status</li>
                                  <li>Emails include all approved listings from the past 24 hours</li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Send Digest Section */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Send Digest Email</h3>

                      {/* Template Selector */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Select Digest Template
                        </label>
                        <select
                          value={selectedTemplateId}
                          onChange={(e) => setSelectedTemplateId(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          {digestTemplates.length === 0 ? (
                            <option value="">No templates available</option>
                          ) : (
                            digestTemplates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.name} {template.is_default ? '(Default)' : ''}
                              </option>
                            ))
                          )}
                        </select>
                        {selectedTemplateId && digestTemplates.find(t => t.id === selectedTemplateId) && (
                          <p className="mt-2 text-sm text-gray-600">
                            {digestTemplates.find(t => t.id === selectedTemplateId)?.description || 'No description available'}
                          </p>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3">
                        <button
                          onClick={previewDigest}
                          disabled={!selectedTemplateId || sendingTestDigest}
                          className="flex items-center px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </button>
                        <button
                          onClick={sendTestDigest}
                          disabled={!selectedTemplateId || sendingTestDigest}
                          className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors shadow-md"
                        >
                          {sendingTestDigest ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Send className="w-5 h-5 mr-2" />
                              Send Now
                            </>
                          )}
                        </button>
                      </div>

                      <p className="mt-4 text-xs text-gray-500">
                        This will send an email to all admins based on the selected template configuration.
                      </p>
                    </div>

                    {/* Preview Modal */}
                    {showDigestPreview && digestPreview && (
                      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                          <div className="p-6">
                            <div className="flex justify-between items-start mb-4">
                              <h3 className="text-xl font-semibold text-gray-900">Digest Preview</h3>
                              <button
                                onClick={() => setShowDigestPreview(false)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <X className="w-6 h-6" />
                              </button>
                            </div>

                            <div className="space-y-4">
                              <div className="bg-blue-50 rounded-lg p-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <div className="text-sm text-blue-600 font-medium">Total Listings</div>
                                    <div className="text-2xl font-bold text-gray-900">{digestPreview.listingCount}</div>
                                  </div>
                                  <div>
                                    <div className="text-sm text-blue-600 font-medium">Recipients</div>
                                    <div className="text-2xl font-bold text-gray-900">{digestPreview.adminCount}</div>
                                  </div>
                                </div>
                              </div>

                              {digestPreview.listings_by_category && (
                                <div>
                                  <h4 className="font-medium text-gray-900 mb-2">Listings by Category</h4>
                                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                                    {Object.entries(digestPreview.listings_by_category).map(([category, count]) => (
                                      <div key={category} className="flex justify-between text-sm">
                                        <span className="text-gray-600 capitalize">{category.replace('_', ' ')}</span>
                                        <span className="font-medium text-gray-900">{count as number} listings</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {digestPreview.filter_links && digestPreview.filter_links.length > 0 && (
                                <div>
                                  <h4 className="font-medium text-gray-900 mb-2">Filter Links Included</h4>
                                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                                    {digestPreview.filter_links.map((link: any, index: number) => (
                                      <div key={index} className="flex justify-between text-sm">
                                        <span className="text-gray-600">{link.label}</span>
                                        <span className="font-medium text-gray-900">{link.count} available</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                              <button
                                onClick={() => setShowDigestPreview(false)}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                Close
                              </button>
                              <button
                                onClick={() => {
                                  setShowDigestPreview(false);
                                  sendTestDigest();
                                }}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                              >
                                Send This Digest
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Statistics Summary */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Digest Statistics</h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-blue-50 rounded-lg p-4">
                          <div className="text-sm text-blue-600 font-medium mb-1">Total Runs</div>
                          <div className="text-2xl font-bold text-gray-900">{digestLogs.length}</div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="text-sm text-green-600 font-medium mb-1">Successful</div>
                          <div className="text-2xl font-bold text-gray-900">
                            {digestLogs.filter(log => log.success).length}
                          </div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-4">
                          <div className="text-sm text-red-600 font-medium mb-1">Failed</div>
                          <div className="text-2xl font-bold text-gray-900">
                            {digestLogs.filter(log => !log.success).length}
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="text-sm text-gray-600 font-medium mb-1">Success Rate</div>
                          <div className="text-2xl font-bold text-gray-900">
                            {digestLogs.length > 0
                              ? Math.round((digestLogs.filter(log => log.success).length / digestLogs.length) * 100)
                              : 0}%
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Email Logs Table */}
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900">Recent Digest Runs</h3>
                        <p className="text-sm text-gray-600 mt-1">Last 10 digest email runs</p>
                      </div>
                      <div className="overflow-x-auto">
                        {digestLogs.length === 0 ? (
                          <div className="text-center py-12">
                            <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 mb-2">No Email History</h3>
                            <p className="text-gray-500">No digest emails have been sent yet.</p>
                          </div>
                        ) : (
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Timestamp
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Listings Sent
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Recipients
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Details
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {digestLogs.map((log) => (
                                <tr key={log.id} className={log.success ? '' : 'bg-red-50'}>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {new Date(log.run_at).toLocaleString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true
                                    })}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    {log.success ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Success
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        <XCircle className="w-3 h-3 mr-1" />
                                        Failed
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {log.listings_count || 0}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {log.recipients_count || 0}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-500">
                                    {log.error_message ? (
                                      <span className="text-red-600" title={log.error_message}>
                                        {log.error_message.length > 50
                                          ? log.error_message.substring(0, 50) + '...'
                                          : log.error_message}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
