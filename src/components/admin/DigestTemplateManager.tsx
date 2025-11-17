import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Copy, Trash2, Star, Eye, Clock, TrendingUp } from 'lucide-react';
import { digestService, DigestTemplate } from '../../services/digest';

interface DigestTemplateManagerProps {
  onEditTemplate: (template: DigestTemplate) => void;
  onCreateNew: () => void;
  onPreviewTemplate: (template: DigestTemplate) => void;
  selectedTemplateId?: string;
  onSelectTemplate: (templateId: string) => void;
}

const TEMPLATE_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  unsent_only: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  recent_by_category: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  filter_links: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  custom_query: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  mixed_layout: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  all_active: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
};

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  unsent_only: 'Unsent Only',
  recent_by_category: 'Recent by Category',
  filter_links: 'Filter Links',
  custom_query: 'Custom Query',
  mixed_layout: 'Mixed Layout',
  all_active: 'All Active',
};

export function DigestTemplateManager({
  onEditTemplate,
  onCreateNew,
  onPreviewTemplate,
  selectedTemplateId,
  onSelectTemplate,
}: DigestTemplateManagerProps) {
  const [templates, setTemplates] = useState<DigestTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadTemplates = async () => {
    try {
      const data = await digestService.getTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
      setToast({ message: 'Failed to load templates', tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (template: DigestTemplate) => {
    const newName = prompt('Enter name for duplicated template:', `${template.name} (Copy)`);
    if (!newName) return;

    try {
      await digestService.duplicateTemplate(template.id, newName);
      setToast({ message: 'Template duplicated successfully', tone: 'success' });
      loadTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
      setToast({ message: 'Failed to duplicate template', tone: 'error' });
    }
  };

  const handleDelete = async (template: DigestTemplate) => {
    if (template.is_default) {
      alert('Cannot delete default template. Please mark another template as default first.');
      return;
    }

    if (!confirm(`Delete template "${template.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await digestService.deleteTemplate(template.id);
      setToast({ message: 'Template deleted successfully', tone: 'success' });
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      setToast({ message: 'Failed to delete template', tone: 'error' });
    }
  };

  const handleToggleDefault = async (template: DigestTemplate) => {
    if (template.is_default) {
      alert('This template is already the default.');
      return;
    }

    if (!confirm(`Set "${template.name}" as the default template for automated digests?`)) {
      return;
    }

    try {
      // Unset all other defaults
      const allTemplates = await digestService.getTemplates();
      for (const t of allTemplates) {
        if (t.is_default && t.id !== template.id) {
          await digestService.updateTemplate(t.id, { is_default: false });
        }
      }

      // Set this one as default
      await digestService.updateTemplate(template.id, { is_default: true });
      setToast({ message: 'Default template updated', tone: 'success' });
      loadTemplates();
    } catch (error) {
      console.error('Error updating default template:', error);
      setToast({ message: 'Failed to update default template', tone: 'error' });
    }
  };

  const filteredTemplates = templates.filter((template) => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          template.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || template.template_type === filterType;
    return matchesSearch && matchesType;
  });

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading templates...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`p-4 rounded-lg ${toast.tone === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {toast.message}
        </div>
      )}

      {/* Header with Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Total Templates</p>
              <p className="text-2xl font-bold text-blue-900">{templates.length}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-400" />
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Default Template</p>
              <p className="text-sm font-semibold text-green-900 truncate">
                {templates.find(t => t.is_default)?.name || 'None'}
              </p>
            </div>
            <Star className="w-8 h-8 text-green-400 fill-current" />
          </div>
        </div>

        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-600 font-medium">Total Uses</p>
              <p className="text-2xl font-bold text-orange-900">
                {templates.reduce((sum, t) => sum + t.usage_count, 0)}
              </p>
            </div>
            <Clock className="w-8 h-8 text-orange-400" />
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Types</option>
          {Object.entries(TEMPLATE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <button
          onClick={onCreateNew}
          className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Template
        </button>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500 mb-4">
            {searchTerm || filterType !== 'all' ? 'No templates match your filters' : 'No templates yet'}
          </p>
          {!searchTerm && filterType === 'all' && (
            <button
              onClick={onCreateNew}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Your First Template
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredTemplates.map((template) => {
            const colors = TEMPLATE_TYPE_COLORS[template.template_type] || TEMPLATE_TYPE_COLORS.all_active;
            const isSelected = template.id === selectedTemplateId;

            return (
              <div
                key={template.id}
                onClick={() => onSelectTemplate(template.id)}
                className={`bg-white rounded-lg border-2 p-5 transition-all cursor-pointer hover:shadow-md ${
                  isSelected ? 'border-blue-500 shadow-md' : 'border-gray-200'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {template.name}
                      </h3>
                      {template.is_default && (
                        <Star className="w-5 h-5 text-yellow-500 fill-current flex-shrink-0" />
                      )}
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}>
                      {TEMPLATE_TYPE_LABELS[template.template_type]}
                    </span>
                  </div>
                </div>

                {/* Description */}
                {template.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {template.description}
                  </p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                  <div className="flex items-center text-gray-600">
                    <Clock className="w-4 h-4 mr-1" />
                    <span>Used {template.usage_count} times</span>
                  </div>
                  {template.last_used_at && (
                    <div className="flex items-center text-gray-600">
                      <TrendingUp className="w-4 h-4 mr-1" />
                      <span>
                        {new Date(template.last_used_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreviewTemplate(template);
                    }}
                    className="flex-1 flex items-center justify-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                    title="Preview"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Preview
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditTemplate(template);
                    }}
                    className="flex items-center justify-center px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicate(template);
                    }}
                    className="flex items-center justify-center px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                    title="Duplicate"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleDefault(template);
                    }}
                    className={`flex items-center justify-center px-3 py-1.5 text-sm rounded transition-colors ${
                      template.is_default
                        ? 'bg-yellow-100 text-yellow-700 cursor-default'
                        : 'bg-gray-100 text-gray-700 hover:bg-yellow-100 hover:text-yellow-700'
                    }`}
                    title={template.is_default ? 'Default template' : 'Set as default'}
                  >
                    <Star className={`w-4 h-4 ${template.is_default ? 'fill-current' : ''}`} />
                  </button>
                  {!template.is_default && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(template);
                      }}
                      className="flex items-center justify-center px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
