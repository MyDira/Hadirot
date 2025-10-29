import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FileText, Star, MessageSquare, Save, Trash2, Plus, Eye, EyeOff, Edit2, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { staticPagesService, StaticPage } from '../services/staticPages';
import { modalsService, ModalPopup, CreateModalInput } from '../services/modals';
import { supabase, Profile } from '../config/supabase';

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
      } else if (activeTab === 'featured') {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('full_name');
        if (!error && data) {
          setUsers(data);
        }
      } else if (activeTab === 'modals') {
        const allModals = await modalsService.getAllModals();
        setModals(allModals);
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
        .update({ max_featured_listings: newLimit })
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
      await modalsService.createModal(modalForm);
      setToast({ message: 'Modal created successfully', tone: 'success' });
      setShowCreateModal(false);
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
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900">Static Pages</h2>
                    {staticPages.map((page) => (
                      <div key={page.id} className="border border-gray-200 rounded-lg p-4">
                        {editingPageId === page.id ? (
                          <div className="space-y-4">
                            <input
                              type="text"
                              value={pageEdits[page.id]?.title || ''}
                              onChange={(e) => setPageEdits(prev => ({
                                ...prev,
                                [page.id]: { ...prev[page.id], title: e.target.value, content: prev[page.id]?.content || '' }
                              }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              placeholder="Page Title"
                            />
                            <textarea
                              value={pageEdits[page.id]?.content || ''}
                              onChange={(e) => setPageEdits(prev => ({
                                ...prev,
                                [page.id]: { ...prev[page.id], title: prev[page.id]?.title || '', content: e.target.value }
                              }))}
                              rows={10}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                              placeholder="HTML Content"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSavePage(page.id)}
                                className="flex items-center px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                              >
                                <Save className="w-4 h-4 mr-2" />
                                Save
                              </button>
                              <button
                                onClick={() => handleCancelEdit(page.id)}
                                className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                              >
                                <X className="w-4 h-4 mr-2" />
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="text-lg font-semibold text-gray-900">{page.title}</h3>
                              <button
                                onClick={() => handleEditPage(page.id)}
                                className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                              >
                                <Edit2 className="w-4 h-4 mr-1" />
                                Edit
                              </button>
                            </div>
                            <p className="text-sm text-gray-500">ID: {page.id}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'featured' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900">Featured Listing Limits</h2>
                    <div className="space-y-4">
                      {users.map((user) => (
                        <div key={user.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
                          <div>
                            <p className="font-medium text-gray-900">{user.full_name}</p>
                            <p className="text-sm text-gray-500">{user.role}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <input
                              type="number"
                              min="0"
                              value={user.max_featured_listings || 0}
                              onChange={(e) => handleUpdateFeaturedLimit(user.id, parseInt(e.target.value) || 0)}
                              disabled={updatingUserId === user.id}
                              className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center"
                            />
                            <span className="text-sm text-gray-600">max featured</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'modals' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-semibold text-gray-900">Modal Popups</h2>
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Modal
                      </button>
                    </div>

                    {showCreateModal && (
                      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <h3 className="text-lg font-semibold mb-4">Create New Modal</h3>
                        <div className="space-y-4">
                          <input
                            type="text"
                            placeholder="Modal Name"
                            value={modalForm.name}
                            onChange={(e) => setModalForm(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                          <input
                            type="text"
                            placeholder="Heading"
                            value={modalForm.heading}
                            onChange={(e) => setModalForm(prev => ({ ...prev, heading: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                          <input
                            type="text"
                            placeholder="Button Text"
                            value={modalForm.button_text}
                            onChange={(e) => setModalForm(prev => ({ ...prev, button_text: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                          <input
                            type="text"
                            placeholder="Button URL"
                            value={modalForm.button_url}
                            onChange={(e) => setModalForm(prev => ({ ...prev, button_url: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleCreateModal}
                              className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                            >
                              Create
                            </button>
                            <button
                              onClick={() => setShowCreateModal(false)}
                              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      {modals.map((modal) => (
                        <div key={modal.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{modal.name}</h3>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleToggleModalActive(modal.id, modal.is_active)}
                                className={`flex items-center px-3 py-1 text-sm rounded ${
                                  modal.is_active
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {modal.is_active ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />}
                                {modal.is_active ? 'Active' : 'Inactive'}
                              </button>
                              <button
                                onClick={() => handleDeleteModal(modal.id)}
                                className="flex items-center px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Delete
                              </button>
                            </div>
                          </div>
                          <p className="text-gray-600">{modal.heading}</p>
                          <p className="text-sm text-gray-500 mt-1">Priority: {modal.priority} | Delay: {modal.delay_seconds}s</p>
                        </div>
                      ))}
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
