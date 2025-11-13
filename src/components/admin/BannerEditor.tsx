import React, { useState } from 'react';
import { Save, X, Plus, Trash2, MoveUp, MoveDown, Eye } from 'lucide-react';
import { HeroBanner, BannerButton } from '../../config/supabase';
import * as Icons from 'lucide-react';

interface BannerEditorProps {
  banner: HeroBanner | null;
  isEditing: boolean;
  onSave: (bannerData: any, buttons: any[]) => void;
  onCancel: () => void;
}

const COMMON_ICONS = [
  'Search', 'Plus', 'Home', 'Star', 'Mail', 'Phone', 'MapPin', 'Calendar',
  'Clock', 'User', 'Users', 'Heart', 'ChevronRight', 'ArrowRight', 'ExternalLink'
];

export function BannerEditor({ banner, isEditing, onSave, onCancel }: BannerEditorProps) {
  const [name, setName] = useState(banner?.name || '');
  const [heading, setHeading] = useState(banner?.heading || '');
  const [subheading, setSubheading] = useState(banner?.subheading || '');
  const [backgroundColor, setBackgroundColor] = useState(banner?.background_color || '#273140');
  const [textColor, setTextColor] = useState<'light' | 'dark'>(banner?.text_color || 'light');
  const [isActive, setIsActive] = useState(banner?.is_active ?? true);
  const [displayOrder, setDisplayOrder] = useState(banner?.display_order || 0);
  const [buttons, setButtons] = useState<Partial<BannerButton>[]>(
    banner?.buttons || [{ button_text: '', button_url: '', button_style: 'primary', icon_name: '', display_order: 0 }]
  );
  const [showPreview, setShowPreview] = useState(false);

  const handleAddButton = () => {
    setButtons([
      ...buttons,
      { button_text: '', button_url: '', button_style: 'primary', icon_name: '', display_order: buttons.length }
    ]);
  };

  const handleRemoveButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const handleUpdateButton = (index: number, field: string, value: any) => {
    const updated = [...buttons];
    updated[index] = { ...updated[index], [field]: value };
    setButtons(updated);
  };

  const handleMoveButton = (index: number, direction: 'up' | 'down') => {
    const newButtons = [...buttons];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newButtons.length) return;

    [newButtons[index], newButtons[targetIndex]] = [newButtons[targetIndex], newButtons[index]];
    newButtons.forEach((btn, i) => btn.display_order = i);

    setButtons(newButtons);
  };

  const handleSubmit = () => {
    const bannerData = {
      name,
      heading,
      subheading: subheading || undefined,
      background_color: backgroundColor,
      text_color: textColor,
      is_active: isActive,
      display_order: displayOrder,
    };

    // Clean up buttons data
    const cleanedButtons = buttons.map((btn, index) => ({
      button_text: btn.button_text || '',
      button_url: btn.button_url || '',
      button_style: btn.button_style || 'primary',
      icon_name: btn.icon_name && btn.icon_name.trim() ? btn.icon_name : undefined,
      display_order: index,
    }));

    onSave(bannerData, cleanedButtons);
  };

  const getIcon = (iconName?: string) => {
    if (!iconName) return null;
    const Icon = (Icons as any)[iconName];
    return Icon ? <Icon className="w-5 h-5" /> : null;
  };

  const getButtonClasses = (style: string) => {
    switch (style) {
      case 'primary':
        return 'bg-accent-500 text-white';
      case 'secondary':
        return 'border border-accent-500 text-accent-600';
      case 'outline':
        return 'border-2 border-white text-white';
      default:
        return 'bg-accent-500 text-white';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Edit Banner' : 'Create New Banner'}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Eye className="w-4 h-4" />
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name || !heading || buttons.some(b => !b.button_text || !b.button_url)}
            className="px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Banner
          </button>
        </div>
      </div>

      {showPreview && (
        <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
          <div
            className="text-center py-16 px-4"
            style={{ backgroundColor }}
          >
            <h1 className={`text-3xl md:text-5xl font-semibold mb-4 ${textColor === 'dark' ? 'text-gray-900' : 'text-white'}`}>
              {heading || 'Banner Heading'}
            </h1>
            {subheading && (
              <p className={`text-xl md:text-2xl mb-6 ${textColor === 'dark' ? 'text-gray-700' : 'text-white/90'}`}>
                {subheading}
              </p>
            )}
            <div className="flex flex-wrap gap-4 justify-center">
              {buttons.map((button, index) => {
                const icon = getIcon(button.icon_name);
                const buttonClasses = getButtonClasses(button.button_style || 'primary');

                return button.button_text ? (
                  <div
                    key={index}
                    className={`inline-flex items-center px-6 py-3 rounded-lg text-lg font-medium ${buttonClasses}`}
                  >
                    {icon && <span className="mr-2">{icon}</span>}
                    {button.button_text}
                  </div>
                ) : null;
              })}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Banner Name (Internal) *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Summer Promotion Banner"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Display Order
            </label>
            <input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
              min="0"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Banner Heading *
          </label>
          <input
            type="text"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder="e.g., The Heart of Local Rentals"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Subheading (Optional)
          </label>
          <input
            type="text"
            value={subheading}
            onChange={(e) => setSubheading(e.target.value)}
            placeholder="e.g., Where your family finds their next home"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Background Color
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-16 h-10 rounded border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Text Color
            </label>
            <select
              value={textColor}
              onChange={(e) => setTextColor(e.target.value as 'light' | 'dark')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            >
              <option value="light">Light (White)</option>
              <option value="dark">Dark (Black)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-5 h-5 text-accent-500 border-gray-300 rounded focus:ring-accent-500"
              />
              <span className="ml-2 text-sm text-gray-700">Active</span>
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Buttons</h3>
          <button
            onClick={handleAddButton}
            disabled={buttons.length >= 4}
            className="flex items-center px-3 py-2 text-sm bg-accent-500 text-white rounded-lg hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Button
          </button>
        </div>

        <div className="space-y-4">
          {buttons.map((button, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-4">
                <h4 className="font-medium text-gray-900">Button {index + 1}</h4>
                <div className="flex gap-1">
                  {index > 0 && (
                    <button
                      onClick={() => handleMoveButton(index, 'up')}
                      className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                      title="Move up"
                    >
                      <MoveUp className="w-4 h-4" />
                    </button>
                  )}
                  {index < buttons.length - 1 && (
                    <button
                      onClick={() => handleMoveButton(index, 'down')}
                      className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                      title="Move down"
                    >
                      <MoveDown className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveButton(index)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    title="Remove button"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Button Text *
                  </label>
                  <input
                    type="text"
                    value={button.button_text || ''}
                    onChange={(e) => handleUpdateButton(index, 'button_text', e.target.value)}
                    placeholder="e.g., Find Yours"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Button URL *
                  </label>
                  <input
                    type="text"
                    value={button.button_url || ''}
                    onChange={(e) => handleUpdateButton(index, 'button_url', e.target.value)}
                    placeholder="/browse or https://example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Button Style
                  </label>
                  <select
                    value={button.button_style || 'primary'}
                    onChange={(e) => handleUpdateButton(index, 'button_style', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                  >
                    <option value="primary">Primary (Filled)</option>
                    <option value="secondary">Secondary (Outline)</option>
                    <option value="outline">Outline (White)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Icon (Optional)
                  </label>
                  <select
                    value={button.icon_name || ''}
                    onChange={(e) => handleUpdateButton(index, 'icon_name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                  >
                    <option value="">No Icon</option>
                    {COMMON_ICONS.map(icon => (
                      <option key={icon} value={icon}>{icon}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
