import React, { useState, useEffect } from 'react';
import { Save, ArrowLeft, FileText, Bold, Italic, List, ListOrdered, Link as LinkIcon, Type, Plus, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import { generateHTML } from '@tiptap/html';
import { staticPagesService, StaticPage } from '../../services/staticPages';
import { footerService } from '../../services/footer';
import { FooterSection } from '../../config/supabase';
import { useAuth } from '../../hooks/useAuth';

export function StaticPageEditor() {
  const { user, profile } = useAuth();
  const [staticPages, setStaticPages] = useState<StaticPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [selectedPage, setSelectedPage] = useState<StaticPage | null>(null);
  const [title, setTitle] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPageData, setNewPageData] = useState({
    id: '',
    title: '',
    content: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Footer placement state
  const [showFooterPlacementPrompt, setShowFooterPlacementPrompt] = useState(false);
  const [newlyCreatedPage, setNewlyCreatedPage] = useState<{ id: string; title: string } | null>(null);
  const [availableFooterSections, setAvailableFooterSections] = useState<FooterSection[]>([]);
  const [selectedFooterSection, setSelectedFooterSection] = useState<string>('');
  const [linkTextForNewPage, setLinkTextForNewPage] = useState('');
  const [newFooterColumnData, setNewFooterColumnData] = useState({
    key: '',
    title: '',
  });

  // Define extensions array for reuse
  const extensions = [
    StarterKit.configure({
      heading: false, // We'll use our custom heading extension
      bulletList: false, // We'll use our custom bullet list extension
      orderedList: false, // We'll use our custom ordered list extension
      listItem: false, // We'll use our custom list item extension
      link: false, // We'll use our custom link extension
    }),
    Heading.configure({
      levels: [1, 2, 3],
    }),
    BulletList,
    OrderedList,
    ListItem,
    LinkExtension.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-[#4E4B43] underline hover:text-[#3a3832]',
      },
    }),
  ];
  const editor = useEditor({
    extensions,
    content: '',
  });


  useEffect(() => {
    if (user && profile?.is_admin) {
      loadStaticPages();
    }
  }, [user, profile]);

  useEffect(() => {
    if (selectedPageId) {
      const page = staticPages.find(p => p.id === selectedPageId);
      if (page) {
        setSelectedPage(page);
        setTitle(page.title);
        
        // Load HTML content into Tiptap editor
        if (editor && page.content) {
          try {
            // Use setContent to parse HTML and convert to Tiptap format
            editor.commands.setContent(page.content || '');
            setTimeout(() => {
            editor.chain().focus('end').run();
            }, 100);
          } catch (error) {
            console.error('Error parsing HTML content:', error);
            // Fallback: set as plain text if HTML parsing fails
            editor.commands.setContent(`<p>${page.content}</p>`);
            setTimeout(() => {
            editor.chain().focus('end').run();
            }, 100);
          }
        }
      }
    }
  }, [selectedPageId, staticPages, editor]);

  const loadStaticPages = async () => {
    try {
      const pages = await staticPagesService.getAllStaticPages();
      setStaticPages(pages);
      if (pages.length > 0 && !selectedPageId) {
        setSelectedPageId(pages[0].id);
      }
    } catch (error) {
      console.error('Error loading static pages:', error);
      setMessage({ type: 'error', text: 'Failed to load static pages' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPageId || !title.trim() || !editor) {
      setMessage({ type: 'error', text: 'Please fill in both title and content' });
      return;
    }

    const content = editor.getHTML();
    
    if (!content.trim() || content === '<p></p>') {
      setMessage({ type: 'error', text: 'Please add some content' });
      return;
    }
    setSaving(true);
    try {
      await staticPagesService.updateStaticPage(selectedPageId, {
        title: title.trim(),
        content: content
      });
      
      // Reload the pages to get updated data
      await loadStaticPages();
      
      setMessage({ type: 'success', text: 'Page updated successfully!' });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving page:', error);
      setMessage({ type: 'error', text: 'Failed to save page. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePage = async () => {
    if (!newPageData.id.trim() || !newPageData.title.trim()) {
      setMessage({ type: 'error', text: 'Please fill in both page ID and title' });
      return;
    }

    // Check if page ID already exists
    if (staticPages.some(page => page.id === newPageData.id)) {
      setMessage({ type: 'error', text: 'A page with this ID already exists' });
      return;
    }

    setCreating(true);
    try {
      const newPage = await staticPagesService.createStaticPage({
        id: newPageData.id,
        title: newPageData.title,
        content: newPageData.content || '<p>New page content...</p>'
      });

      if (newPage) {
        // Store the newly created page info
        setNewlyCreatedPage({ id: newPage.id, title: newPage.title });
        
        // Load available footer sections (only link type sections)
        const allFooterSections = await footerService.getAllFooterSections();
        const linkSections = allFooterSections.filter(section => section.content_type === 'links');
        setAvailableFooterSections(linkSections);
        
        // Set default selection and link text
        setSelectedFooterSection(linkSections.length > 0 ? linkSections[0].id : 'create-new');
        setLinkTextForNewPage(newPage.title);
        
        // Show the footer placement prompt
        setShowFooterPlacementPrompt(true);
        
        // Reset form and hide it
        setNewPageData({ id: '', title: '', content: '' });
        setShowCreateForm(false);
      }
    } catch (error) {
      console.error('Error creating page:', error);
      setMessage({ type: 'error', text: 'Failed to create page. Please try again.' });
    } finally {
      setCreating(false);
    }
  };

  const handlePlacePageInFooter = async () => {
    if (!newlyCreatedPage || !linkTextForNewPage.trim()) {
      setMessage({ type: 'error', text: 'Please provide link text for the new page' });
      return;
    }

    setCreating(true);
    try {
      const newLink = {
        text: linkTextForNewPage.trim(),
        url: `/${newlyCreatedPage.id}`,
      };

      if (selectedFooterSection === 'create-new') {
        // Create new footer section
        if (!newFooterColumnData.key.trim() || !newFooterColumnData.title.trim()) {
          setMessage({ type: 'error', text: 'Please fill in both section key and title for the new column' });
          return;
        }

        // Check if section key already exists
        if (availableFooterSections.some(s => s.section_key === newFooterColumnData.key)) {
          setMessage({ type: 'error', text: 'A footer section with this key already exists' });
          return;
        }

        const maxSortOrder = Math.max(...availableFooterSections.map(s => s.sort_order), 0);
        
        await footerService.createFooterSection({
          section_key: newFooterColumnData.key,
          title: newFooterColumnData.title,
          content_type: 'links',
          content_data: [newLink],
          sort_order: maxSortOrder + 1,
        });
      } else {
        // Add to existing footer section
        const existingSection = availableFooterSections.find(s => s.id === selectedFooterSection);
        if (!existingSection) {
          setMessage({ type: 'error', text: 'Selected footer section not found' });
          return;
        }

        const currentLinks = existingSection.content_data || [];
        const updatedLinks = [...currentLinks, newLink];

        await footerService.updateFooterSection(existingSection.id, {
          content_data: updatedLinks,
        });
      }

      // Reload the pages to get updated data
      await loadStaticPages();
      
      // Select the newly created page
      setSelectedPageId(newlyCreatedPage.id);
      
      // Reset footer placement state
      setShowFooterPlacementPrompt(false);
      setNewlyCreatedPage(null);
      setSelectedFooterSection('');
      setLinkTextForNewPage('');
      setNewFooterColumnData({ key: '', title: '' });
      
      setMessage({ type: 'success', text: 'Page created and added to footer successfully!' });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error placing page in footer:', error);
      setMessage({ type: 'error', text: 'Failed to add page to footer. Please try again.' });
    } finally {
      setCreating(false);
    }
  };

  const handleSkipFooterPlacement = async () => {
    if (!newlyCreatedPage) return;

    // Reload the pages to get updated data
    await loadStaticPages();
    
    // Select the newly created page
    setSelectedPageId(newlyCreatedPage.id);
    
    // Reset footer placement state
    setShowFooterPlacementPrompt(false);
    setNewlyCreatedPage(null);
    setSelectedFooterSection('');
    setLinkTextForNewPage('');
    setNewFooterColumnData({ key: '', title: '' });
    
    setMessage({ type: 'success', text: 'Page created successfully!' });
    
    // Clear message after 3 seconds
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeletePage = async (pageId: string) => {
    // Prevent deletion of core pages
    if (['about', 'contact', 'privacy', 'terms'].includes(pageId)) {
      setMessage({ type: 'error', text: 'Core pages cannot be deleted' });
      return;
    }

    if (!confirm('Are you sure you want to delete this page? This action cannot be undone.')) {
      return;
    }

    setDeleting(pageId);
    try {
      await staticPagesService.deleteStaticPage(pageId);
      
      // If we're deleting the currently selected page, select another one
      if (selectedPageId === pageId) {
        const remainingPages = staticPages.filter(p => p.id !== pageId);
        setSelectedPageId(remainingPages.length > 0 ? remainingPages[0].id : '');
      }
      
      // Reload the pages to get updated data
      await loadStaticPages();
      
      setMessage({ type: 'success', text: 'Page deleted successfully!' });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error deleting page:', error);
      setMessage({ type: 'error', text: 'Failed to delete page. Please try again.' });
    } finally {
      setDeleting(null);
    }
  };

  const addLink = () => {
    const url = window.prompt('Enter the URL:');
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const removeLink = () => {
    if (editor) {
      editor.chain().focus().unsetLink().run();
    }
  };

  const getPageDisplayName = (id: string) => {
    const names: Record<string, string> = {
      'about': 'About Us',
      'contact': 'Contact',
      'privacy': 'Privacy Policy',
      'terms': 'Terms of Use'
    };
    return names[id] || id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
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
          <p className="text-gray-600 mt-4">Loading static pages...</p>
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
          <FileText className="w-8 h-8 mr-3" />
          Static Page Editor
        </h1>
        <p className="text-gray-600 mt-2">
          Edit the content of footer pages (About, Contact, Privacy Policy, Terms of Use)
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Page Selector */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-lg font-semibold text-[#273140] mb-4">Select Page</h3>
            
            {/* Create New Page Button */}
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="w-full mb-4 bg-[#C5594C] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#b04d42] transition-colors flex items-center justify-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New Page
            </button>

            {/* Create New Page Form */}
            {showCreateForm && (
              <div className="mb-4 p-3 border border-gray-200 rounded-md bg-gray-50">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Page ID (URL slug)
                    </label>
                    <input
                      type="text"
                      value={newPageData.id}
                      onChange={(e) => setNewPageData(prev => ({ ...prev, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                      placeholder="e.g., help, faq, support"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-[#273140] focus:border-[#273140]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Page Title
                    </label>
                    <input
                      type="text"
                      value={newPageData.title}
                      onChange={(e) => setNewPageData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g., Help Center"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-[#273140] focus:border-[#273140]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Initial Content
                    </label>
                    <textarea
                      value={newPageData.content}
                      onChange={(e) => setNewPageData(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="Enter initial page content..."
                      rows={3}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-[#273140] focus:border-[#273140]"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleCreatePage}
                      disabled={creating}
                      className="flex-1 bg-green-600 text-white px-2 py-1 rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {creating ? 'Creating...' : 'Create'}
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateForm(false);
                        setNewPageData({ id: '', title: '', content: '' });
                      }}
                      className="flex-1 bg-gray-500 text-white px-2 py-1 rounded text-xs font-medium hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {staticPages.map((page) => (
                <div
                  key={page.id}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                >
                  <button
                    onClick={() => setSelectedPageId(page.id)}
                    className={`flex-1 text-left px-3 py-2 rounded-md transition-colors ${
                      selectedPageId === page.id
                        ? 'bg-[#273140] text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {getPageDisplayName(page.id)}
                  </button>
                  
                  {/* Delete button for non-core pages */}
                  {!['about', 'contact', 'privacy', 'terms'].includes(page.id) && (
                    <button
                      onClick={() => handleDeletePage(page.id)}
                      disabled={deleting === page.id}
                      className="ml-2 p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                      title="Delete page"
                    >
                      {deleting === page.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
            
            {selectedPage && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Last updated: {new Date(selectedPage.updated_at).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="lg:col-span-3">
          {selectedPage ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-[#273140] mb-2">
                  Editing: {getPageDisplayName(selectedPage.id)}
                </h2>
              </div>

              <div className="space-y-6">
                {/* Title Field */}
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                    Page Title
                  </label>
                  <input
                    type="text"
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                    placeholder="Enter page title..."
                  />
                </div>

                {/* Content Field */}
                <div>
                  <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
                    Page Content
                  </label>
                  
                  {/* Rich Text Editor Toolbar */}
                  {editor && (
                    <div className="border border-gray-300 rounded-t-md bg-gray-50 p-2 flex flex-wrap gap-1">
                      {/* Headings */}
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          editor.isActive('heading', { level: 1 })
                            ? 'bg-[#273140] text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        H1
                      </button>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          editor.isActive('heading', { level: 2 })
                            ? 'bg-[#273140] text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        H2
                      </button>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          editor.isActive('heading', { level: 3 })
                            ? 'bg-[#273140] text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        H3
                      </button>
                      
                      <div className="w-px h-6 bg-gray-300 mx-1"></div>
                      
                      {/* Text Formatting */}
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={`p-2 rounded transition-colors ${
                          editor.isActive('bold')
                            ? 'bg-[#273140] text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Bold className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={`p-2 rounded transition-colors ${
                          editor.isActive('italic')
                            ? 'bg-[#273140] text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Italic className="w-4 h-4" />
                      </button>
                      
                      <div className="w-px h-6 bg-gray-300 mx-1"></div>
                      
                      {/* Lists */}
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={`p-2 rounded transition-colors ${
                          editor.isActive('bulletList')
                            ? 'bg-[#273140] text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className={`p-2 rounded transition-colors ${
                          editor.isActive('orderedList')
                            ? 'bg-[#273140] text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <ListOrdered className="w-4 h-4" />
                      </button>
                      
                      <div className="w-px h-6 bg-gray-300 mx-1"></div>
                      
                      {/* Links */}
                      <button
                        type="button"
                        onClick={addLink}
                        className={`p-2 rounded transition-colors ${
                          editor.isActive('link')
                            ? 'bg-[#273140] text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <LinkIcon className="w-4 h-4" />
                      </button>
                      {editor.isActive('link') && (
                        <button
                          type="button"
                          onClick={removeLink}
                          className="px-2 py-1 rounded text-xs bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                        >
                          Remove Link
                        </button>
                      )}
                      
                      <div className="w-px h-6 bg-gray-300 mx-1"></div>
                      
                      {/* Paragraph */}
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().setParagraph().run()}
                        className={`p-2 rounded transition-colors ${
                          editor.isActive('paragraph')
                            ? 'bg-[#273140] text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Type className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  
                  {/* Rich Text Editor Content */}
                  <div className="border border-gray-300 rounded-b-md min-h-[400px] max-h-[600px] overflow-y-auto">
                    <EditorContent 
                      editor={editor} 
                      className="prose prose-sm max-w-none p-4 focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[350px] [&_.ProseMirror]:cursor-text"
                    />
                  </div>
                  
                  <p className="text-xs text-gray-500 mt-1">
                    Use the toolbar above to format your content. The editor supports headings, bold, italic, lists, and links.
                  </p>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={saving || !title.trim() || !editor}
                    className="bg-[#C5594C] text-white px-6 py-3 rounded-md font-semibold hover:bg-[#b04d42] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C5594C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                  >
                    <Save className="w-5 h-5 mr-2" />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Select a page from the sidebar to start editing</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Placement Prompt Modal */}
      {showFooterPlacementPrompt && newlyCreatedPage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-[#4E4B43]">Add Page to Footer</h3>
             <h3 className="text-lg font-semibold text-[#273140]">Add Page to Footer</h3>
              <button
                onClick={handleSkipFooterPlacement}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Your page "<strong>{newlyCreatedPage.title}</strong>" has been created. 
                Would you like to add it to a footer column?
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Link Text
                  </label>
                  <input
                    type="text"
                    value={linkTextForNewPage}
                    onChange={(e) => setLinkTextForNewPage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                    placeholder="How it appears in the footer"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Footer Column
                  </label>
                  <select
                    value={selectedFooterSection}
                    onChange={(e) => setSelectedFooterSection(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                  >
                    {availableFooterSections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.title}
                      </option>
                    ))}
                    <option value="create-new">+ Create New Column</option>
                  </select>
                </div>
                
                {selectedFooterSection === 'create-new' && (
                  <div className="space-y-3 p-3 bg-gray-50 rounded-md">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Column Key (URL-friendly)
                      </label>
                      <input
                        type="text"
                        value={newFooterColumnData.key}
                        onChange={(e) => setNewFooterColumnData(prev => ({ 
                          ...prev, 
                          key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') 
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                        placeholder="e.g., help_center"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Column Title
                      </label>
                      <input
                        type="text"
                        value={newFooterColumnData.title}
                        onChange={(e) => setNewFooterColumnData(prev => ({ 
                          ...prev, 
                          title: e.target.value 
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                        placeholder="e.g., Help Center"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50">
              <button
                onClick={handleSkipFooterPlacement}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handlePlacePageInFooter}
                disabled={creating || !linkTextForNewPage.trim()}
                className="px-4 py-2 bg-[#C5594C] text-white rounded-md hover:bg-[#b04d42] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? 'Adding...' : 'Add to Footer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}