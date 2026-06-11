import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2,
  Pencil,
  Trash2,
  Upload,
  RotateCcw,
  ExternalLink,
  ImageOff,
  AlertTriangle,
  UserPlus,
  X,
} from 'lucide-react';
import type { ScrapedListing, ScrapeRun, Profile } from '@/config/supabase';
import { aiIntakeService, toE164, type IntakeReviewStatus } from '@/services/aiIntake';
import { IntakeEditModal } from './IntakeEditModal';
import { UserSearchSelect } from '@/components/admin/UserSearchSelect';
import { Toast } from '@/components/shared/Toast';
import { useAuth } from '@/hooks/useAuth';

interface IntakeReviewViewProps {
  focusBatchId: string | null;
}

const STATUS_OPTIONS: { value: IntakeReviewStatus; label: string }[] = [
  { value: 'pending', label: 'Pending Review' },
  { value: 'published', label: 'Published' },
  { value: 'discarded', label: 'Discarded' },
  { value: 'all', label: 'All' },
];

function ConfidenceDot({ confidence }: { confidence: number | null }) {
  if (confidence == null)
    return <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />;
  const color =
    confidence >= 0.8 ? 'bg-green-500' : confidence >= 0.5 ? 'bg-yellow-400' : 'bg-red-500';
  return (
    <span
      className={`w-2.5 h-2.5 rounded-full ${color} inline-block`}
      title={`Parse confidence ${Math.round(confidence * 100)}%`}
    />
  );
}

function KindBadge({ kind }: { kind: 'rental' | 'sale' }) {
  return kind === 'sale' ? (
    <span className="px-2 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700">Sale</span>
  ) : (
    <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700">Rental</span>
  );
}

