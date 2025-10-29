import React from 'react';
import { Save, X, Plus, Trash2, ChevronLeft } from 'lucide-react';
import { CreateModalInput, ModalPopup } from '../../services/modals';
import { ModalPreview } from './ModalPreview';

interface ModalEditorProps {
  modalForm: CreateModalInput;
  isEditing: boolean;
  onSave: () => void;
  onCancel: () => void;
  onChange: (updates: Partial<CreateModalInput>) => void;
}

const PAGE_OPTIONS = [
  { value: '/', label: 'Home Page' },
  { value: '/browse', label: 'Browse Listings' },
  { value: '/listing/*', label: 'Listing Detail Pages' },
  { value: '/post', label: 'Post Listing' },
  { value: '/about', label: 'About Page' },
  { value: '/contact', label: 'Contact Page' },
  { value: '*', label: 'All Pages' },
];

const FREQUENCY_OPTIONS = [
  { value: 'once_per_session', label: 'Once per session' },
  { value: 'once_per_day', label: 'Once per day' },
  { value: 'once_per_lifetime', label: 'Once per lifetime' },
  { value: 'until_clicked', label: 'Until clicked' },
  { value: 'custom_interval', label: 'Custom interval' },
];

export function ModalEditor({ modalForm, isEditing, onSave, onCancel, onChange }: ModalEditorProps) {
  const handleAddTextLine = () => {
    onChange({
      additional_text_lines: [...(modalForm.additional_text_lines || []), '']
    });
  };

  const handleRemoveTextLine = (index: number) => {
    const lines = [...(modalForm.additional_text_lines || [])];
    lines.splice(index, 1);
    onChange({ additional_text_lines: lines });
  };

  const handleUpdateTextLine = (index: number, value: string) => {
    const lines = [...(modalForm.additional_text_lines || [])];
    lines[index] = value;
    onChange({ additional_text_lines: lines });
  };

  const toggleTriggerPage = (page: string) => {
    const currentPages = modalForm.trigger_pages || [];
    const newPages = currentPages.includes(page)
      ? currentPages.filter(p => p !== page)
      : [...currentPages, page];
    onChange({ trigger_pages: newPages });
  };

  // Create preview modal from form data
  const previewModal: ModalPopup = {
    id: 'preview',
    name: modalForm.name,
    heading: modalForm.heading,
    subheading: modalForm.subheading,
    additional_text_lines: modalForm.additional_text_lines || [],
    button_text: modalForm.button_text,
    button_url: modalForm.button_url,
    is_active: modalForm.is_active || false,
    trigger_pages: modalForm.trigger_pages || [],
    display_frequency: modalForm.display_frequency || 'once_per_session',
    custom_interval_hours: modalForm.custom_interval_hours,
    delay_seconds: modalForm.delay_seconds || 0,
    priority: modalForm.priority || 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {isEditing ? 'Edit Modal' : 'Create New Modal'}
            </h2>
            <p className="text-sm text-gray-500">Configure your modal popup settings</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="flex items-center px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Modal
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form Section */}
        <div className="space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Modal Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={modalForm.name}
                  onChange={(e) => onChange({ name: e.target.value })}
                  placeholder="Welcome Modal"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">Internal name for admin reference only</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Heading <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={modalForm.heading}
                  onChange={(e) => onChange({ heading: e.target.value })}
                  placeholder="Join Our WhatsApp Community"
                  maxLength={100}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">{modalForm.heading.length}/100 characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subheading
                </label>
                <input
                  type="text"
                  value={modalForm.subheading || ''}
                  onChange={(e) => onChange({ subheading: e.target.value })}
                  placeholder="Never miss a new apartment!!"
                  maxLength={200}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">{(modalForm.subheading || '').length}/200 characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Text Lines
                </label>
                <div className="space-y-2">
                  {(modalForm.additional_text_lines || []).map((line, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={line}
                        onChange={(e) => handleUpdateTextLine(index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                        placeholder={`Line ${index + 1}`}
                      />
                      <button
                        onClick={() => handleRemoveTextLine(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={handleAddTextLine}
                    className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Line
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Button Text <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={modalForm.button_text}
                  onChange={(e) => onChange({ button_text: e.target.value })}
                  placeholder="Join Now!"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Button URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={modalForm.button_url}
                  onChange={(e) => onChange({ button_url: e.target.value })}
                  onBlur={(e) => {
                    let url = e.target.value.trim();
                    // Auto-add https:// if no protocol is specified and URL is not empty
                    if (url && !url.match(/^[a-zA-Z]+:\/\//)) {
                      onChange({ button_url: 'https://' + url });
                    }
                  }}
                  placeholder="https://chat.whatsapp.com/... or amazon.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">Opens in a new tab. https:// will be added automatically if missing.</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is-active"
                  checked={modalForm.is_active || false}
                  onChange={(e) => onChange({ is_active: e.target.checked })}
                  className="rounded border-gray-300 text-accent-500 focus:ring-accent-500"
                />
                <label htmlFor="is-active" className="text-sm font-medium text-gray-700">
                  Active
                </label>
                <p className="text-xs text-gray-500 ml-2">Enable this modal to display on the site</p>
              </div>
            </div>
          </div>

          {/* Display Settings */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Display Settings</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Trigger Pages
                </label>
                <div className="space-y-2">
                  {PAGE_OPTIONS.map((page) => (
                    <label key={page.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(modalForm.trigger_pages || []).includes(page.value)}
                        onChange={() => toggleTriggerPage(page.value)}
                        className="rounded border-gray-300 text-accent-500 focus:ring-accent-500"
                      />
                      <span className="text-sm text-gray-700">{page.label}</span>
                      <span className="text-xs text-gray-400">({page.value})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Frequency
                </label>
                <select
                  value={modalForm.display_frequency || 'once_per_session'}
                  onChange={(e) => onChange({ display_frequency: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                >
                  {FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {modalForm.display_frequency === 'custom_interval' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custom Interval (hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={modalForm.custom_interval_hours || 24}
                    onChange={(e) => onChange({ custom_interval_hours: parseInt(e.target.value) || 24 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delay (seconds)
                </label>
                <input
                  type="number"
                  min="0"
                  value={modalForm.delay_seconds || 0}
                  onChange={(e) => onChange({ delay_seconds: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">Time to wait before showing the modal</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <input
                  type="number"
                  min="0"
                  value={modalForm.priority || 0}
                  onChange={(e) => onChange({ priority: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">Higher priority modals are shown first</p>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Section */}
        <div className="lg:sticky lg:top-6">
          <ModalPreview modal={previewModal} />
        </div>
      </div>
    </div>
  );
}
