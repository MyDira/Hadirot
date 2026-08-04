import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2,
  Trash2,
  Upload,
  RotateCcw,
  ExternalLink,
  ImageOff,
  AlertTriangle,
  Copy,
  MapPinOff,
  MessageSquare,
  UserPlus,
  X,
  Check,
  Search,
  ChevronRight,
} from 'lucide-react';
import {
  type ScrapedListing,
  type Profile,
  type CallStatus,
  type OutreachStatus,
  INTAKE_SOURCE_LABELS,
} from '@/config/supabase';
import {
  aiIntakeService,
  toE164,
  CALL_STATUS_LABELS,
  OUTREACH_STATUS_LABELS,
  type ReviewFilters,
} from '@/services/aiIntake';
import { describeMatch, type LiveListingCandidate, type MatchCandidate } from '@/utils/intakeMatch';
import { IntakeWorkspaceDrawer } from './IntakeWorkspaceDrawer';
import { IntakeOutreachModal } from './IntakeOutreachModal';
import { UserSearchSelect } from '@/components/admin/UserSearchSelect';
import { Toast } from '@/components/shared/Toast';
import { useAuth } from '@/hooks/useAuth';

interface IntakeReviewViewProps {
  /** Preselect a source after an ingest (e.g. 'luach_com', 'heimish_agent'). */
  initialSource?: string;
  /** Bump to force a reload from the parent after a new ingest. */
  refreshKey?: number;
}

const SOURCE_FILTER_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'luach_hatsibbur', label: 'Luach HaTsibbur' },
  { value: 'kol_berama', label: 'Kol Berama' },
  { value: 'heimish_agent', label: 'Heimish Agent' },
  { value: 'other_pamphlet', label: 'Other Pamphlet' },
  { value: 'luach_com', label: 'luach.com' },
  { value: 'admin_intake', label: 'Pasted Text' },
];

/** The statuses worth a one-click tab — everything else lives in "More…". */
const PRIMARY_STATUS_TABS: { value: ReviewFilters['callStatus']; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'pending_call', label: 'To call' },
  { value: 'approved', label: 'Ready' },
  { value: 'published', label: 'Published' },
];

const OUTREACH_FILTER_OPTIONS: { value: ReviewFilters['outreach']; label: string }[] = [
  { value: 'all', label: 'SMS: any' },
  { value: 'none', label: 'SMS: not sent' },
  { value: 'any', label: 'SMS: sent (all)' },
  { value: 'sent', label: 'SMS: awaiting reply' },
  { value: 'replied', label: 'SMS: replied' },
  { value: 'confirmed', label: 'SMS: confirmed' },
  { value: 'declined', label: 'SMS: declined' },
  { value: 'error', label: 'SMS: failed' },
];

const OVERFLOW_STATUS_OPTIONS: { value: ReviewFilters['callStatus']; label: string }[] = [
  { value: 'called_no_answer', label: 'No answer' },
  { value: 'called_declined', label: 'Declined' },
  { value: 'suppressed', label: 'Discarded' },
  { value: 'all', label: 'All statuses' },
];

const STATUS_PILL: Record<CallStatus, string> = {
  pending_call: 'bg-blue-100 text-blue-700',
  called_no_answer: 'bg-amber-100 text-amber-700',
  called_declined: 'bg-gray-200 text-gray-600',
  approved: 'bg-green-100 text-green-700',
  published: 'bg-emerald-600 text-white',
  suppressed: 'bg-gray-100 text-gray-400',
};

const OUTREACH_PILL: Record<OutreachStatus, string> = {
  sent: 'bg-indigo-100 text-indigo-700',
  replied: 'bg-violet-100 text-violet-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-gray-100 text-gray-500',
  error: 'bg-red-100 text-red-700',
};

/**
 * Row warnings, collapsed into one compact icon strip. They used to render as
 * full text badges, which crowded the title line badly once a row had two or
 * three of them at once.
 */
function RowWarnings({
  noGeo,
  trialUsed,
  duplicates,
}: {
  noGeo: boolean;
  trialUsed: boolean;
  duplicates: MatchCandidate[];
}) {
  const strongDuplicate = duplicates.some((m) => m.strength === 'strong');
  if (!noGeo && !trialUsed && duplicates.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {noGeo && (
        <MapPinOff
          className="w-3.5 h-3.5 text-amber-500"
          title="No map coordinates — open the lead to re-geocode"
        />
      )}
      {trialUsed && (
        <AlertTriangle
          className="w-3.5 h-3.5 text-orange-500"
          title="This phone already used its 14-day free trial. Publishing still grants a fresh trial (admin override)."
        />
      )}
      {duplicates.length > 0 && (
        <Copy
          className={`w-3.5 h-3.5 ${strongDuplicate ? 'text-red-500' : 'text-amber-500'}`}
          title={`Matches ${duplicates.length} live listing${duplicates.length === 1 ? '' : 's'} — ${describeMatch(duplicates[0])}. Open to compare.`}
        />
      )}
    </span>
  );
}

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

