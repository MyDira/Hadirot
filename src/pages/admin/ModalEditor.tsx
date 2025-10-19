import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, X, GripVertical } from 'lucide-react';
import { modalsService, type ModalPopup, type CreateModalInput } from '../../services/modals';
import { ModalPreview } from '../../components/admin/ModalPreview';

interface ModalEditorProps {
  modal: ModalPopup | null;
  onClose: (shouldReload: boolean) => void;
}

const AVAILABLE_PAGES = [
  { path: '/', label: 'Home Page' },
  { path: '/browse', label: 'Browse Listings' },
  { path: '/listing/*', label: 'Listing Detail Pages' },
  { path: '/post', label: 'Post Listing' },
  { path: '/about', label: 'About Page' },
  { path: '/contact', label: 'Contact Page' },
  { path: '*', label: 'All Pages' },
];

export function ModalEditor({ modal, onClose }: ModalEditorProps) {
  const [formData, setFormData] = useState<CreateModalInput>({
    name: '',
    heading: '',
    subheading: '',
    additional_text_lines: [],
    button_text: '',
    button_url: '',
    is_active: false,
    trigger_pages: [],
    display_frequency: 'once_per_session',
    custom_interval_hours: 24,
    delay_seconds: 0,
    priority: 0,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (modal) {
      setFormData({
        name: modal.name,
        heading: modal.heading,
        subheading: modal.subheading || '',
        additional_text_lines: modal.additional_text_lines || [],
        button_text: modal.button_text,
        button_url: modal.button_url,
        is_active: modal.is_active,
        trigger_pages: modal.trigger_pages || [],
        display_frequency: modal.display_frequency,
        custom_interval_hours: modal.custom_interval_hours || 24,
        delay_seconds: modal.delay_seconds,
        priority: modal.priority,
      });
    }
  }, [modal]);

  const handleAddTextLine = () => {
    setFormData((prev) => ({
      ...prev,
      additional_text_lines: [...(prev.additional_text_lines || []), ''],
    }));
  };

  const handleRemoveTextLine = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      additional_text_lines: (prev.additional_text_lines || []).filter((_, i) => i !== index),
    }));
  };

  const handleTextLineChange = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      additional_text_lines: (prev.additional_text_lines || []).map((line, i) =>
        i === index ? value : line
      ),
    }));
  };

  const handlePageToggle = (pagePath: string) => {
    setFormData((prev) => {
      const currentPages = prev.trigger_pages || [];
      const isSelected = currentPages.includes(pagePath);

      if (pagePath === '*') {
        return { ...prev, trigger_pages: isSelected ? [] : ['*'] };
      }

      const filtered = currentPages.filter((p) => p !== '*' && p !== pagePath);
      return {
        ...prev,
        trigger_pages: isSelected ? filtered : [...filtered, pagePath],
      };
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Modal name is required';
    }

    if (!formData.heading.trim()) {
      newErrors.heading = 'Heading is required';
    }

    if (!formData.button_text.trim()) {
      newErrors.button_text = 'Button text is required';
    }

    if (!formData.button_url.trim()) {
      newErrors.button_url = 'Button URL is required';
    } else if (!/^https?:\/\/.+/.test(formData.button_url)) {
      newErrors.button_url = 'URL must start with http:// or https://';
    }

    if (formData.display_frequency === 'custom_interval' && (!formData.custom_interval_hours || formData.custom_interval_hours < 1)) {
      newErrors.custom_interval_hours = 'Custom interval must be at least 1 hour';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      if (modal) {
        await modalsService.updateModal(modal.id, formData);
      } else {
        await modalsService.createModal(formData);
      }
      onClose(true);
    } catch (error: any) {
      console.error('Error saving modal:', error);
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        setErrors({ name: 'A modal with this name already exists' });
      } else {
        alert('Failed to save modal. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const previewModal: ModalPopup = {
    id: 'preview',
    name: formData.name || 'Preview',
    heading: formData.heading || 'Modal Heading',
    subheading: formData.subheading,
    additional_text_lines: formData.additional_text_lines || [],
    button_text: formData.button_text || 'Click Here',
    button_url: formData.button_url || '#',
    is_active: formData.is_active ?? false,
    trigger_pages: formData.trigger_pages || [],
    display_frequency: formData.display_frequency || 'once_per_session',
    custom_interval_hours: formData.custom_interval_hours,
    delay_seconds: formData.delay_seconds ?? 0,
    priority: formData.priority ?? 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => onClose(false)}
            className="flex items-center text-gray-600 hover:text-[#4E4B43] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to List
          </button>
          <h2 className="text-2xl font-bold text-[#4E4B43]">
            {modal ? 'Edit Modal' : 'Create New Modal'}
          </h2>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => onClose(false)}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#4E4B43] text-white rounded-md hover:bg-[#3a3832] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Modal'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-[#4E4B43] mb-4">Basic Information</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Modal Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43] ${
                    errors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Admin reference name"
                />
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
                <p className="text-gray-500 text-xs mt-1">Internal name for admin reference only</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Heading <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.heading}
                  onChange={(e) => setFormData((prev) => ({ ...prev, heading: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43] ${
                    errors.heading ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Welcome to our site!"
                  maxLength={100}
                />
                {errors.heading && <p className="text-red-500 text-sm mt-1">{errors.heading}</p>}
                <p className="text-gray-500 text-xs mt-1">{formData.heading.length}/100 characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subheading
                </label>
                <textarea
                  value={formData.subheading}
                  onChange={(e) => setFormData((prev) => ({ ...prev, subheading: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                  placeholder="A brief description..."
                  rows={2}
                  maxLength={200}
                />
                <p className="text-gray-500 text-xs mt-1">{(formData.subheading || '').length}/200 characters</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Additional Text Lines
                  </label>
                  <button
                    onClick={handleAddTextLine}
                    className="flex items-center text-sm text-[#4E4B43] hover:text-[#3a3832]"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Line
                  </button>
                </div>
                <div className="space-y-2">
                  {(formData.additional_text_lines || []).map((line, index) => (
                    <div key={index} className="flex items-start space-x-2">
                      <GripVertical className="w-5 h-5 text-gray-400 mt-2" />
                      <input
                        type="text"
                        value={line}
                        onChange={(e) => handleTextLineChange(index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                        placeholder={`Text line ${index + 1}`}
                      />
                      <button
                        onClick={() => handleRemoveTextLine(index)}
                        className="p-2 text-red-500 hover:text-red-700"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Button Text <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.button_text}
                  onChange={(e) => setFormData((prev) => ({ ...prev, button_text: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43] ${
                    errors.button_text ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Learn More"
                  maxLength={50}
                />
                {errors.button_text && <p className="text-red-500 text-sm mt-1">{errors.button_text}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Button URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={formData.button_url}
                  onChange={(e) => setFormData((prev) => ({ ...prev, button_url: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43] ${
                    errors.button_url ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="https://example.com"
                />
                {errors.button_url && <p className="text-red-500 text-sm mt-1">{errors.button_url}</p>}
                <p className="text-gray-500 text-xs mt-1">Opens in a new tab</p>
              </div>

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                    className="rounded border-gray-300 text-[#4E4B43] focus:ring-[#4E4B43]"
                  />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
                <p className="text-gray-500 text-xs mt-1 ml-6">Enable this modal to display on the site</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-[#4E4B43] mb-4">Display Settings</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Trigger Pages
                </label>
                <div className="space-y-2">
                  {AVAILABLE_PAGES.map((page) => (
                    <label key={page.path} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={(formData.trigger_pages || []).includes(page.path)}
                        onChange={() => handlePageToggle(page.path)}
                        className="rounded border-gray-300 text-[#4E4B43] focus:ring-[#4E4B43]"
                      />
                      <span className="text-sm text-gray-700">{page.label}</span>
                      <span className="text-xs text-gray-500">({page.path})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Frequency
                </label>
                <select
                  value={formData.display_frequency}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      display_frequency: e.target.value as any,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                >
                  <option value="once_per_session">Once per session</option>
                  <option value="once_per_day">Once per day</option>
                  <option value="once_per_lifetime">Once per lifetime</option>
                  <option value="until_clicked">Until clicked</option>
                  <option value="custom_interval">Custom interval</option>
                </select>
              </div>

              {formData.display_frequency === 'custom_interval' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custom Interval (hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.custom_interval_hours}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        custom_interval_hours: parseInt(e.target.value) || 1,
                      }))
                    }
                    className={`w-full px-3 py-2 border rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43] ${
                      errors.custom_interval_hours ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.custom_interval_hours && (
                    <p className="text-red-500 text-sm mt-1">{errors.custom_interval_hours}</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delay (seconds)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.delay_seconds}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      delay_seconds: parseInt(e.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                />
                <p className="text-gray-500 text-xs mt-1">Time to wait before showing the modal</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      priority: parseInt(e.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                />
                <p className="text-gray-500 text-xs mt-1">Higher priority modals are shown first</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <ModalPreview modal={previewModal} />
        </div>
      </div>
    </div>
  );
}
