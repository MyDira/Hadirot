import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Calendar, Database } from 'lucide-react';
import { supabase } from '../../config/supabase';

interface ValidationResult {
  metric_name: string;
  expected_value: number;
  actual_value: number;
  variance_percent: number;
  status: 'pass' | 'warn' | 'fail';
  details: Record<string, unknown>;
}

interface ValidationTabProps {
  loading?: boolean;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'pass':
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    case 'warn':
      return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    case 'fail':
      return <XCircle className="w-5 h-5 text-red-600" />;
    default:
      return null;
  }
}

function getStatusBg(status: string) {
  switch (status) {
    case 'pass':
      return 'bg-green-50 border-green-200';
    case 'warn':
      return 'bg-amber-50 border-amber-200';
    case 'fail':
      return 'bg-red-50 border-red-200';
    default:
      return 'bg-gray-50 border-gray-200';
  }
}

function formatMetricName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function ValidationTab({ loading: parentLoading }: ValidationTabProps) {
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const runValidation = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('analytics_validation_report', {
        start_date: selectedDate,
        end_date: selectedDate,
        tz: 'America/New_York',
      });

      if (rpcError) throw rpcError;
      setResults(data || []);
      setLastRun(new Date());
    } catch (err) {
      console.error('Validation error:', err);
      setError('Failed to run validation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runValidation();
  }, []);

  const passCount = results.filter((r) => r.status === 'pass').length;
  const warnCount = results.filter((r) => r.status === 'warn').length;
  const failCount = results.filter((r) => r.status === 'fail').length;

  if (parentLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-40 mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Database className="w-5 h-5 mr-2" />
              Data Validation Report
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Verify analytics data integrity against ground truth
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={runValidation}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-[#273140] text-white rounded-lg hover:bg-[#1e252f] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Running...' : 'Run Validation'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-green-800">{passCount}</div>
                <div className="text-sm text-green-600">Passing</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 text-center">
                <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-amber-800">{warnCount}</div>
                <div className="text-sm text-amber-600">Warnings</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4 text-center">
                <XCircle className="w-6 h-6 text-red-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-red-800">{failCount}</div>
                <div className="text-sm text-red-600">Failures</div>
              </div>
            </div>

            <div className="space-y-3">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-4 ${getStatusBg(result.status)}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(result.status)}
                      <div>
                        <div className="font-medium text-gray-900">
                          {formatMetricName(result.metric_name)}
                        </div>
                        <div className="text-sm text-gray-500">
                          Source: {result.details?.source as string || 'analytics_events'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-gray-900">
                        {result.actual_value.toLocaleString()}
                      </div>
                      {result.variance_percent !== 0 && (
                        <div className={`text-sm ${
                          result.variance_percent > 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {result.variance_percent > 0 ? '+' : ''}{result.variance_percent}% variance
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {lastRun && (
              <div className="mt-4 text-sm text-gray-500 text-center">
                Last run: {lastRun.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
              </div>
            )}
          </>
        )}

        {!loading && results.length === 0 && !error && (
          <div className="text-center py-8">
            <Database className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No validation results yet. Click "Run Validation" to start.</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Metric Definitions</h3>
        <div className="space-y-4 text-sm text-gray-600">
          <div>
            <span className="font-medium text-gray-900">Sessions:</span>{' '}
            COUNT(DISTINCT session_id) from analytics_events
          </div>
          <div>
            <span className="font-medium text-gray-900">Unique Visitors:</span>{' '}
            COUNT(DISTINCT anon_id) from analytics_events
          </div>
          <div>
            <span className="font-medium text-gray-900">Listing Views:</span>{' '}
            COUNT(*) WHERE event_name = 'listing_view'
          </div>
          <div>
            <span className="font-medium text-gray-900">Inquiries:</span>{' '}
            COUNT(*) from listing_contact_submissions (ground truth)
          </div>
          <div>
            <span className="font-medium text-gray-900">Impressions:</span>{' '}
            COUNT of expanded listing_ids from listing_impression events
          </div>
        </div>
      </div>
    </div>
  );
}