function SourceBadge({ source }: { source: string | null }) {
  const label = source ? INTAKE_SOURCE_LABELS[source] ?? source : 'Unknown';
  return (
    <span className="px-1.5 py-0.5 text-[11px] font-medium rounded bg-slate-100 text-slate-600">
      {label}
    </span>
  );
}

export function IntakeReviewView({ initialSource, refreshKey }: IntakeReviewViewProps) {
  const { user } = useAuth();
  const [filters, setFilters] = useState<ReviewFilters>({
    source: initialSource ?? 'all',
    kind: 'all',
    callStatus: 'active',
    neighborhood: 'all',
    newOnly: false,
    outreach: 'all',
  });
  const [search, setSearch] = useState('');
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [listings, setListings] = useState<ScrapedListing[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [trialFlags, setTrialFlags] = useState<Map<string, boolean>>(new Map());
  const [liveMatchIndex, setLiveMatchIndex] = useState<LiveListingCandidate[]>([]);
  const [monetizationEnabled, setMonetizationEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editListing, setEditListing] = useState<ScrapedListing | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<{ done: number; total: number } | null>(null);
  const [publishErrors, setPublishErrors] = useState<Array<{ title: string; error: string }>>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUser, setAssignUser] = useState<Profile | null>(null);
  const [outreachTargets, setOutreachTargets] = useState<ScrapedListing[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Preselect the source of a just-completed ingest and jump to its new leads.
  useEffect(() => {
    if (initialSource) {
      setFilters((f) => ({ ...f, source: initialSource, callStatus: 'active', newOnly: true }));
    }
  }, [initialSource, refreshKey]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, monetization, hoods, matchIndex] = await Promise.all([
        aiIntakeService.getReviewListings(filters),
        aiIntakeService.getMonetizationEnabled(),
        aiIntakeService.getNeighborhoods(),
        aiIntakeService.buildLiveMatchIndex(),
      ]);
      setListings(rows);
      setMonetizationEnabled(monetization);
      setNeighborhoods(hoods);
      setLiveMatchIndex(matchIndex);
      setSelected(new Set());

      const assignedIds = rows.map((r) => r.assigned_user_id).filter((id): id is string => !!id);
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
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((l) =>
      [
        l.title,
        l.contact_name,
        l.agency_name,
        l.contact_phone,
        l.contact_phone_display,
        l.cross_street_1,
        l.cross_street_2,
        l.intake_extra?.full_address,
        l.neighborhood,
      ]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [listings, search]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = visible.length > 0 && visible.every((l) => selected.has(l.id));
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(visible.map((l) => l.id)));

  const selectedRows = useMemo(
    () => visible.filter((l) => selected.has(l.id)),
    [visible, selected],
  );

  const handlePublish = async (rows: ScrapedListing[]) => {
    if (!user?.id || rows.length === 0 || publishing) return;
    // Call status is an internal notation only — it never gates or is
    // touched by publishing. An admin clicking Publish always publishes.
    const publishable = rows.filter((r) => r.call_status !== 'published');
    if (publishable.length === 0) return;
    setPublishing(true);
    setPublishErrors([]);
    setPublishProgress({ done: 0, total: publishable.length });
    try {
      const result = await aiIntakeService.publishIntakeListings(publishable, user.id, (done, total) =>
        setPublishProgress({ done, total }),
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

  const bulkStatus = async (status: CallStatus) => {
    if (selected.size === 0) return;
    try {
      await aiIntakeService.setCallStatusBulk([...selected], status);
      setToast(`Updated ${selected.size} lead${selected.size === 1 ? '' : 's'}`);
      fetchData();
    } catch {
      setToast('Failed to update leads');
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

  const duplicateMatches = useMemo(() => {
    const map = new Map<string, MatchCandidate[]>();
    if (liveMatchIndex.length === 0) return map;
    for (const listing of listings) {
      const matches = aiIntakeService.findLiveDuplicates(listing, liveMatchIndex);
      if (matches.length > 0) map.set(listing.id, matches);
    }
    return map;
  }, [listings, liveMatchIndex]);

  const trialUsed = (listing: ScrapedListing): boolean => {
    if (!monetizationEnabled || listing.listing_kind !== 'rental') return false;
    const e164 = toE164(listing.contact_phone);
    if (!e164) return false;
    return trialFlags.get(e164) === false;
  };

  const setFilter = <K extends keyof ReviewFilters>(key: K, value: ReviewFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const selectClass =
    'px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="space-y-4">
      {/* Filters — the four statuses an admin actually switches between sit on
          a segmented control; everything rarer stays in the overflow select. */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-0.5 bg-gray-100 rounded-lg">
            {PRIMARY_STATUS_TABS.map((tab) => {
              const active = filters.callStatus === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setFilter('callStatus', tab.value)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <select
            value={
              PRIMARY_STATUS_TABS.some((t) => t.value === filters.callStatus)
                ? ''
                : filters.callStatus
            }
            onChange={(e) =>
              e.target.value && setFilter('callStatus', e.target.value as ReviewFilters['callStatus'])
            }
            className={selectClass}
            aria-label="More statuses"
          >
            <option value="">More…</option>
            {OVERFLOW_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <span className="text-sm text-gray-500 ml-auto">
            {visible.length} listing{visible.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, contact, phone, streets…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <select
            value={filters.source}
            onChange={(e) => setFilter('source', e.target.value)}
            className={selectClass}
          >
            {SOURCE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={filters.kind}
            onChange={(e) => setFilter('kind', e.target.value as ReviewFilters['kind'])}
            className={selectClass}
          >
            <option value="all">Rentals &amp; sales</option>
            <option value="rental">Rentals</option>
            <option value="sale">Sales</option>
          </select>

          <select
            value={filters.neighborhood}
            onChange={(e) => setFilter('neighborhood', e.target.value)}
            className={selectClass}
          >
            <option value="all">All neighborhoods</option>
            {neighborhoods.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <select
            value={filters.outreach}
            onChange={(e) => setFilter('outreach', e.target.value as ReviewFilters['outreach'])}
            className={selectClass}
            aria-label="SMS offer status"
          >
            {OUTREACH_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.newOnly}
              onChange={(e) => setFilter('newOnly', e.target.checked)}
              className="rounded"
            />
            New only
          </label>

          <button
            onClick={fetchData}
            className="px-2.5 py-1.5 text-gray-500 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
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
        <div className="bg-gray-900 text-white rounded-lg px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium mr-1">{selected.size} selected</span>
          <button
            onClick={() => bulkStatus('approved')}
            disabled={publishing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 rounded-md hover:bg-green-500 disabled:opacity-50 transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> Mark permission
          </button>
          <button
            onClick={() => handlePublish(selectedRows)}
            disabled={publishing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 rounded-md hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            {publishing && publishProgress
              ? `Publishing ${publishProgress.done}/${publishProgress.total}...`
              : 'Publish'}
          </button>
          <button
            onClick={() => setOutreachTargets(selectedRows)}
            disabled={publishing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-indigo-600 rounded-md hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            title="Text these landlords the free-2-weeks posting offer"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Send SMS offer
          </button>
          <button
            onClick={() => setAssignOpen(true)}
            disabled={publishing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gray-700 rounded-md hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" /> Assign
          </button>
          <button
            onClick={() => bulkStatus('suppressed')}
            disabled={publishing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gray-700 rounded-md hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Discard
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-sm text-gray-300 hover:text-white transition-colors"
          >
            Clear
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
            <button onClick={() => setAssignOpen(false)} className="text-gray-400 hover:text-gray-600">
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
        ) : visible.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500">
              No listings match these filters. Upload a pamphlet or scrape luach.com to add leads.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Header row */}
            <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded" />
              <span className="w-12 text-center">Photo</span>
              <span className="flex-1">Listing</span>
              <span className="w-40">Contact</span>
              <span className="w-32">Status</span>
              <span className="w-28 text-right">Actions</span>
            </div>

            {visible.map((listing) => {
              const extra = listing.intake_extra || {};
              const photoItems = (listing.image_paths || []).filter((i) => i.type !== 'video');
              const videoItem = (listing.image_paths || []).find((i) => i.type === 'video');
              const firstImage = photoItems.find((i) => i.is_featured) || photoItems[0];
              const thumbnailSrc = firstImage?.publicUrl || videoItem?.thumbnailUrl;
              const assigned = listing.assigned_user_id
                ? profiles.get(listing.assigned_user_id)
                : null;
              const crossStreets = [listing.cross_street_1, listing.cross_street_2]
                .filter(Boolean)
                .join(' & ');
              // An exact address is the more specific of the two — show it.
              const locationLine = extra.full_address || crossStreets || listing.neighborhood;
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
              const isNew = !listing.admin_reviewed_at;
              const status = listing.call_status;

              return (
                <div
                  key={listing.id}
                  onClick={() => setEditListing(listing)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setEditListing(listing);
                    }
                  }}
                  className="group flex items-center gap-3 px-4 py-3 text-sm cursor-pointer hover:bg-blue-50/50 transition-colors focus:outline-none focus:bg-blue-50/50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(listing.id)}
                    onChange={() => toggleSelect(listing.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded"
                  />

                  {/* Thumbnail */}
                  <div className="w-12 h-12 flex-shrink-0 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
                    {thumbnailSrc ? (
                      <img src={thumbnailSrc} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageOff className="w-4 h-4 text-gray-300" />
                    )}
                  </div>

                  {/* Listing summary */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ConfidenceDot confidence={listing.parse_confidence} />
                      {isNew && (
                        <span className="px-1.5 py-0.5 text-[11px] font-semibold rounded bg-rose-100 text-rose-700">
                          NEW
                        </span>
                      )}
                      <p className="font-medium text-gray-900 truncate max-w-xs">
                        {listing.title || 'Untitled'}
                      </p>
                      <KindBadge kind={listing.listing_kind} />
                      <SourceBadge source={listing.source} />
                      {listing.source_url && (
                        <a
                          href={listing.source_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-gray-400 hover:text-blue-600"
                          title="Open original listing"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <RowWarnings
                        noGeo={listing.geocode_status !== 'success'}
                        trialUsed={trialUsed(listing)}
                        duplicates={duplicateMatches.get(listing.id) ?? []}
                      />
                    </div>
                    {/* One secondary line: specs, then provenance — the seen
                        count used to own a third line of its own. */}
                    <p className="text-xs text-gray-500 truncate">
                      {[
                        listing.bedrooms != null ? `${listing.bedrooms}BR` : null,
                        listing.bathrooms ? `${listing.bathrooms}BA` : null,
                        priceDisplay,
                        locationLine,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      <span className="text-gray-400">
                        {' · '}
                        {listing.times_seen}× seen, last {listing.date_last_seen}
                      </span>
                    </p>
                  </div>

                  {/* Contact */}
                  <div className="w-40 flex-shrink-0 min-w-0">
                    <p className="text-gray-900 truncate">
                      {listing.contact_name || listing.agency_name || '-'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {listing.contact_phone_display || listing.contact_phone || ''}
                    </p>
                    {assigned ? (
                      <p className="text-[11px] text-blue-600 truncate" title={assigned.email}>
                        → {assigned.full_name}
                      </p>
                    ) : listing.admin_custom_agency_name ? (
                      <p className="text-[11px] text-gray-400 truncate italic">
                        {listing.admin_custom_agency_name}
                      </p>
                    ) : null}
                  </div>

                  {/* Status */}
                  <div className="w-32 flex-shrink-0 space-y-1">
                    <span
                      className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded ${STATUS_PILL[status]}`}
                    >
                      {CALL_STATUS_LABELS[status]}
                    </span>
                    {listing.outreach_status && (
                      <span
                        className={`block w-fit px-2 py-0.5 text-[11px] font-medium rounded ${OUTREACH_PILL[listing.outreach_status]}`}
                        title={
                          listing.outreach_sent_at
                            ? `SMS offer sent ${new Date(listing.outreach_sent_at).toLocaleDateString()}`
                            : undefined
                        }
                      >
                        {OUTREACH_STATUS_LABELS[listing.outreach_status]}
                      </span>
                    )}
                    {status === 'published' && listing.published_listing_id && (
                      <a
                        href={`/listing/${listing.published_listing_id}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800"
                      >
                        View live <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {/* Quick action + open affordance */}
                  <div className="w-28 flex-shrink-0 flex items-center justify-end gap-2">
                    {status !== 'published' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePublish([listing]);
                        }}
                        disabled={publishing}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        title="Publish live now"
                      >
                        Publish
                      </button>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {outreachTargets && (
        <IntakeOutreachModal
          listings={outreachTargets}
          onClose={() => setOutreachTargets(null)}
          onConfirm={(ids) => aiIntakeService.sendOutreachSms(ids)}
          onSent={() => fetchData()}
        />
      )}

      <IntakeWorkspaceDrawer
        listing={editListing}
        onSendOffer={(l) => setOutreachTargets([l])}
        assignedProfile={
          editListing?.assigned_user_id ? profiles.get(editListing.assigned_user_id) ?? null : null
        }
        duplicates={editListing ? duplicateMatches.get(editListing.id) ?? [] : []}
        onClose={() => setEditListing(null)}
        onSaved={fetchData}
        onPublish={(saved) => handlePublish([saved])}
        onDeleted={() => {
          setEditListing(null);
          fetchData();
        }}
      />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
