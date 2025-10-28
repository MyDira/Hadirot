/**
 * Daily Cards Settings Admin Page
 *
 * Configure and manage the automated daily listing cards email system
 */

import React, { useState, useEffect } from 'react';
import { Mail, Clock, Users, Calendar, Zap, CheckCircle, XCircle, Loader } from 'lucide-react';
import {
  getDailyCardsConfig,
  updateDailyCardsConfig,
  getDailyCardsLogs,
  triggerManualExecution,
  getDailyCardsStats,
  DailyCardsConfig,
  DailyCardsLog,
} from '../../services/dailyCards';

export default function DailyCardsSettings() {
  const [config, setConfig] = useState<DailyCardsConfig | null>(null);
  const [logs, setLogs] = useState<DailyCardsLog[]>([]);
  const [stats, setStats] = useState<{
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    successRate: number;
    lastSuccessfulRun: string | null;
    averageExecutionTime: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [deliveryTime, setDeliveryTime] = useState('06:00');
  const [recipientEmails, setRecipientEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [maxListings, setMaxListings] = useState(20);
  const [includeFeaturedOnly, setIncludeFeaturedOnly] = useState(false);
  const [daysToInclude, setDaysToInclude] = useState(7);
  const [timezone, setTimezone] = useState('America/New_York');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [configData, logsData, statsData] = await Promise.all([
        getDailyCardsConfig(),
        getDailyCardsLogs(10),
        getDailyCardsStats(),
      ]);

      if (configData) {
        setConfig(configData);
        setEnabled(configData.enabled);
        setDeliveryTime(configData.delivery_time);
        setRecipientEmails(configData.recipient_emails || []);
        setMaxListings(configData.max_listings);
        setIncludeFeaturedOnly(configData.include_featured_only);
        setDaysToInclude(configData.days_to_include);
        setTimezone(configData.timezone);
      }

      setLogs(logsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading data:', error);
      setToast({ message: 'Failed to load configuration', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      await updateDailyCardsConfig({
        enabled,
        delivery_time: deliveryTime,
        recipient_emails: recipientEmails,
        max_listings: maxListings,
        include_featured_only: includeFeaturedOnly,
        days_to_include: daysToInclude,
        timezone,
      });

      setToast({ message: 'Settings saved successfully!', type: 'success' });
      await loadData();
    } catch (error) {
      console.error('Error saving settings:', error);
      setToast({ message: 'Failed to save settings', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    try {
      setTesting(true);
      setToast({ message: 'Generating and sending test email...', type: 'success' });

      const result = await triggerManualExecution();

      if (result.success) {
        setToast({
          message: `Test email sent! ${result.imagesGenerated} images generated for ${result.listingsCount} listings in ${Math.round((result.executionTimeMs || 0) / 1000)}s`,
          type: 'success',
        });
        await loadData();
      } else {
        setToast({
          message: result.error || 'Failed to send test email',
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      setToast({ message: 'Failed to send test email', type: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const handleAddEmail = () => {
    const email = emailInput.trim().toLowerCase();
    if (email && !recipientEmails.includes(email)) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setToast({ message: 'Invalid email format', type: 'error' });
        return;
      }
      setRecipientEmails([...recipientEmails, email]);
      setEmailInput('');
    }
  };

  const handleRemoveEmail = (email: string) => {
    setRecipientEmails(recipientEmails.filter((e) => e !== email));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed top-20 right-4 z-50 rounded-md px-4 py-3 shadow-lg ${
            toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          } text-white`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <Mail className="w-6 h-6 mr-3 text-blue-600" />
              Daily Listing Cards
            </h2>
            <p className="text-gray-600 mt-1">
              Automated daily email with listing card images ready for WhatsApp
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleTestEmail}
              disabled={testing || recipientEmails.length === 0}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Send Test Email
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Success Rate</p>
                <p className="text-2xl font-bold text-gray-900">{stats.successRate.toFixed(1)}%</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Runs</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalRuns}</p>
              </div>
              <Calendar className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Failed Runs</p>
                <p className="text-2xl font-bold text-gray-900">{stats.failedRuns}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Time</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(stats.averageExecutionTime / 1000).toFixed(1)}s
                </p>
              </div>
              <Clock className="w-8 h-8 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* Configuration Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Configuration</h3>

        <div className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">Automation Status</label>
              <p className="text-sm text-gray-500">Enable or disable daily automated emails</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                  enabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Delivery Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clock className="w-4 h-4 inline mr-1" />
              Delivery Time
            </label>
            <input
              type="time"
              value={deliveryTime}
              onChange={(e) => setDeliveryTime(e.target.value)}
              className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Time in {timezone}</p>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Denver">Mountain Time (MT)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>

          {/* Recipient Emails */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users className="w-4 h-4 inline mr-1" />
              Recipient Emails
            </label>
            <div className="flex space-x-2 mb-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddEmail()}
                placeholder="Enter email address"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={handleAddEmail}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Add
              </button>
            </div>
            <div className="space-y-2">
              {recipientEmails.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md"
                >
                  <span className="text-sm text-gray-700">{email}</span>
                  <button
                    onClick={() => handleRemoveEmail(email)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {recipientEmails.length === 0 && (
                <p className="text-sm text-gray-500 italic">No recipients configured</p>
              )}
            </div>
          </div>

          {/* Max Listings */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Maximum Listings per Email
            </label>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={maxListings}
              onChange={(e) => setMaxListings(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-gray-600">
              <span>5</span>
              <span className="font-medium">{maxListings}</span>
              <span>50</span>
            </div>
          </div>

          {/* Days to Include */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Include Listings from Last N Days
            </label>
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={daysToInclude}
              onChange={(e) => setDaysToInclude(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-gray-600">
              <span>1 day</span>
              <span className="font-medium">{daysToInclude} days</span>
              <span>30 days</span>
            </div>
          </div>

          {/* Featured Only Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">Featured Listings Only</label>
              <p className="text-sm text-gray-500">Only include featured listings in the email</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={includeFeaturedOnly}
              onClick={() => setIncludeFeaturedOnly(!includeFeaturedOnly)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                includeFeaturedOnly ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                  includeFeaturedOnly ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Save Button */}
          <div className="pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Execution Logs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Executions</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
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
                  Images
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
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {new Date(log.run_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {log.success ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Success
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <XCircle className="w-3 h-3 mr-1" />
                        Failed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {log.listings_count}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {log.images_generated}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {log.email_sent ? '✅' : '❌'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {(log.execution_time_ms / 1000).toFixed(1)}s
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 capitalize">
                    {log.triggered_by}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No executions yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
