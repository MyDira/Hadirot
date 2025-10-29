import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FileText, Star, MessageSquare, Save, Trash2, Plus, Eye, EyeOff, Edit2, X, Settings, Search, ChevronLeft, Monitor, Smartphone, BarChart3, Users, Power } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { staticPagesService, StaticPage } from '../services/staticPages';
import { modalsService, ModalPopup, CreateModalInput } from '../services/modals';
import { supabase, Profile } from '../config/supabase';
import { ModalPreview } from '../components/admin/ModalPreview';
import { ModalManagement } from '../components/admin/ModalManagement';
import { ModalEditor } from '../components/admin/ModalEditor';

const CONTENT_TAB_KEYS = ['static-pages', 'featured', 'modals'] as const;
type ContentTabKey = (typeof CONTENT_TAB_KEYS)[number];

const isValidContentTab = (value: string | null): value is ContentTabKey =>
  value !== null && CONTENT_TAB_KEYS.includes(value as ContentTabKey);

const CONTENT_TABS: { id: ContentTabKey; label: string; icon: React.ElementType }[] = [
  { id: 'static-pages', label: 'Static Pages', icon: FileText },
  { id: 'featured', label: 'Featured Settings', icon: Star },
  { id: 'modals', label: 'Modal Popups', icon: MessageSquare },
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
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setToast({ message: 'Failed to load data', tone: 'error' });
    } finally {
      setLoading(false);
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
