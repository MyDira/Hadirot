import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, Map, RotateCcw, ChevronLeft, Loader2 } from 'lucide-react';
import type { ScrapedListing, ScrapeRun, CallStatus } from '@/config/supabase';
import {
  pipelineService,
  getValidTransitions,
  CALL_STATUS_LABELS,
  type PipelineFilters,
} from '@/services/pipeline';
import { PipelineListingDetail } from '@/components/admin/PipelineListingDetail';
import { PipelineMapModal } from '@/components/admin/PipelineMapModal';
import { PipelinePublishModal } from '@/components/admin/PipelinePublishModal';
import { Toast } from '@/components/shared/Toast';

const PAGE_SIZE = 25;

const CALL_STATUS_OPTIONS: { value: CallStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending_call', label: 'Pending Call' },
  { value: 'called_no_answer', label: 'No Answer' },
  { value: 'called_declined', label: 'Declined' },
  { value: 'approved', label: 'Approved' },
  { value: 'published', label: 'Published' },
  { value: 'suppressed', label: 'Suppressed' },
];

const MATCH_STATUS_OPTIONS = [
  { value: 'all', label: 'All Matches' },
  { value: 'no_match', label: 'New leads only' },
  { value: 'matched', label: 'Matched' },
  { value: 'partial_match', label: 'Partial match' },
] as const;

const STATUS_BADGE_COLORS: Record<CallStatus, { bg: string; text: string }> = {
  pending_call: { bg: 'bg-gray-100', text: 'text-gray-600' },
  called_no_answer: { bg: 'bg-orange-100', text: 'text-orange-700' },
  called_declined: { bg: 'bg-red-100', text: 'text-red-700' },
  approved: { bg: 'bg-green-100', text: 'text-green-700' },
  published: { bg: 'bg-blue-100', text: 'text-blue-700' },
  suppressed: { bg: 'bg-gray-200', text: 'text-gray-500' },
};

const DEFAULT_FILTERS: PipelineFilters = {
  callStatus: 'pending_call',
  matchStatus: 'all',
  lowConfidenceOnly: false,
};

function ConfidenceDot({ confidence }: { confidence: number | null }) {
  if (confidence == null) return <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />;
  const color = confidence >= 0.8 ? 'bg-green-500' : confidence >= 0.5 ? 'bg-yellow-400' : 'bg-red-500';
  return <span className={`w-2.5 h-2.5 rounded-full ${color} inline-block`} title={`${Math.round(confidence * 100)}%`} />;
}

function MatchBadge({ status }: { status: string }) {
  if (status === 'matched') return <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-700">On site</span>;
  if (status === 'partial_match') return <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-700">~ Partial</span>;
  return <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700">New lead</span>;
}

function RunStatusBadge({ status }: { status: string }) {
  if (status === 'completed') return <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-700">Completed</span>;
  if (status === 'failed') return <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700">Failed</span>;
  return <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-700">Running</span>;
}

interface QuickStatusDropdownProps {
  listing: ScrapedListing;
  onSelect: (id: string, status: CallStatus) => void;
}

