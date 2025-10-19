import React, { useState } from 'react';
import { Monitor, Smartphone, X } from 'lucide-react';
import type { ModalPopup } from '../../services/modals';

interface ModalPreviewProps {
  modal: ModalPopup;
}

export function ModalPreview({ modal }: ModalPreviewProps) {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[#4E4B43]">Preview</h3>
        <div className="flex items-center space-x-2 bg-gray-100 rounded-md p-1">
          <button
            onClick={() => setViewMode('desktop')}
            className={`p-2 rounded ${
              viewMode === 'desktop'
                ? 'bg-white text-[#4E4B43] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="Desktop View"
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('mobile')}
            className={`p-2 rounded ${
              viewMode === 'mobile'
                ? 'bg-white text-[#4E4B43] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="Mobile View"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-gray-100 rounded-lg p-4 min-h-[400px] flex items-center justify-center">
        <div
          className={`bg-white rounded-lg shadow-xl overflow-hidden transition-all ${
            viewMode === 'mobile' ? 'w-full max-w-[360px]' : 'w-full max-w-lg'
          }`}
        >
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h3 className={`font-semibold text-[#273140] text-center flex-1 ${viewMode === 'mobile' ? 'text-lg' : 'text-xl'}`}>
              {modal.heading || 'Modal Heading'}
            </h3>
            <button
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4 text-center">
            {modal.subheading && (
              <p className={`text-gray-700 font-medium ${viewMode === 'mobile' ? 'text-sm' : 'text-base'}`}>
                {modal.subheading}
              </p>
            )}

            {modal.additional_text_lines && modal.additional_text_lines.length > 0 && (
              <div className="space-y-2">
                {modal.additional_text_lines.map((line, index) => (
                  <p key={index} className={`text-gray-600 ${viewMode === 'mobile' ? 'text-xs' : 'text-sm'}`}>
                    {line || `Text line ${index + 1}`}
                  </p>
                ))}
              </div>
            )}

            <div className="pt-4">
              <button
                disabled
                className={`w-full bg-accent-500 text-white rounded-md font-medium transition-colors cursor-not-allowed ${
                  viewMode === 'mobile' ? 'px-4 py-2 text-sm' : 'px-6 py-3 text-base'
                }`}
              >
                {modal.button_text || 'Click Here'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 p-4 bg-gray-50 rounded-md">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Display Info</h4>
        <div className="space-y-1 text-xs text-gray-600">
          <div>
            <span className="font-medium">Pages:</span>{' '}
            {modal.trigger_pages.length === 0 || modal.trigger_pages.includes('*')
              ? 'All pages'
              : modal.trigger_pages.join(', ')}
          </div>
          <div>
            <span className="font-medium">Frequency:</span>{' '}
            {modal.display_frequency === 'custom_interval'
              ? `Every ${modal.custom_interval_hours || 24} hours`
              : modal.display_frequency.replace(/_/g, ' ')}
          </div>
          <div>
            <span className="font-medium">Delay:</span> {modal.delay_seconds} seconds
          </div>
          <div>
            <span className="font-medium">Priority:</span> {modal.priority}
          </div>
          <div>
            <span className="font-medium">Status:</span>{' '}
            <span className={modal.is_active ? 'text-green-600' : 'text-gray-500'}>
              {modal.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
