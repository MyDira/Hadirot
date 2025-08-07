import React, { useState, useEffect } from 'react';
import { Save, ArrowLeft, Plus, Trash2, GripVertical, Edit3, Link as LinkIcon, Type } from 'lucide-react';
import { Link } from 'react-router-dom';
import { footerService } from '../../services/footer';
import { FooterSection, FooterRichTextData, FooterLinkData } from '../../config/supabase';
import { useAuth } from '../../hooks/useAuth';

export function FooterEditor() {
  const { user, profile } = useAuth();
  const [footerSections, setFooterSections] = useState<FooterSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [newSectionData, setNewSectionData] = useState({
    section_key: '',
    title: '',
    content_type: 'links' as const,
    links: [{ text: '', url: '' }],
  });

  const [editData, setEditData] = useState<{
    [key: string]: {
      title: string;
      tagline?: string;
      description?: string;
      links?: FooterLinkData[];
    };
  }>({});

  useEffect(() => {
    if (user && profile?.is_admin) {
      loadFooterSections();
    }
  }, [user, profile]);

  const loadFooterSections = async () => {
    try {
      const sections = await footerService.getAllFooterSections();
      setFooterSections(sections);
      
      // Initialize edit data
      const initialEditData: typeof editData = {};
      sections.forEach(section => {
        if (section.content_type === 'rich_text') {
          const data = section.content_data as FooterRichTextData;
          initialEditData[section.id] = {
            title: section.title,
            tagline: data.tagline || '',
            description: data.description || '',
          };
        } else {
          const data = section.content_data as FooterLinkData[];
          initialEditData[section.id] = {
            title: section.title,
            links: data || [],
          };
        }
      });
      setEditData(initialEditData);
    } catch (error) {
      console.error('Error loading footer sections:', error);
      setMessage({ type: 'error', text: 'Failed to load footer sections' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSection = async (sectionId: string) => {
    const section = footerSections.find(s => s.id === sectionId);
    const data = editData[sectionId];
    
    if (!section || !data) return;

    setSaving(sectionId);
    try {
      let content_data: any;
      
      if (section.content_type === 'rich_text') {
        content_data = {
          tagline: data.tagline || '',
          description: data.description || '',
        };
      } else {
        content_data = data.links || [];
      }

      await footerService.updateFooterSection(sectionId, {
        title: data.title,
        content_data,
      });

      await loadFooterSections();
      setEditingSection(null);
      setMessage({ type: 'success', text: 'Section updated successfully!' });
      
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving section:', error);
      setMessage({ type: 'error', text: 'Failed to save section' });
    } finally {
      setSaving(null);
    }
  };

  const handleCreateSection = async () => {
    if (!newSectionData.section_key.trim() || !newSectionData.title.trim()) {
      setMessage({ type: 'error', text: 'Please fill in section key and title' });
      return;
    }

    // Check if section key already exists
    if (footerSections.some(s => s.section_key === newSectionData.section_key)) {
      setMessage({ type: 'error', text: 'A section with this key already exists' });
      return;
    }

    setSaving('new');
    try {
      const maxSortOrder = Math.max(...footerSections.map(s => s.sort_order), 0);
      
      await footerService.createFooterSection({
        section_key: newSectionData.section_key,
        title: newSectionData.title,
        content_type: newSectionData.content_type,
        content_data: newSectionData.links.filter(link => link.text.trim() && link.url.trim()),
        sort_order: maxSortOrder + 1,
      });

      await loadFooterSections();
      setNewSectionData({
        section_key: '',
        title: '',
        content_type: 'links',
        links: [{ text: '', url: '' }],
      });
      setShowCreateForm(false);
      setMessage({ type: 'success', text: 'Section created successfully!' });
      
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error creating section:', error);
      setMessage({ type: 'error', text: 'Failed to create section' });
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    const section = footerSections.find(s => s.id === sectionId);
    
    // Prevent deletion of main_info section
    if (section?.section_key === 'main_info') {
      setMessage({ type: 'error', text: 'The main info section cannot be deleted' });
      return;
    }

    if (!confirm('Are you sure you want to delete this section?')) {
      return;
    }

    setSaving(sectionId);
    try {
      await footerService.deleteFooterSection(sectionId);
      await loadFooterSections();
      setMessage({ type: 'success', text: 'Section deleted successfully!' });
      
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error deleting section:', error);
      setMessage({ type: 'error', text: 'Failed to delete section' });
    } finally {
      setSaving(null);
    }
  };

  const updateEditData = (sectionId: string, field: string, value: any) => {
    setEditData(prev => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        [field]: value,
      },
    }));
  };

  const addLink = (sectionId: string) => {
    const currentLinks = editData[sectionId]?.links || [];
    updateEditData(sectionId, 'links', [...currentLinks, { text: '', url: '' }]);
  };

  const removeLink = (sectionId: string, linkIndex: number) => {
    const currentLinks = editData[sectionId]?.links || [];
    updateEditData(sectionId, 'links', currentLinks.filter((_, i) => i !== linkIndex));
  };

  const updateLink = (sectionId: string, linkIndex: number, field: 'text' | 'url', value: string) => {
    const currentLinks = editData[sectionId]?.links || [];
    const updatedLinks = currentLinks.map((link, i) => 
      i === linkIndex ? { ...link, [field]: value } : link
    );
    updateEditData(sectionId, 'links', updatedLinks);
  };

  if (!user || !profile?.is_admin) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <p className="text-red-600">Access denied. Admin privileges required.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading footer sections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/admin"
          className="inline-flex items-center text-[#273140] hover:text-[#1e252f] mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Admin Panel
        </Link>
        <h1 className="text-3xl font-bold text-[#273140] flex items-center">
          <Edit3 className="w-8 h-8 mr-3" />
          Footer Editor
        </h1>
        <p className="text-gray-600 mt-2">
          Manage footer content, add columns, and customize the layout
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-md ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* Create New Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-[#273140]">Add New Column</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-[#C5594C] text-white px-4 py-2 rounded-md font-medium hover:bg-[#b04d42] transition-colors flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Column
          </button>
        </div>

        {showCreateForm && (
          <div className="border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Section Key (URL-friendly)
                </label>
                <input
                  type="text"
                  value={newSectionData.section_key}
                  onChange={(e) => setNewSectionData(prev => ({ 
                    ...prev, 
                    section_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') 
                  }))}
                  placeholder="e.g., support_links"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Column Title
                </label>
                <input
                  type="text"
                  value={newSectionData.title}
                  onChange={(e) => setNewSectionData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Support"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Links</label>
              {newSectionData.links.map((link, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={link.text}
                    onChange={(e) => {
                      const updatedLinks = newSectionData.links.map((l, i) => 
                        i === index ? { ...l, text: e.target.value } : l
                      );
                      setNewSectionData(prev => ({ ...prev, links: updatedLinks }));
                    }}
                    placeholder="Link text"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  />
                  <input
                    type="text"
                    value={link.url}
                    onChange={(e) => {
                      const updatedLinks = newSectionData.links.map((l, i) => 
                        i === index ? { ...l, url: e.target.value } : l
                      );
                      setNewSectionData(prev => ({ ...prev, links: updatedLinks }));
                    }}
                    placeholder="/url or https://..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  />
                  <button
                    onClick={() => {
                      const updatedLinks = newSectionData.links.filter((_, i) => i !== index);
                      setNewSectionData(prev => ({ ...prev, links: updatedLinks }));
                    }}
                    className="px-3 py-2 text-red-600 hover:text-red-800 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setNewSectionData(prev => ({ 
                  ...prev, 
                  links: [...prev.links, { text: '', url: '' }] 
                }))}
                className="text-[#273140] hover:text-[#1e252f] text-sm font-medium transition-colors"
              >
                + Add Link
              </button>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleCreateSection}
                disabled={saving === 'new'}
                className="bg-green-600 text-white px-4 py-2 rounded-md font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {saving === 'new' ? 'Creating...' : 'Create Section'}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewSectionData({
                    section_key: '',
                    title: '',
                    content_type: 'links',
                    links: [{ text: '', url: '' }],
                  });
                }}
                className="bg-gray-500 text-white px-4 py-2 rounded-md font-medium hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Existing Sections */}
      <div className="space-y-6">
        {footerSections.map((section) => (
          <div key={section.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <GripVertical className="w-5 h-5 text-gray-400 mr-2" />
                <div>
                  <h3 className="text-lg font-semibold text-[#273140] flex items-center">
                    {section.content_type === 'rich_text' ? (
                      <Type className="w-5 h-5 mr-2" />
                    ) : (
                      <LinkIcon className="w-5 h-5 mr-2" />
                    )}
                    {section.title}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {section.section_key} • {section.content_type === 'rich_text' ? 'Rich Text' : 'Links'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setEditingSection(editingSection === section.id ? null : section.id)}
                  className="text-[#273140] hover:text-[#1e252f] transition-colors"
                >
                  <Edit3 className="w-5 h-5" />
                </button>
                {section.section_key !== 'main_info' && (
                  <button
                    onClick={() => handleDeleteSection(section.id)}
                    disabled={saving === section.id}
                    className="text-red-600 hover:text-red-800 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {editingSection === section.id && editData[section.id] && (
              <div className="border-t pt-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      value={editData[section.id].title}
                      onChange={(e) => updateEditData(section.id, 'title', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                    />
                  </div>

                  {section.content_type === 'rich_text' ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Tagline
                        </label>
                        <input
                          type="text"
                          value={editData[section.id].tagline || ''}
                          onChange={(e) => updateEditData(section.id, 'tagline', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <textarea
                          value={editData[section.id].description || ''}
                          onChange={(e) => updateEditData(section.id, 'description', e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                        />
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Links
                      </label>
                      {(editData[section.id].links || []).map((link, index) => (
                        <div key={index} className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={link.text}
                            onChange={(e) => updateLink(section.id, index, 'text', e.target.value)}
                            placeholder="Link text"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                          />
                          <input
                            type="text"
                            value={link.url}
                            onChange={(e) => updateLink(section.id, index, 'url', e.target.value)}
                            placeholder="/url or https://..."
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                          />
                          <button
                            onClick={() => removeLink(section.id, index)}
                            className="px-3 py-2 text-red-600 hover:text-red-800 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addLink(section.id)}
                        className="text-[#273140] hover:text-[#1e252f] text-sm font-medium transition-colors"
                      >
                        + Add Link
                      </button>
                    </div>
                  )}

                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={() => handleSaveSection(section.id)}
                      disabled={saving === section.id}
                      className="bg-[#C5594C] text-white px-4 py-2 rounded-md font-medium hover:bg-[#b04d42] disabled:opacity-50 transition-colors flex items-center"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {saving === section.id ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={() => setEditingSection(null)}
                      className="bg-gray-500 text-white px-4 py-2 rounded-md font-medium hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}