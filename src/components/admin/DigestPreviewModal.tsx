import React from 'react';
import { X, Send, RefreshCw, Mail, List, Link } from 'lucide-react';
import { DigestResponse } from '../../services/digest';

interface DigestPreviewModalProps {
  preview: DigestResponse | null;
  onClose: () => void;
  onSend: () => void;
  onRefresh: () => void;
  loading?: boolean;
}

export function DigestPreviewModal({
  preview,
  onClose,
  onSend,
  onRefresh,
  loading = false,
}: DigestPreviewModalProps) {
  if (!preview) return null;

  const hasListings = preview.listingCount > 0;
  const hasFilterLinks = preview.filter_links && preview.filter_links.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Digest Preview</h2>
            {preview.template_name && (
              <p className="text-sm text-gray-600 mt-1">
                Template: {preview.template_name}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">Total Listings</p>
                  <p className="text-2xl font-bold text-blue-900">{preview.listingCount}</p>
                </div>
                <List className="w-8 h-8 text-blue-400" />
              </div>
            </div>

            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600 font-medium">Recipients</p>
                  <p className="text-2xl font-bold text-green-900">{preview.adminCount}</p>
                </div>
                <Mail className="w-8 h-8 text-green-400" />
              </div>
            </div>

            {hasFilterLinks && (
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-orange-600 font-medium">Filter Links</p>
                    <p className="text-2xl font-bold text-orange-900">
                      {preview.filter_links?.length || 0}
                    </p>
                  </div>
                  <Link className="w-8 h-8 text-orange-400" />
                </div>
              </div>
            )}
          </div>

          {/* Warning for no listings */}
          {!hasListings && !hasFilterLinks && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    No content to send
                  </h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    This digest has no listings or filter links to include. Consider adjusting your template filters or date range.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Listings by Category */}
          {preview.listings_by_category && Object.keys(preview.listings_by_category).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Listings by Category
              </h3>
              <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(preview.listings_by_category).map(([category, count]) => (
                      <tr key={category}>
                        <td className="px-4 py-3 text-sm text-gray-900 capitalize">
                          {category.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                          {count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                        Total
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                        {Object.values(preview.listings_by_category).reduce((sum, count) => sum + (count as number), 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Filter Links */}
          {hasFilterLinks && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Filter Links Included
              </h3>
              <div className="space-y-2">
                {preview.filter_links?.map((link: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-gray-50 rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{link.label}</h4>
                        {link.url && (
                          <p className="text-xs text-gray-500 mt-1 font-mono truncate">
                            {link.url}
                          </p>
                        )}
                      </div>
                      <div className="ml-4">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                          {link.count} {link.count === 1 ? 'listing' : 'listings'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Template Info */}
          {preview.template_type && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    Template Type: {preview.template_type.replace(/_/g, ' ')}
                  </h3>
                  {preview.message && (
                    <p className="mt-1 text-sm text-blue-700">
                      {preview.message}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={onSend}
              disabled={!hasListings && !hasFilterLinks}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4 mr-2" />
              Send Digest
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
