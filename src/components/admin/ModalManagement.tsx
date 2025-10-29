import React, { useState } from 'react';
import { Search, Plus, Eye, EyeOff, Edit2, Trash2, Power, Save, X, BarChart3 } from 'lucide-react';
import { ModalPopup, CreateModalInput } from '../../services/modals';
import { ModalPreview } from './ModalPreview';

interface ModalManagementProps {
  modals: ModalPopup[];
  modalStats: { [key: string]: { totalShown: number; totalClicked: number; totalDismissed: number; clickThroughRate: number } };
  onToggleActive: (modalId: string, currentActive: boolean) => void;
  onDelete: (modalId: string) => void;
  onCreate: () => void;
  onEdit: (modal: ModalPopup) => void;
}

export function ModalManagement({ modals, modalStats, onToggleActive, onDelete, onCreate, onEdit }: ModalManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredModals = modals.filter(modal =>
    modal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    modal.heading.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getPageLabel = (triggerPages: string[]) => {
    if (!triggerPages || triggerPages.length === 0 || triggerPages.includes('*')) {
      return 'All pages';
    }
    const pageMap: { [key: string]: string } = {
      '/': 'Home',
      '/browse': 'Browse',
      '/listing/*': 'Listing Details',
      '/post': 'Post Listing',
      '/about': 'About',
      '/contact': 'Contact',
    };
    return triggerPages.map(p => pageMap[p] || p).join(', ');
  };

  const getFrequencyLabel = (frequency: string, customHours?: number) => {
    if (frequency === 'custom_interval') {
      return `Every ${customHours || 24} hours`;
    }
    return frequency.replace(/_/g, ' ');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Modal Management</h2>
          <p className="text-sm text-gray-500 mt-1">Create and manage custom popup modals for your site</p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create New Modal
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search modals by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"
        />
      </div>

      {/* Modals Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pages
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Frequency
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Statistics
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredModals.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  {searchTerm ? 'No modals found matching your search' : 'No modals created yet'}
                </td>
              </tr>
            ) : (
              filteredModals.map((modal) => {
                const stats = modalStats[modal.id] || { totalShown: 0, totalClicked: 0, totalDismissed: 0, clickThroughRate: 0 };

                return (
                  <tr key={modal.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900">{modal.name}</div>
                        <div className="text-sm text-gray-500">{modal.heading}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        modal.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {modal.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {getPageLabel(modal.trigger_pages)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {getFrequencyLabel(modal.display_frequency, modal.custom_interval_hours)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4 text-xs text-gray-600">
                        <div className="flex items-center">
                          <Eye className="w-3 h-3 mr-1" />
                          <span>{stats.totalShown} shown</span>
                        </div>
                        <div className="flex items-center">
                          <BarChart3 className="w-3 h-3 mr-1" />
                          <span>{stats.totalClicked} clicked</span>
                        </div>
                        <div className="flex items-center">
                          <X className="w-3 h-3 mr-1" />
                          <span>{stats.totalDismissed} dismissed</span>
                        </div>
                        <div className="font-medium">
                          CTR: {stats.clickThroughRate.toFixed(1)}%
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onToggleActive(modal.id, modal.is_active)}
                          className={`p-2 rounded transition-colors ${
                            modal.is_active
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                          title={modal.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onEdit(modal)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit Modal"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDelete(modal.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete Modal"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
