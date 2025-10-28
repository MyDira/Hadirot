import React, { useState, useEffect } from 'react';
import { Mail, Clock, Users, Settings, Send, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import {
  getDailyCardsConfig,
  updateDailyCardsConfig,
  getDailyCardsLogs,
  getDailyCardsStats,
  triggerManualExecution,
  DailyCardsConfig,
  DailyCardsLog,
} from '../../services/dailyCards';

export default function DailyCardsSettings() {
  const [config, setConfig] = useState<DailyCardsConfig | null>(null);
  const [logs, setLogs] = useState<DailyCardsLog[]>([]);
  const [stats, setStats] = useState({
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    successRate: 0,
    lastSuccessfulRun: null as string | null,
    averageExecutionTime: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [configData, logsData, statsData] = await Promise.all([
        getDailyCardsConfig(),
        getDailyCardsLogs(20),
        getDailyCardsStats(),
      ]);
      setConfig(configData);
      setLogs(logsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading data:', error);
      showMessage('error', 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleSaveConfig = async () => {
    if (!config) return;

    try {
      setSaving(true);
      await updateDailyCardsConfig({
        enabled: config.enabled,
        delivery_time: config.delivery_time,
        recipient_emails: config.recipient_emails,
        max_listings: config.max_listings,
        include_featured_only: config.include_featured_only,
        days_to_include: config.days_to_include,
        timezone: config.timezone,
        whatsapp_group_url: config.whatsapp_group_url,
      });
      showMessage('success', 'Configuration saved successfully');
      await loadData();
    } catch (error) {
      console.error('Error saving config:', error);
      showMessage('error', 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerManual = async () => {
    try {
      setTriggering(true);
      const result = await triggerManualExecution();

      if (result.success) {
        showMessage('success', `Email sent successfully with ${result.listingsCount || 0} listings`);
        await loadData();
      } else {
        showMessage('error', result.error || 'Failed to send email');
      }
    } catch (error) {
      console.error('Error triggering manual execution:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to trigger email');
    } finally {
      setTriggering(false);
    }
  };

  const handleAddEmail = () => {
    if (!config || !emailInput.trim()) return;

    const email = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage('error', 'Please enter a valid email address');
      return;
    }

    if (config.recipient_emails.includes(email)) {
      showMessage('error', 'Email already in list');
      return;
    }

    setConfig({
      ...config,
      recipient_emails: [...config.recipient_emails, email],
    });
    setEmailInput('');
  };

  const handleRemoveEmail = (email: string) => {
    if (!config) return;
    setConfig({
      ...config,
      recipient_emails: config.recipient_emails.filter((e) => e !== email),
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-gray-600">Loading configuration...</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Configuration not found. Please contact support.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Daily Listing Cards</h2>
        <p className="text-gray-600">
          Configure automated daily emails with new listings in a WhatsApp-optimized text format.
        </p>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center">
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 mr-2" />
            ) : (
              <XCircle className="w-5 h-5 mr-2" />
            )}
            {message.text}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center mb-2">
            <Mail className="w-5 h-5 text-blue-600 mr-2" />
            <h3 className="font-semibold text-gray-900">Total Runs</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.totalRuns}</p>
          <p className="text-sm text-gray-600 mt-1">Past 30 executions</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center mb-2">
            <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
            <h3 className="font-semibold text-gray-900">Success Rate</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.successRate.toFixed(1)}%</p>
          <p className="text-sm text-gray-600 mt-1">
            {stats.successfulRuns} successful, {stats.failedRuns} failed
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center mb-2">
            <Clock className="w-5 h-5 text-purple-600 mr-2" />
            <h3 className="font-semibold text-gray-900">Avg. Time</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {(stats.averageExecutionTime / 1000).toFixed(1)}s
          </p>
          <p className="text-sm text-gray-600 mt-1">Execution time</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Settings className="w-5 h-5 text-gray-700 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Configuration</h3>
          </div>
          <button
            onClick={handleTriggerManual}
            disabled={triggering || !config.enabled || config.recipient_emails.length === 0}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4 mr-2" />
            {triggering ? 'Sending...' : 'Send Test Email Now'}
          </button>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="font-medium text-gray-900">Enable Daily Emails</label>
              <p className="text-sm text-gray-600">Automatically send emails at scheduled time</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div>
            <label className="block font-medium text-gray-900 mb-2">Delivery Time</label>
            <input
              type="time"
              value={config.delivery_time}
              onChange={(e) => setConfig({ ...config, delivery_time: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-600 mt-1">Time zone: {config.timezone}</p>
          </div>

          <div>
            <label className="block font-medium text-gray-900 mb-2">Recipient Emails</label>
            <div className="flex gap-2 mb-3">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddEmail()}
                placeholder="Enter email address"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleAddEmail}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add
              </button>
            </div>
            <div className="space-y-2">
              {config.recipient_emails.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No recipients configured</p>
              ) : (
                config.recipient_emails.map((email) => (
                  <div
                    key={email}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <span className="text-gray-700">{email}</span>
                    <button
                      onClick={() => handleRemoveEmail(email)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="block font-medium text-gray-900 mb-2">WhatsApp Group URL</label>
            <input
              type="url"
              value={config.whatsapp_group_url}
              onChange={(e) => setConfig({ ...config, whatsapp_group_url: e.target.value })}
              placeholder="https://chat.whatsapp.com/..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-600 mt-1">
              This link will be included at the bottom of each email
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-gray-900 mb-2">Max Listings</label>
              <input
                type="number"
                value={config.max_listings}
                onChange={(e) =>
                  setConfig({ ...config, max_listings: parseInt(e.target.value) || 20 })
                }
                min="1"
                max="100"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center p-4 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="featured-only"
                checked={config.include_featured_only}
                onChange={(e) =>
                  setConfig({ ...config, include_featured_only: e.target.checked })
                }
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="featured-only" className="ml-3 text-sm font-medium text-gray-900">
                Featured listings only
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              onClick={handleSaveConfig}
              disabled={saving}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center mb-4">
          <AlertCircle className="w-5 h-5 text-gray-700 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">Recent Executions</h3>
        </div>

        {logs.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No executions yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Listings
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Trigger
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatDate(log.run_at)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {log.success ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <XCircle className="w-3 h-3 mr-1" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{log.listings_count}</td>
                    <td className="px-4 py-3 text-sm">
                      {log.email_sent ? (
                        <span className="text-green-600">Sent</span>
                      ) : (
                        <span className="text-gray-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {(log.execution_time_ms / 1000).toFixed(2)}s
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                      {log.triggered_by}
                    </td>
                    <td className="px-4 py-3 text-sm text-red-600">
                      {log.error_message ? (
                        <span className="truncate max-w-xs block" title={log.error_message}>
                          {log.error_message}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
