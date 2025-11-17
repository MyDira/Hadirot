import React, { useState, useEffect } from 'react';
import { Calendar, Filter, Download, Eye, CheckCircle, XCircle, Clock, Users, FileText } from 'lucide-react';
import { digestService, DigestSend } from '../../services/digest';

export function DigestHistoryView() {
  const [history, setHistory] = useState<DigestSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSendId, setExpandedSendId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadHistory();
  }, [startDate, endDate, templateFilter]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadHistory = async () => {
    try {
      const filters: any = { limit: 50 };
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (templateFilter) filters.templateId = templateFilter;

      const data = await digestService.getDigestHistory(filters);
      setHistory(data);
    } catch (error) {
      console.error('Error loading history:', error);
      setToast({ message: 'Failed to load digest history', tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (sendId: string) => {
    if (expandedSendId === sendId) {
      setExpandedSendId(null);
    } else {
      setExpandedSendId(sendId);
    }
  };

  const handleExport = () => {
    try {
      const csvData = [
        ['Date', 'Template', 'Recipients', 'Listings', 'Status', 'Execution Time (ms)'],
        ...history.map(send => [
          new Date(send.sent_at).toLocaleString(),
          send.template_name,
          send.recipient_count.toString(),
          send.total_listings_sent.toString(),
          send.success ? 'Success' : 'Failed',
          send.execution_time_ms?.toString() || 'N/A',
        ])
      ];

      const csv = csvData.map(row => row.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `digest-history-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      setToast({ message: 'History exported successfully', tone: 'success' });
    } catch (error) {
      console.error('Error exporting history:', error);
      setToast({ message: 'Failed to export history', tone: 'error' });
    }
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setTemplateFilter('');
  };

  const hasFilters = startDate || endDate || templateFilter;

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading history...</p>
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Digest Send History</h3>
          <p className="text-sm text-gray-600 mt-1">
            View all past digest sends and their results
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={history.length === 0}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-5 h-5 mr-2" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <Filter className="w-5 h-5 text-gray-400 mr-2" />
            <h4 className="font-semibold text-gray-900">Filters</h4>
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template
            </label>
            <input
              type="text"
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              placeholder="Filter by template name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      {history.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Total Sends</p>
                <p className="text-2xl font-bold text-blue-900">{history.length}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-400" />
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">Successful</p>
                <p className="text-2xl font-bold text-green-900">
                  {history.filter(h => h.success).length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 font-medium">Total Listings</p>
                <p className="text-2xl font-bold text-orange-900">
                  {history.reduce((sum, h) => sum + h.total_listings_sent, 0)}
                </p>
              </div>
              <FileText className="w-8 h-8 text-orange-400" />
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 font-medium">Avg. Recipients</p>
                <p className="text-2xl font-bold text-purple-900">
                  {Math.round(history.reduce((sum, h) => sum + h.recipient_count, 0) / history.length)}
                </p>
              </div>
              <Users className="w-8 h-8 text-purple-400" />
            </div>
          </div>
        </div>
      )}

      {/* History Table */}
      {history.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">
            {hasFilters ? 'No digest sends match your filters' : 'No digest sends yet'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date & Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Template
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Recipients
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Listings
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {history.map((send) => (
                <React.Fragment key={send.id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div>{new Date(send.sent_at).toLocaleDateString()}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(send.sent_at).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{send.template_name}</div>
                      <div className="text-xs text-gray-500">{send.template_type}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <Users className="w-4 h-4 text-gray-400 mr-1" />
                        {send.recipient_count}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {send.total_listings_sent}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        send.success
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {send.success ? (
                          <>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Success
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 mr-1" />
                            Failed
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleViewDetails(send.id)}
                        className="flex items-center text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        {expandedSendId === send.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Details */}
                  {expandedSendId === send.id && (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 bg-gray-50">
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Listings by Category */}
                            {send.listings_by_category && Object.keys(send.listings_by_category).length > 0 && (
                              <div>
                                <h5 className="text-sm font-semibold text-gray-900 mb-2">
                                  Listings by Category
                                </h5>
                                <div className="bg-white rounded border border-gray-200 p-3">
                                  {Object.entries(send.listings_by_category as Record<string, number>).map(([category, count]) => (
                                    <div key={category} className="flex justify-between py-1 text-sm">
                                      <span className="text-gray-700 capitalize">{category}</span>
                                      <span className="font-medium text-gray-900">{count}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Filter Links */}
                            {send.filter_links_included && Array.isArray(send.filter_links_included) && send.filter_links_included.length > 0 && (
                              <div>
                                <h5 className="text-sm font-semibold text-gray-900 mb-2">
                                  Filter Links Included
                                </h5>
                                <div className="bg-white rounded border border-gray-200 p-3 space-y-2">
                                  {send.filter_links_included.map((link: any, idx: number) => (
                                    <div key={idx} className="text-sm">
                                      <div className="font-medium text-gray-900">{link.label}</div>
                                      <div className="text-xs text-gray-500">Count: {link.count}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Recipients */}
                          <div>
                            <h5 className="text-sm font-semibold text-gray-900 mb-2">
                              Recipients ({send.recipient_count})
                            </h5>
                            <div className="bg-white rounded border border-gray-200 p-3">
                              <div className="flex flex-wrap gap-2">
                                {send.recipient_emails.map((email, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                  >
                                    {email}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Execution Details */}
                          <div className="flex items-center gap-6 text-sm text-gray-600">
                            {send.execution_time_ms && (
                              <div className="flex items-center">
                                <Clock className="w-4 h-4 mr-1" />
                                Execution time: {send.execution_time_ms}ms
                              </div>
                            )}
                            {send.error_message && (
                              <div className="text-red-600">
                                Error: {send.error_message}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