export function IntakeReviewView({ focusBatchId }: IntakeReviewViewProps) {
  const { user } = useAuth();
  const [batches, setBatches] = useState<ScrapeRun[]>([]);
  const [batchId, setBatchId] = useState<string | 'all'>(focusBatchId ?? 'all');
  const [status, setStatus] = useState<IntakeReviewStatus>('pending');
  const [listings, setListings] = useState<ScrapedListing[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [trialFlags, setTrialFlags] = useState<Map<string, boolean>>(new Map());
  const [monetizationEnabled, setMonetizationEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editListing, setEditListing] = useState<ScrapedListing | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<{ done: number; total: number } | null>(null);
  const [publishErrors, setPublishErrors] = useState<Array<{ title: string; error: string }>>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUser, setAssignUser] = useState<Profile | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (focusBatchId) {
      setBatchId(focusBatchId);
      setStatus('pending');
    }
  }, [focusBatchId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [batchList, rows, monetization] = await Promise.all([
        aiIntakeService.getIntakeBatches(),
        aiIntakeService.getIntakeListings(batchId, status),
        aiIntakeService.getMonetizationEnabled(),
      ]);
      setBatches(batchList);
      setListings(rows);
      setMonetizationEnabled(monetization);
      setSelected(new Set());

      const assignedIds = rows
        .map((r) => r.assigned_user_id)
        .filter((id): id is string => !!id);
      setProfiles(await aiIntakeService.getProfilesByIds(assignedIds));

      if (monetization) {
        const rentalPhones = rows
          .filter((r) => r.listing_kind === 'rental')
          .map((r) => r.contact_phone);
        setTrialFlags(await aiIntakeService.checkTrialEligibility(rentalPhones));
      } else {
        setTrialFlags(new Map());
      }
    } catch {
      setToast('Failed to load intake listings');
    } finally {
      setLoading(false);
    }
  }, [batchId, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = listings.length > 0 && listings.every((l) => selected.has(l.id));
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(listings.map((l) => l.id)));
  };

  const selectedRows = useMemo(
    () => listings.filter((l) => selected.has(l.id)),
    [listings, selected],
  );

  const handlePublish = async (rows: ScrapedListing[]) => {
    if (!user?.id || rows.length === 0 || publishing) return;
    const publishable = rows.filter((r) => r.call_status === 'approved');
    if (publishable.length === 0) {
      setToast('Nothing to publish — only pending listings can be published.');
      return;
    }
    setPublishing(true);
    setPublishErrors([]);
    setPublishProgress({ done: 0, total: publishable.length });
    try {
      const result = await aiIntakeService.publishIntakeListings(
        publishable,
        user.id,
        (done, total) => setPublishProgress({ done, total }),
      );
      setPublishErrors(result.failed.map((f) => ({ title: f.title, error: f.error })));
      setToast(
        result.failed.length === 0
          ? `Published ${result.succeeded.length} listing${result.succeeded.length === 1 ? '' : 's'} — live now`
          : `Published ${result.succeeded.length}, ${result.failed.length} failed (see details above)`,
      );
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
      setPublishProgress(null);
      fetchData();
    }
  };

  const handleDiscard = async (ids: string[]) => {
    try {
      await aiIntakeService.discardIntakeListings(ids);
      setToast(`Discarded ${ids.length} listing${ids.length === 1 ? '' : 's'}`);
      fetchData();
    } catch {
      setToast('Failed to discard');
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await aiIntakeService.restoreIntakeListing(id);
      setToast('Restored to pending');
      fetchData();
    } catch {
      setToast('Failed to restore');
    }
  };

  const handleBulkAssign = async (userToAssign: Profile | null) => {
    if (selected.size === 0) return;
    try {
      await aiIntakeService.assignIntakeListings([...selected], userToAssign?.id ?? null);
      setToast(
        userToAssign
          ? `Assigned ${selected.size} listing${selected.size === 1 ? '' : 's'} to ${userToAssign.full_name}`
          : `Cleared assignment on ${selected.size} listing${selected.size === 1 ? '' : 's'}`,
      );
      setAssignOpen(false);
      setAssignUser(null);
      fetchData();
    } catch {
      setToast('Failed to update assignment');
    }
  };

  const batchLabel = (run: ScrapeRun) => {
    const when = new Date(run.started_at);
    return `${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — ${run.listings_inserted} listing${run.listings_inserted === 1 ? '' : 's'}`;
  };

  const trialUsed = (listing: ScrapedListing): boolean => {
    if (!monetizationEnabled || listing.listing_kind !== 'rental') return false;
    const e164 = toE164(listing.contact_phone);
    if (!e164) return false;
    return trialFlags.get(e164) === false;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-xs"
          >
            <option value="all">All batches</option>
            {batches.map((run) => (
              <option key={run.id} value={run.id}>
                {batchLabel(run)}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as IntakeReviewStatus)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <button
            onClick={fetchData}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Refresh
          </button>

          <span className="text-sm text-gray-500 ml-auto">
            {listings.length} listing{listings.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Publish errors */}
      {publishErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 space-y-1">
          <p className="font-semibold">Some listings failed to publish:</p>
          {publishErrors.map((e, i) => (
            <p key={i}>
              • <strong>{e.title}</strong>: {e.error} — edit the listing and try again.
            </p>
          ))}
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="bg-gray-900 text-white rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button
            onClick={() => handlePublish(selectedRows)}
            disabled={publishing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 rounded-md hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            {publishing && publishProgress
              ? `Publishing ${publishProgress.done}/${publishProgress.total}...`
              : 'Publish Selected'}
          </button>
          <button
            onClick={() => setAssignOpen(true)}
            disabled={publishing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" /> Assign Account
          </button>
          <button
            onClick={() => handleDiscard([...selected])}
            disabled={publishing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gray-700 rounded-md hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Discard
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-sm text-gray-300 hover:text-white transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Bulk assign panel */}
      {assignOpen && (
        <div className="bg-white rounded-lg border border-gray-300 p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              Assign {selected.size} selected listing{selected.size === 1 ? '' : 's'} to:
            </p>
            <button
              onClick={() => setAssignOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <UserSearchSelect selectedUser={assignUser} onSelect={setAssignUser} />
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkAssign(assignUser)}
              disabled={!assignUser}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Assign
            </button>
            <button
              onClick={() => handleBulkAssign(null)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Clear Assignment
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500">
              {status === 'pending'
                ? 'No listings waiting for review. Parse some text in the Input tab.'
                : 'No listings match the current filters.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Header row */}
            <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="rounded"
              />
              <span className="w-12 text-center">Photo</span>
              <span className="flex-1">Listing</span>
              <span className="w-32">Contact</span>
              <span className="w-36">Account</span>
              <span className="w-40 text-right">Actions</span>
            </div>

            {listings.map((listing) => {
              const extra = listing.intake_extra || {};
              const firstImage =
                (listing.image_paths || []).find((i) => i.is_featured) ||
                (listing.image_paths || [])[0];
              const assigned = listing.assigned_user_id
                ? profiles.get(listing.assigned_user_id)
                : null;
              const crossStreets = [listing.cross_street_1, listing.cross_street_2]
                .filter(Boolean)
                .join(' & ');
              const isSale = listing.listing_kind === 'sale';
              const priceDisplay = extra.call_for_price
                ? 'Call for price'
                : isSale
                  ? extra.asking_price
                    ? `$${extra.asking_price.toLocaleString()}`
                    : '-'
                  : listing.price
                    ? `$${listing.price.toLocaleString()}/mo`
                    : '-';
              const isPending = listing.call_status === 'approved';

              return (
                <div key={listing.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(listing.id)}
                    onChange={() => toggleSelect(listing.id)}
                    className="rounded"
                  />

                  {/* Thumbnail */}
                  <div className="w-12 h-12 flex-shrink-0 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
                    {firstImage ? (
                      <img src={firstImage.publicUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageOff className="w-4 h-4 text-gray-300" />
                    )}
                  </div>

                  {/* Listing summary */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <ConfidenceDot confidence={listing.parse_confidence} />
                      <p className="font-medium text-gray-900 truncate">{listing.title || 'Untitled'}</p>
                      <KindBadge kind={listing.listing_kind} />
                      {listing.geocode_status !== 'success' && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700"
                          title="No map coordinates — re-geocode in the editor"
                        >
                          <AlertTriangle className="w-3 h-3" /> No geo
                        </span>
                      )}
                      {trialUsed(listing) && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded bg-orange-100 text-orange-700"
                          title="This phone number already used its 14-day free trial. Publishing will still grant a fresh trial (admin override)."
                        >
                          <AlertTriangle className="w-3 h-3" /> Trial used
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {[
                        listing.bedrooms != null ? `${listing.bedrooms}BR` : null,
                        listing.bathrooms ? `${listing.bathrooms}BA` : null,
                        priceDisplay,
                        crossStreets || listing.neighborhood,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  {/* Contact */}
                  <div className="w-32 flex-shrink-0 min-w-0">
                    <p className="text-gray-900 truncate">
                      {listing.contact_name || listing.agency_name || '-'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {listing.contact_phone_display || listing.contact_phone || ''}
                    </p>
                  </div>

                  {/* Account */}
                  <div className="w-36 flex-shrink-0 min-w-0">
                    {assigned ? (
                      <p className="text-gray-900 truncate" title={assigned.email}>
                        {assigned.full_name}
                      </p>
                    ) : listing.admin_custom_agency_name ? (
                      <p className="text-gray-700 truncate italic">
                        {listing.admin_custom_agency_name}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">Admin account</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="w-40 flex-shrink-0 flex items-center justify-end gap-1">
                    {isPending && (
                      <>
                        <button
                          onClick={() => setEditListing(listing)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handlePublish([listing])}
                          disabled={publishing}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          title="Publish live now"
                        >
                          Publish
                        </button>
                        <button
                          onClick={() => handleDiscard([listing.id])}
                          disabled={publishing}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                          title="Discard"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {listing.call_status === 'published' && listing.published_listing_id && (
                      <a
                        href={`/listing/${listing.published_listing_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
                      >
                        View <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {listing.call_status === 'suppressed' && (
                      <button
                        onClick={() => handleRestore(listing.id)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" /> Restore
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <IntakeEditModal
        listing={editListing}
        assignedProfile={
          editListing?.assigned_user_id
            ? profiles.get(editListing.assigned_user_id) ?? null
            : null
        }
        onClose={() => setEditListing(null)}
        onSaved={fetchData}
        onPublish={(saved) => handlePublish([saved])}
      />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
