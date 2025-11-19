import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Save, RotateCcw, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { digestGlobalSettingsService, DigestGlobalSettings } from '@/services/digestGlobalSettings';

export function DigestGlobalSettings() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<DigestGlobalSettings | null>(null);
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [characterLimit, setCharacterLimit] = useState(4000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!profile?.is_admin) {
      navigate('/');
      return;
    }
    loadSettings();
  }, [profile, navigate]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await digestGlobalSettingsService.getSettings();
      setSettings(data);
      setHeaderText(data.default_header_text);
      setFooterText(data.default_footer_text);
      setCharacterLimit(data.whatsapp_character_limit);
    } catch (error) {
      console.error('Error loading settings:', error);
      setToast({ message: 'Failed to load settings', tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!headerText.trim()) {
      setToast({ message: 'Header text cannot be empty', tone: 'error' });
      return;
    }

    if (!footerText.trim()) {
      setToast({ message: 'Footer text cannot be empty', tone: 'error' });
      return;
    }

    setSaving(true);
    try {
      await digestGlobalSettingsService.updateSettings({
        default_header_text: headerText,
        default_footer_text: footerText,
        whatsapp_character_limit: characterLimit,
      });
      setToast({ message: 'Settings saved successfully', tone: 'success' });
      loadSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      setToast({ message: 'Failed to save settings', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset to default settings? This will overwrite your current settings.')) {
      return;
    }

    setSaving(true);
    try {
      await digestGlobalSettingsService.resetToDefaults();
      setToast({ message: 'Settings reset to defaults', tone: 'success' });
      loadSettings();
    } catch (error) {
      console.error('Error resetting settings:', error);
      setToast({ message: 'Failed to reset settings', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!profile?.is_admin) {
    return null;
  }

  const headerCharCount = headerText.length;
  const footerCharCount = footerText.length;
  const totalCharCount = headerCharCount + footerCharCount;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <Settings className="w-8 h-8 mr-3 text-blue-600" />
                Global Digest Settings
              </h1>
              <p className="mt-2 text-gray-600">
                Configure default header and footer text used in all digest emails
              </p>
            </div>
            <button
              onClick={() => navigate('/admin/digest')}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back to Digests
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mb-6 p-4 rounded-lg ${toast.tone === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {toast.message}
          </div>
        )}

        {/* Info Banner */}
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">About Global Settings</p>
            <p>
              These settings apply to all digest templates by default. Individual templates can override these settings if needed.
              Changes here will affect all future digests that use global defaults.
            </p>
          </div>
        </div>

        {/* Settings Form */}
        <div className="space-y-6">
          {/* Header Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Default Header Text</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Introduction text that appears at the beginning of all digests
                </p>
              </div>
              <div className="text-sm text-gray-500">
                {headerCharCount} characters
              </div>
            </div>

            <textarea
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-sans"
              placeholder="Here are the latest apartments posted on Hadirot:"
            />

            <div className="mt-3 bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-xs font-medium text-gray-700 mb-2">Preview:</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{headerText || '(empty)'}</p>
            </div>
          </div>

          {/* Footer Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Default Footer Text</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Conclusion text with WhatsApp link that appears at the end of all digests
                </p>
              </div>
              <div className="text-sm text-gray-500">
                {footerCharCount} characters
              </div>
            </div>

            <textarea
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-sans"
              placeholder="Join the Hadirot WhatsApp Community:&#10;https://chat.whatsapp.com/..."
            />

            <div className="mt-3 bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-xs font-medium text-gray-700 mb-2">Preview:</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{footerText || '(empty)'}</p>
            </div>
          </div>

          {/* Character Limit Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">WhatsApp Character Limit</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Maximum message length for WhatsApp compatibility (default: 4000)
                </p>
              </div>
            </div>

            <input
              type="number"
              value={characterLimit}
              onChange={(e) => setCharacterLimit(parseInt(e.target.value) || 4000)}
              min="1000"
              max="10000"
              step="100"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />

            <p className="mt-2 text-sm text-gray-500">
              Recommended: 4000 characters for optimal WhatsApp compatibility
            </p>
          </div>

          {/* Summary Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm text-blue-600 font-medium">Header Characters</p>
                <p className="text-2xl font-bold text-blue-900">{headerCharCount}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <p className="text-sm text-green-600 font-medium">Footer Characters</p>
                <p className="text-2xl font-bold text-green-900">{footerCharCount}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200 col-span-2">
                <p className="text-sm text-purple-600 font-medium">Total Base Characters</p>
                <p className="text-2xl font-bold text-purple-900">{totalCharCount}</p>
                <p className="text-xs text-purple-600 mt-1">
                  This is the base character count before adding collections and listings
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex justify-between">
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex items-center px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="w-5 h-5 mr-2" />
            Reset to Defaults
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