function QuickStatusDropdown({ listing, onSelect }: QuickStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const transitions = getValidTransitions(listing.call_status);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const colors = STATUS_BADGE_COLORS[listing.call_status];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (transitions.length > 0) setOpen(!open);
        }}
        className={`px-2 py-0.5 text-xs font-medium rounded ${colors.bg} ${colors.text} ${transitions.length > 0 ? 'cursor-pointer hover:ring-2 hover:ring-gray-300' : 'cursor-default'}`}
      >
        {CALL_STATUS_LABELS[listing.call_status]}
        {transitions.length > 0 && <ChevronDown className="w-3 h-3 inline-block ml-0.5" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[150px]">
          {transitions.map((t) => (
            <button
              key={t}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onSelect(listing.id, t);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {CALL_STATUS_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PipelineManagement() {
  const [latestRun, setLatestRun] = useState<ScrapeRun | null>(null);
  const [listings, setListings] = useState<ScrapedListing[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<PipelineFilters>(DEFAULT_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mapListing, setMapListing] = useState<ScrapedListing | null>(null);
  const [publishListing, setPublishListing] = useState<ScrapedListing | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [run, result] = await Promise.all([
        pipelineService.getLatestScrapeRun(),
        pipelineService.getScrapedListings(filters, page, PAGE_SIZE),
      ]);
      setLatestRun(run);
      setListings(result.data);
      setTotalCount(result.count);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusChange = async (id: string, newStatus: CallStatus) => {
    try {
      await pipelineService.updateCallStatus(id, newStatus);
      setListings((prev) => prev.map((l) => (l.id === id ? { ...l, call_status: newStatus } : l)));
      setToast(`Status updated to ${CALL_STATUS_LABELS[newStatus]}`);
    } catch {
      setToast('Failed to update status');
    }
  };

  const handlePublishSuccess = () => {
    setToast('Listing submitted for approval');
    setPublishListing(null);
    fetchData();
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(0);
  };

  const updateFilter = (key: keyof PipelineFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Last Pipeline Run</h3>
        {latestRun ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500">Date:</span>{' '}
              <span className="font-medium text-gray-900">{latestRun.pdf_date ? new Date(latestRun.pdf_date).toLocaleDateString() : '-'}</span>
            </div>
            <div>
              <span className="text-gray-500">Parsed:</span>{' '}
              <span className="font-medium text-gray-900">{latestRun.listings_parsed}</span>
            </div>
            <div>
              <span className="text-gray-500">Inserted:</span>{' '}
              <span className="font-medium text-gray-900">{latestRun.listings_inserted}</span>
            </div>
            <div>
              <span className="text-gray-500">Updated:</span>{' '}
              <span className="font-medium text-gray-900">{latestRun.listings_updated}</span>
            </div>
            <RunStatusBadge status={latestRun.status} />
          </div>
        ) : (
          <p className="text-sm text-gray-500">No pipeline runs yet</p>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filters.callStatus}
            onChange={(e) => updateFilter('callStatus', e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {CALL_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={filters.matchStatus}
            onChange={(e) => updateFilter('matchStatus', e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {MATCH_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={filters.lowConfidenceOnly}
              onChange={(e) => updateFilter('lowConfidenceOnly', e.target.checked)}
              className="rounded"
            />
            Low confidence only
          </label>

          <button
            onClick={resetFilters}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>

          <span className="text-sm text-gray-500 ml-auto">
            {totalCount} listing{totalCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500">No listings match the current filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {listings.map((listing) => {
              const isExpanded = expandedId === listing.id;
              const contactDisplay = listing.agency_name || listing.contact_name || listing.contact_phone_display || '-';
              const crossStreets = [listing.cross_street_1, listing.cross_street_2].filter(Boolean).join(' & ');

              return (
                <div key={listing.id}>
                  {/* Collapsed Row */}
                  <div
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors text-sm ${isExpanded ? 'bg-gray-50' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : listing.id)}
                  >
                    {/* Confidence */}
                    <div className="flex-shrink-0 w-6 flex justify-center">
                      <ConfidenceDot confidence={listing.parse_confidence} />
                    </div>

                    {/* Contact */}
                    <div className="min-w-0 w-40 flex-shrink-0">
                      <p className="font-medium text-gray-900 truncate">{contactDisplay}</p>
                      {listing.contact_type && (
                        <span className="text-xs text-gray-500 capitalize">{listing.contact_type}</span>
                      )}
                    </div>

                    {/* Location */}
                    <div className="min-w-0 flex-1">
                      <p className="text-gray-900 truncate">{crossStreets || '-'}</p>
                      {listing.neighborhood && (
                        <p className="text-xs text-gray-500 truncate">{listing.neighborhood}</p>
                      )}
                    </div>

                    {/* Beds / Price */}
                    <div className="flex-shrink-0 w-24 text-right">
                      <p className="text-gray-900">{listing.bedrooms != null ? `${listing.bedrooms}br` : '-'}</p>
                      <p className="text-xs text-gray-500">
                        {listing.price ? `$${listing.price.toLocaleString()}` : listing.price_note || '-'}
                      </p>
                    </div>

                    {/* Match Status */}
                    <div className="flex-shrink-0 w-20 text-center">
                      <MatchBadge status={listing.match_status} />
                    </div>

                    {/* Times Seen */}
                    <div className="flex-shrink-0 w-20 text-center">
                      <p className="text-xs text-gray-600">Seen {listing.times_seen}x</p>
                      <p className="text-xs text-gray-400">
                        {listing.date_last_seen ? new Date(listing.date_last_seen).toLocaleDateString() : ''}
                      </p>
                    </div>

                    {/* Call Status Badge */}
                    <div className="flex-shrink-0 w-28 text-center" onClick={(e) => e.stopPropagation()}>
                      <QuickStatusDropdown listing={listing} onSelect={handleStatusChange} />
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMapListing(listing);
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                        title="Map"
                      >
                        <Map className="w-4 h-4" />
                      </button>
                      <span className="text-gray-400">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <PipelineListingDetail
                      listing={listing}
                      onStatusChange={handleStatusChange}
                      onPublish={(l) => setPublishListing(l)}
                      onRefresh={fetchData}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm">
            <span className="text-gray-500">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Shared Modals */}
      <PipelineMapModal listing={mapListing} onClose={() => setMapListing(null)} />
      <PipelinePublishModal
        listing={publishListing}
        onClose={() => setPublishListing(null)}
        onSuccess={handlePublishSuccess}
      />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
