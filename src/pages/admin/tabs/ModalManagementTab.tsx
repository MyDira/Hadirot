import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Power, Eye, MousePointerClick, X as XIcon } from 'lucide-react';
import { modalsService, type ModalPopup } from '../../../services/modals';
import { ModalEditor } from '../ModalEditor';

export default function ModalManagementTab() {
  const [modals, setModals] = useState<ModalPopup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingModal, setEditingModal] = useState<ModalPopup | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statistics, setStatistics] = useState<Record<string, {
    totalShown: number;
    totalClicked: number;
    totalDismissed: number;
    clickThroughRate: number;
  }>>({});

  const loadModals = async () => {
    try {
      setLoading(true);
      const data = await modalsService.getAllModals();
      setModals(data);

      const stats: typeof statistics = {};
      for (const modal of data) {
        const modalStats = await modalsService.getModalStatistics(modal.id);
        stats[modal.id] = modalStats;
      }
      setStatistics(stats);
    } catch (error) {
      console.error('Error loading modals:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModals();
  }, []);

  const handleCreateNew = () => {
    setEditingModal(null);
    setIsEditorOpen(true);
  };

  const handleEdit = (modal: ModalPopup) => {
    setEditingModal(modal);
    setIsEditorOpen(true);
  };

  const handleDelete = async (modal: ModalPopup) => {
    if (!confirm(`Are you sure you want to delete "${modal.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await modalsService.deleteModal(modal.id);
      await loadModals();
    } catch (error) {
      console.error('Error deleting modal:', error);
      alert('Failed to delete modal. Please try again.');
    }
  };

  const handleToggleActive = async (modal: ModalPopup) => {
    try {
      await modalsService.updateModal(modal.id, { is_active: !modal.is_active });
      await loadModals();
    } catch (error) {
      console.error('Error toggling modal active status:', error);
      alert('Failed to update modal status. Please try again.');
    }
  };

  const handleEditorClose = async (shouldReload: boolean) => {
    setIsEditorOpen(false);
    setEditingModal(null);
    if (shouldReload) {
      await loadModals();
    }
  };

  const filteredModals = modals.filter((modal) =>
    modal.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getFrequencyLabel = (frequency: ModalPopup['display_frequency']) => {
    const labels: Record<ModalPopup['display_frequency'], string> = {
      once_per_session: 'Once per session',
      once_per_day: 'Once per day',
      once_per_lifetime: 'Once per lifetime',
      until_clicked: 'Until clicked',
      custom_interval: 'Custom interval',
    };
    return labels[frequency];
  };

  if (isEditorOpen) {
    return <ModalEditor modal={editingModal} onClose={handleEditorClose} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#4E4B43]">Modal Management</h2>
          <p className="text-gray-600 mt-1">Create and manage custom popup modals for your site</p>
        </div>
        <button
          onClick={handleCreateNew}
          className="flex items-center px-4 py-2 bg-[#4E4B43] text-white rounded-md hover:bg-[#3a3832] transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Create New Modal
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search modals by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-[#4E4B43] focus:border-[#4E4B43]"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4E4B43] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading modals...</p>
        </div>
      ) : filteredModals.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div className="text-gray-400 mb-4">
            <Eye className="w-16 h-16 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No modals found</h3>
          <p className="text-gray-500 mb-4">
            {searchTerm ? 'Try adjusting your search criteria' : 'Get started by creating your first modal'}
          </p>
          {!searchTerm && (
            <button
              onClick={handleCreateNew}
              className="inline-flex items-center px-4 py-2 bg-[#4E4B43] text-white rounded-md hover:bg-[#3a3832] transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create New Modal
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
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
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredModals.map((modal) => {
                const stats = statistics[modal.id] || {
                  totalShown: 0,
                  totalClicked: 0,
                  totalDismissed: 0,
                  clickThroughRate: 0,
                };

                return (
                  <tr key={modal.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{modal.name}</div>
                        <div className="text-sm text-gray-500">{modal.heading}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          modal.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {modal.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {modal.trigger_pages.length === 0 || modal.trigger_pages.includes('*') ? (
                          <span className="text-gray-500 italic">All pages</span>
                        ) : (
                          <div className="space-y-1">
                            {modal.trigger_pages.slice(0, 2).map((page, idx) => (
                              <div key={idx} className="text-xs">
                                {page}
                              </div>
                            ))}
                            {modal.trigger_pages.length > 2 && (
                              <div className="text-xs text-gray-500">
                                +{modal.trigger_pages.length - 2} more
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getFrequencyLabel(modal.display_frequency)}
                      {modal.display_frequency === 'custom_interval' && modal.custom_interval_hours && (
                        <div className="text-xs text-gray-500">
                          Every {modal.custom_interval_hours}h
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center text-gray-600">
                          <Eye className="w-3 h-3 mr-1" />
                          {stats.totalShown} shown
                        </div>
                        <div className="flex items-center text-green-600">
                          <MousePointerClick className="w-3 h-3 mr-1" />
                          {stats.totalClicked} clicked
                        </div>
                        <div className="flex items-center text-gray-600">
                          <XIcon className="w-3 h-3 mr-1" />
                          {stats.totalDismissed} dismissed
                        </div>
                        {stats.totalShown > 0 && (
                          <div className="text-gray-500 font-medium">
                            CTR: {stats.clickThroughRate.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handleToggleActive(modal)}
                          className={`transition-colors ${
                            modal.is_active
                              ? 'text-red-600 hover:text-red-800'
                              : 'text-green-600 hover:text-green-800'
                          }`}
                          title={modal.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Power className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleEdit(modal)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Edit Modal"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(modal)}
                          className="text-red-600 hover:text-red-800 transition-colors"
                          title="Delete Modal"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
