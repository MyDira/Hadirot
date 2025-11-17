import React, { useState, useEffect } from 'react';
import { Mail, Send, Eye, Clock, CheckCircle, XCircle, AlertCircle, BarChart3, Edit2, List, Filter as FilterIcon, History } from 'lucide-react';
import { digestService, DigestTemplate, DigestResponse } from '../../services/digest';
import { supabase } from '../../config/supabase';
import { DigestTemplateManager } from './DigestTemplateManager';
import { DigestTemplateEditor } from './DigestTemplateEditor';
import { FilterPresetManager } from './FilterPresetManager';
import { DigestHistoryView } from './DigestHistoryView';
import { DigestPreviewModal } from './DigestPreviewModal';

export function EmailToolsSection() {
  const [subSection, setSubSection] = useState<'overview' | 'templates' | 'presets' | 'history'>('overview');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  // Overview state
  const [digestConfig, setDigestConfig] = useState<any>(null);
  const [digestLogs, setDigestLogs] = useState<any[]>([]);
  const [updatingConfig, setUpdatingConfig] = useState(false);
  const [editingDeliveryTime, setEditingDeliveryTime] = useState(false);
  const [tempDeliveryTime, setTempDeliveryTime] = useState('');

  // Templates state
  const [digestTemplates, setDigestTemplates] = useState<DigestTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [editingTemplate, setEditingTemplate] = useState<DigestTemplate | null>(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);

  // Preview and send state
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<DigestResponse | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load digest config
      const { data: configData, error: configError } = await supabase
        .from('daily_admin_digest_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (!configError) {
        setDigestConfig(configData);
        if (configData?.delivery_time) {
          setTempDeliveryTime(configData.delivery_time);
        }
      }

      // Load digest logs
      const { data: logsData, error: logsError } = await supabase
        .from('daily_admin_digest_logs')
        .select('*')
        .order('run_at', { ascending: false })
        .limit(10);

      if (!logsError) {
        setDigestLogs(logsData || []);
      }

      // Load templates
      const templates = await digestService.getTemplates();
      setDigestTemplates(templates);

      // Set default template
      const defaultTemplate = templates.find(t => t.is_default);
      if (defaultTemplate && !selectedTemplateId) {
        setSelectedTemplateId(defaultTemplate.id);
      }
    } catch (error) {
      console.error('Error loading email tools data:', error);
      setToast({ message: 'Failed to load data', tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const toggleDigestEnabled = async () => {
    if (!digestConfig) return;
    setUpdatingConfig(true);
    try {
      const newEnabledState = !digestConfig.enabled;
      const { error } = await supabase
        .from('daily_admin_digest_config')
        .update({ enabled: newEnabledState, updated_at: new Date().toISOString() })
        .eq('id', digestConfig.id);

      if (error) throw error;

      setDigestConfig({ ...digestConfig, enabled: newEnabledState });
      setToast({
        message: `Daily digest ${newEnabledState ? 'enabled' : 'disabled'} successfully`,
        tone: 'success'
      });
    } catch (error) {
      console.error('Error toggling digest:', error);
      setToast({ message: 'Failed to update configuration', tone: 'error' });
    } finally {
      setUpdatingConfig(false);
    }
  };

  const updateDeliveryTime = async () => {
    if (!digestConfig || !tempDeliveryTime) return;
    setUpdatingConfig(true);
    try {
      const { error } = await supabase
        .from('daily_admin_digest_config')
        .update({ delivery_time: tempDeliveryTime, updated_at: new Date().toISOString() })
        .eq('id', digestConfig.id);

      if (error) throw error;

      setDigestConfig({ ...digestConfig, delivery_time: tempDeliveryTime });
      setEditingDeliveryTime(false);
      setToast({ message: 'Delivery time updated successfully', tone: 'success' });
    } catch (error) {
      console.error('Error updating delivery time:', error);
      setToast({ message: 'Failed to update delivery time', tone: 'error' });
    } finally {
      setUpdatingConfig(false);
    }
  };

  const handlePreview = async () => {
    try {
      const result = await digestService.sendDigest({
        template_id: selectedTemplateId || undefined,
        dry_run: true,
      });
      setPreview(result);
      setShowPreview(true);
      setToast({ message: 'Preview loaded successfully', tone: 'success' });
    } catch (error) {
      console.error('Error previewing digest:', error);
      setToast({ message: error instanceof Error ? error.message : 'Failed to preview digest', tone: 'error' });
    }
  };

  const handleSend = async () => {
    const selectedTemplate = digestTemplates.find(t => t.id === selectedTemplateId);
    const confirmMessage = selectedTemplate
      ? `Send digest using "${selectedTemplate.name}" template? This will send an email to all admins.`
      : 'Send digest email now? This will send an email to all admins.';

    if (!confirm(confirmMessage)) return;

    setSending(true);
    try {
      const result = await digestService.sendDigest({
        template_id: selectedTemplateId || undefined,
        dry_run: false,
      });

      if (result.listingCount === 0) {
        setToast({ message: 'No listings to send in the digest.', tone: 'success' });
      } else {
        setToast({
          message: `Digest sent successfully! ${result.listingCount} listing(s) sent to ${result.adminCount} admin(s).`,
          tone: 'success'
        });
      }

      setShowPreview(false);
      loadData();
    } catch (error) {
      console.error('Error sending digest:', error);
      setToast({
        message: error instanceof Error ? error.message : 'Failed to send digest',
        tone: 'error'
      });
    } finally {
      setSending(false);
    }
  };

  const handleEditTemplate = (template: DigestTemplate) => {
    setEditingTemplate(template);
    setShowTemplateEditor(true);
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setShowTemplateEditor(true);
  };

  const handlePreviewTemplate = (template: DigestTemplate) => {
    setSelectedTemplateId(template.id);
    handlePreview();
  };

  const handleTemplateSaved = () => {
    setShowTemplateEditor(false);
    setEditingTemplate(null);
    loadData();
    setToast({ message: 'Template saved successfully', tone: 'success' });
  };

  const handleCancelTemplateEdit = () => {
    setShowTemplateEditor(false);
    setEditingTemplate(null);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading email tools...</p>
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

      {/* Sub-navigation */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <nav className="flex border-b border-gray-200">
          <button
            onClick={() => setSubSection('overview')}
            className={`flex items-center px-6 py-4 text-sm font-medium transition-colors ${
              subSection === 'overview'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Mail className="w-5 h-5 mr-2" />
            Overview & Send
          </button>
          <button
            onClick={() => setSubSection('templates')}
            className={`flex items-center px-6 py-4 text-sm font-medium transition-colors ${
              subSection === 'templates'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <List className="w-5 h-5 mr-2" />
            Templates
          </button>
          <button
            onClick={() => setSubSection('presets')}
            className={`flex items-center px-6 py-4 text-sm font-medium transition-colors ${
              subSection === 'presets'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FilterIcon className="w-5 h-5 mr-2" />
            Filter Presets
          </button>
          <button
            onClick={() => setSubSection('history')}
            className={`flex items-center px-6 py-4 text-sm font-medium transition-colors ${
              subSection === 'history'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <History className="w-5 h-5 mr-2" />
            History
          </button>
        </nav>

        <div className="p-6">
          {/* Overview Section */}
          {subSection === 'overview' && (
            <div className="space-y-6">
              {/* Configuration Status */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Daily Digest Email System</h2>
                <p className="text-sm text-gray-600 mb-6">
                  Automatically sends digest emails to admins with new approved listings
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  {/* Status Toggle */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Automated Digest</span>
                      <button
                        type="button"
                        onClick={toggleDigestEnabled}
                        disabled={updatingConfig}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          digestConfig?.enabled ? 'bg-green-600' : 'bg-gray-300'
                        } ${updatingConfig ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                          digestConfig?.enabled ? 'translate-x-5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                    <div className={`flex items-center ${digestConfig?.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                      {digestConfig?.enabled ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-1" />
                          <span className="text-xs font-semibold">Active</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 mr-1" />
                          <span className="text-xs font-semibold">Inactive</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Delivery Time */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Delivery Time</span>
                      {!editingDeliveryTime && (
                        <button
                          onClick={() => setEditingDeliveryTime(true)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {editingDeliveryTime ? (
                      <div className="space-y-2">
                        <input
                          type="time"
                          value={tempDeliveryTime}
                          onChange={(e) => setTempDeliveryTime(e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={updateDeliveryTime}
                            disabled={updatingConfig}
                            className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingDeliveryTime(false)}
                            className="flex-1 px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center text-gray-900">
                        <Clock className="w-4 h-4 mr-1 text-blue-600" />
                        <span className="text-xs font-semibold">
                          {digestConfig?.delivery_time ? new Date('2000-01-01T' + digestConfig.delivery_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'N/A'} EST
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Last Run */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Last Successful Run</span>
                    </div>
                    <div className="flex items-center text-gray-900">
                      <BarChart3 className="w-4 h-4 mr-1 text-blue-600" />
                      <span className="text-xs font-semibold">
                        {digestLogs.find(log => log.success)
                          ? new Date(digestLogs.find(log => log.success)!.run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : 'Never'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-900">
                      <p className="font-medium mb-1">How it works:</p>
                      <ul className="list-disc list-inside space-y-1 text-blue-800">
                        <li>When <strong>Active</strong>, the system sends automatic digest emails at the scheduled time</li>
                        <li>You can manually trigger a digest anytime using the button below</li>
                        <li>Manual triggers work regardless of the Active/Inactive status</li>
                        <li>Select different templates to customize what gets sent</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Send Digest Section */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Send Digest Email</h3>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Digest Template
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {digestTemplates.length === 0 ? (
                      <option value="">No templates available</option>
                    ) : (
                      digestTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} {template.is_default ? '(Default)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                  {selectedTemplateId && digestTemplates.find(t => t.id === selectedTemplateId) && (
                    <p className="mt-2 text-sm text-gray-600">
                      {digestTemplates.find(t => t.id === selectedTemplateId)?.description || 'No description available'}
                    </p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handlePreview}
                    disabled={!selectedTemplateId || sending}
                    className="flex items-center px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Preview
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={!selectedTemplateId || sending}
                    className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors shadow-md"
                  >
                    {sending ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5 mr-2" />
                        Send Now
                      </>
                    )}
                  </button>
                </div>

                <p className="mt-4 text-xs text-gray-500">
                  This will send an email to all admins based on the selected template configuration.
                </p>
              </div>
            </div>
          )}

          {/* Templates Section */}
          {subSection === 'templates' && (
            <DigestTemplateManager
              onEditTemplate={handleEditTemplate}
              onCreateNew={handleCreateTemplate}
              onPreviewTemplate={handlePreviewTemplate}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
            />
          )}

          {/* Filter Presets Section */}
          {subSection === 'presets' && (
            <FilterPresetManager onPresetsChange={loadData} />
          )}

          {/* History Section */}
          {subSection === 'history' && (
            <DigestHistoryView />
          )}
        </div>
      </div>

      {/* Template Editor Modal */}
      {showTemplateEditor && (
        <DigestTemplateEditor
          template={editingTemplate}
          onSave={handleTemplateSaved}
          onCancel={handleCancelTemplateEdit}
        />
      )}

      {/* Preview Modal */}
      {showPreview && preview && (
        <DigestPreviewModal
          preview={preview}
          onClose={() => setShowPreview(false)}
          onSend={handleSend}
          onRefresh={handlePreview}
          loading={sending}
        />
      )}
    </div>
  );
}
