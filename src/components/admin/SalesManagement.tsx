import React, { useState, useEffect } from 'react';
import { Check, X, Clock, DollarSign, Users, Settings, Mail, AlertCircle } from 'lucide-react';
import { salesService } from '@/services/sales';
import { AdminSettings, SalesPermissionRequest } from '@/config/supabase';
import { useAuth } from '@/hooks/useAuth';

export function SalesManagement() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [requests, setRequests] = useState<SalesPermissionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<{ [key: string]: string }>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'settings' | 'requests'>('settings');

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
    try {
      setLoading(true);
      const [settingsData, requestsData] = await Promise.all([
        salesService.getSalesSettings(),
        salesService.getAllPermissionRequests(),
      ]);
      setSettings(settingsData);
      setRequests(requestsData);
    } catch (error) {
      console.error('Error loading sales data:', error);
      setToast({ message: 'Failed to load sales data', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSalesFeature = async (enabled: boolean) => {
    if (!settings) return;

    if (!enabled && !confirm(
      'Disabling the sales feature will:\n\n' +
      '• Hide all sale listings from the site\n' +
      '• Prevent new sale listings from being created\n' +
      '• Make the sales feature completely invisible to users\n\n' +
      'Are you sure you want to continue?'
    )) {
      return;
    }

    try {
      setSavingSettings(true);
      await salesService.updateSalesSettings({ sales_feature_enabled: enabled });
      setSettings({ ...settings, sales_feature_enabled: enabled });
      setToast({
        message: `Sales feature ${enabled ? 'enabled' : 'disabled'} successfully`,
        type: 'success',
      });
    } catch (error) {
      console.error('Error toggling sales feature:', error);
      setToast({ message: 'Failed to update settings', type: 'error' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleUniversalAccess = async (enabled: boolean) => {
    if (!settings) return;

    try {
      setSavingSettings(true);
      await salesService.updateSalesSettings({ sales_universal_access: enabled });
      setSettings({ ...settings, sales_universal_access: enabled });
      setToast({
        message: `Universal access ${enabled ? 'enabled' : 'disabled'} successfully`,
        type: 'success',
      });
    } catch (error) {
      console.error('Error toggling universal access:', error);
      setToast({ message: 'Failed to update settings', type: 'error' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpdateMaxFeatured = async (value: number) => {
    if (!settings) return;

    try {
      setSavingSettings(true);
      await salesService.updateSalesSettings({ max_featured_sales: value });
      setSettings({ ...settings, max_featured_sales: value });
      setToast({ message: 'Max featured sales updated successfully', type: 'success' });
    } catch (error) {
      console.error('Error updating max featured:', error);
      setToast({ message: 'Failed to update max featured sales', type: 'error' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    if (!user) return;

    try {
      setProcessingRequest(requestId);
      await salesService.approvePermissionRequest(
        requestId,
        user.id,
        adminNotes[requestId]
      );
      setToast({ message: 'Request approved and user notified', type: 'success' });
      await loadData();
      setAdminNotes({ ...adminNotes, [requestId]: '' });
    } catch (error) {
      console.error('Error approving request:', error);
      setToast({ message: 'Failed to approve request', type: 'error' });
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleDenyRequest = async (requestId: string) => {
    if (!user) return;

    if (!confirm('Are you sure you want to deny this request? The user will be notified via email.')) {
      return;
    }

    try {
      setProcessingRequest(requestId);
      await salesService.denyPermissionRequest(
        requestId,
        user.id,
        adminNotes[requestId]
      );
      setToast({ message: 'Request denied and user notified', type: 'success' });
      await loadData();
      setAdminNotes({ ...adminNotes, [requestId]: '' });
    } catch (error) {
      console.error('Error denying request:', error);
      setToast({ message: 'Failed to deny request', type: 'error' });
    } finally {
      setProcessingRequest(null);
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const processedRequests = requests.filter(r => r.status !== 'pending');

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4E4B43] mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading sales management...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        } text-white`}>
          {toast.message}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center mb-6">
          <DollarSign className="w-8 h-8 text-[#4E4B43] mr-3" />
          <div>
            <h2 className="text-2xl font-bold text-[#4E4B43]">Sales System Management</h2>
            <p className="text-gray-600">Configure sales listings and manage permissions</p>
          </div>
        </div>

        <div className="flex space-x-4 border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveSubTab('settings')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeSubTab === 'settings'
                ? 'border-[#4E4B43] text-[#4E4B43]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Settings className="w-4 h-4 inline-block mr-2" />
            Settings
          </button>
          <button
            onClick={() => setActiveSubTab('requests')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeSubTab === 'requests'
                ? 'border-[#4E4B43] text-[#4E4B43]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-4 h-4 inline-block mr-2" />
            Permission Requests
            {pendingRequests.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>

        {activeSubTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">About Sales Listings</p>
                <p>When disabled, the sales feature is completely invisible and the site functions exactly as before. When enabled, you can control who can post sale listings.</p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Sales Feature</h3>
                  <p className="text-sm text-gray-600">Enable or disable the entire sales listing system</p>
                </div>
                <button
                  onClick={() => handleToggleSalesFeature(!settings?.sales_feature_enabled)}
                  disabled={savingSettings}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings?.sales_feature_enabled ? 'bg-green-500' : 'bg-gray-300'
                  } ${savingSettings ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings?.sales_feature_enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <div className={`space-y-1 text-sm ${settings?.sales_feature_enabled ? 'text-green-700' : 'text-gray-500'}`}>
                <p className="flex items-center">
                  {settings?.sales_feature_enabled ? <Check className="w-4 h-4 mr-2" /> : <X className="w-4 h-4 mr-2" />}
                  Sale listings {settings?.sales_feature_enabled ? 'visible' : 'hidden'} on site
                </p>
                <p className="flex items-center">
                  {settings?.sales_feature_enabled ? <Check className="w-4 h-4 mr-2" /> : <X className="w-4 h-4 mr-2" />}
                  Browse Sales page {settings?.sales_feature_enabled ? 'accessible' : 'disabled'}
                </p>
                <p className="flex items-center">
                  {settings?.sales_feature_enabled ? <Check className="w-4 h-4 mr-2" /> : <X className="w-4 h-4 mr-2" />}
                  Sales navigation {settings?.sales_feature_enabled ? 'shown' : 'hidden'}
                </p>
              </div>
            </div>

            {settings?.sales_feature_enabled && (
              <>
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Universal Access</h3>
                      <p className="text-sm text-gray-600">Allow all users to post sale listings without approval</p>
                    </div>
                    <button
                      onClick={() => handleToggleUniversalAccess(!settings?.sales_universal_access)}
                      disabled={savingSettings}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings?.sales_universal_access ? 'bg-green-500' : 'bg-gray-300'
                      } ${savingSettings ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings?.sales_universal_access ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  {settings?.sales_universal_access ? (
                    <p className="text-sm text-green-700 flex items-center">
                      <Check className="w-4 h-4 mr-2" />
                      All authenticated users can post sale listings
                    </p>
                  ) : (
                    <p className="text-sm text-gray-600 flex items-center">
                      <Users className="w-4 h-4 mr-2" />
                      Only approved users can post sale listings
                    </p>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Featured Sales Limit</h3>
                  <div className="flex items-center space-x-4">
                    <label className="text-sm text-gray-700">Maximum featured sale listings:</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={settings?.max_featured_sales || 10}
                      onChange={(e) => handleUpdateMaxFeatured(parseInt(e.target.value))}
                      disabled={savingSettings}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4E4B43] focus:border-transparent"
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Controls the maximum number of sale listings that can be featured at once
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {activeSubTab === 'requests' && (
          <div className="space-y-6">
            {pendingRequests.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Clock className="w-5 h-5 mr-2 text-orange-500" />
                  Pending Requests ({pendingRequests.length})
                </h3>
                <div className="space-y-4">
                  {pendingRequests.map((request) => (
                    <div key={request.id} className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center mb-2">
                            <span className="font-semibold text-gray-900">{request.user?.full_name}</span>
                            <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded-full">
                              {request.user?.role}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            {request.user?.email && <p>Email: {request.user.email}</p>}
                            {request.user?.phone && <p>Phone: {request.user.phone}</p>}
                            <p className="text-xs text-gray-500">
                              Requested: {new Date(request.requested_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-700 mb-1">Request Message:</p>
                        <p className="text-sm text-gray-900 bg-white p-3 rounded border border-orange-200">
                          {request.request_message}
                        </p>
                      </div>
                      <div className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Admin Notes (optional):
                        </label>
                        <textarea
                          value={adminNotes[request.id] || ''}
                          onChange={(e) => setAdminNotes({ ...adminNotes, [request.id]: e.target.value })}
                          placeholder="Add notes for the user (will be included in the email)..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4E4B43] focus:border-transparent text-sm"
                          rows={2}
                        />
                      </div>
                      <div className="flex space-x-3">
                        <button
                          onClick={() => handleApproveRequest(request.id)}
                          disabled={processingRequest === request.id}
                          className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          {processingRequest === request.id ? 'Processing...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleDenyRequest(request.id)}
                          disabled={processingRequest === request.id}
                          className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                          <X className="w-4 h-4 mr-2" />
                          {processingRequest === request.id ? 'Processing...' : 'Deny'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {processedRequests.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Request History</h3>
                <div className="space-y-3">
                  {processedRequests.map((request) => (
                    <div
                      key={request.id}
                      className={`border rounded-lg p-4 ${
                        request.status === 'approved'
                          ? 'bg-green-50 border-green-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center mb-1">
                            <span className="font-semibold text-gray-900">{request.user?.full_name}</span>
                            <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                              request.status === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {request.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{request.user?.email}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Responded: {request.responded_at ? new Date(request.responded_at).toLocaleString() : 'N/A'}
                          </p>
                          {request.admin_notes && (
                            <p className="text-sm text-gray-700 mt-2 bg-white p-2 rounded border">
                              <span className="font-medium">Admin Notes:</span> {request.admin_notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {requests.length === 0 && (
              <div className="text-center py-12">
                <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No permission requests yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
