import React from 'react';
import { Plus, Edit, Trash2, Eye, EyeOff, MoveUp, MoveDown } from 'lucide-react';
import { HeroBanner } from '../../config/supabase';

interface BannerManagementProps {
  banners: HeroBanner[];
  onToggleActive: (bannerId: string, currentActive: boolean) => void;
  onDelete: (bannerId: string) => void;
  onCreate: () => void;
  onEdit: (banner: HeroBanner) => void;
  onReorder: (bannerId: string, direction: 'up' | 'down') => void;
}

export function BannerManagement({
  banners,
  onToggleActive,
  onDelete,
  onCreate,
  onEdit,
  onReorder,
}: BannerManagementProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Hero Banners</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage homepage hero banners. Banners are displayed in order and can be configured as a carousel.
          </p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Banner
        </button>
      </div>

      {banners.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No banners created yet</h3>
          <p className="text-gray-600 mb-4">Create your first hero banner to get started</p>
          <button
            onClick={onCreate}
            className="inline-flex items-center px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Banner
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {banners.map((banner, index) => (
            <div
              key={banner.id}
              className={`bg-white border-2 rounded-lg p-6 transition-all ${
                banner.is_active ? 'border-green-200 bg-green-50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{banner.name}</h3>
                    {banner.is_default && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                        Default
                      </span>
                    )}
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${
                        banner.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {banner.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                      Order: {banner.display_order}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Heading:</span> {banner.heading}
                    </p>
                    {banner.subheading && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Subheading:</span> {banner.subheading}
                      </p>
                    )}
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Buttons:</span> {banner.buttons?.length || 0}
                    </p>
                  </div>

                  {/* Banner Preview */}
                  <div
                    className="mt-4 rounded-lg p-4 text-center"
                    style={{ backgroundColor: banner.background_color }}
                  >
                    <h4
                      className={`text-xl font-semibold mb-2 ${
                        banner.text_color === 'dark' ? 'text-gray-900' : 'text-white'
                      }`}
                    >
                      {banner.heading}
                    </h4>
                    {banner.subheading && (
                      <p
                        className={`text-sm ${
                          banner.text_color === 'dark' ? 'text-gray-700' : 'text-white/90'
                        }`}
                      >
                        {banner.subheading}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  <button
                    onClick={() => onToggleActive(banner.id, banner.is_active)}
                    className={`p-2 rounded transition-colors ${
                      banner.is_active
                        ? 'text-gray-600 hover:bg-gray-100'
                        : 'text-green-600 hover:bg-green-50'
                    }`}
                    title={banner.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {banner.is_active ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>

                  <button
                    onClick={() => onEdit(banner)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Edit Banner"
                  >
                    <Edit className="w-5 h-5" />
                  </button>

                  {index > 0 && (
                    <button
                      onClick={() => onReorder(banner.id, 'up')}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      title="Move Up"
                    >
                      <MoveUp className="w-5 h-5" />
                    </button>
                  )}

                  {index < banners.length - 1 && (
                    <button
                      onClick={() => onReorder(banner.id, 'down')}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      title="Move Down"
                    >
                      <MoveDown className="w-5 h-5" />
                    </button>
                  )}

                  {!banner.is_default && (
                    <button
                      onClick={() => onDelete(banner.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete Banner"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
