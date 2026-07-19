import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  ArrowUpDown,
  Bath,
  BedDouble,
  ChevronDown,
  Clock,
  CreditCard as Edit,
  Eye,
  Home,
  MapPin,
  MessageSquare,
  MousePointerClick,
  Phone,
  Power,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Star,
  Trash2,
  UserCog,
  Wallet,
} from 'lucide-react';
import { Listing, Profile } from '@/config/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatPhoneForDisplay } from '@/utils/phone';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { AdminFeatureModal } from '@/components/admin/AdminFeatureModal';
import { GrantDaysModal } from '@/components/admin/GrantDaysModal';
import { ChargeListingModal } from '@/components/admin/ChargeListingModal';
import { UserSearchSelect } from '@/components/admin/UserSearchSelect';
import { RENTAL_PROPERTY_TYPES } from '@/components/listings/IconSelectGrid';
import { AdminListingRow, AdminListingStatus, AdminListingsQuery } from '@/services/adminPanel';
import { useAdminListings } from '../hooks/useAdminListings';
import { AdminSearchInput } from '../components/AdminSearchInput';
import { StatusPill, PillTone } from '../components/StatusPill';
import { TablePagination } from '../components/TablePagination';
import { TableSkeleton } from '../components/TableSkeleton';
import { EmptyState } from '../components/EmptyState';
import { BulkActionsBar } from '../components/BulkActionsBar';

const DENSITY_STORAGE_KEY = 'hadirot.admin.listings.density';

const isListingCurrentlyFeatured = (listing: Listing) =>
  Boolean(
    listing.is_featured &&
      listing.featured_expires_at &&
      new Date(listing.featured_expires_at) > new Date(),
  );

function priceDisplay(listing: AdminListingRow): string {
  if (listing.call_for_price) return 'Call for Price';
  if (listing.listing_type === 'sale') {
    return `$${(listing.asking_price || 0).toLocaleString()}`;
  }
  return `$${(listing.price || 0).toLocaleString()}/month`;
}

// Which underlying column a given inline edit writes to (residential vs
// commercial, rental vs sale differ).
const priceField = (l: AdminListingRow) => (l.listing_type === 'sale' ? 'asking_price' : 'price');
const currentPrice = (l: AdminListingRow): number | null =>
  (l.listing_type === 'sale' ? l.asking_price ?? null : l.price ?? null);
const locationField = (l: AdminListingRow) => (l.__commercial ? 'full_address' : 'location');
const currentLocation = (l: AdminListingRow): string =>
  l.__commercial
    ? (l as unknown as { full_address?: string | null }).full_address ?? ''
    : l.location ?? '';
const canEditPropertyType = (l: AdminListingRow) => !l.__commercial && l.listing_type === 'rental';

const STATUS_OPTIONS: { value: AdminListingStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'deactivated', label: 'Deactivated' },
  { value: 'pending', label: 'Pending' },
  { value: 'featured', label: 'Featured' },
];

const SORT_OPTIONS: { label: string; sort: AdminListingsQuery['sort']; dir: 'asc' | 'desc' }[] = [
  { label: 'Newest first', sort: 'created_at', dir: 'desc' },
  { label: 'Oldest first', sort: 'created_at', dir: 'asc' },
  { label: 'Price: high to low', sort: 'price', dir: 'desc' },
  { label: 'Price: low to high', sort: 'price', dir: 'asc' },
  { label: 'Most bedrooms', sort: 'bedrooms', dir: 'desc' },
  { label: 'Fewest bedrooms', sort: 'bedrooms', dir: 'asc' },
  { label: 'Title A–Z', sort: 'title', dir: 'asc' },
  { label: 'Owner A–Z', sort: 'owner', dir: 'asc' },
];

const BED_OPTIONS = [
  { value: '', label: 'Any beds' },
  { value: '0', label: 'Studio +' },
  { value: '1', label: '1 +' },
  { value: '2', label: '2 +' },
  { value: '3', label: '3 +' },
  { value: '4', label: '4 +' },
  { value: '5', label: '5 +' },
];

function primaryStatus(listing: AdminListingRow): { tone: PillTone; label: string } {
  if (listing.approved === false) return { tone: 'amber', label: 'Pending' };
  return listing.is_active
    ? { tone: 'green', label: 'Active' }
    : { tone: 'red', label: 'Deactivated' };
}

interface EditDraft {
  location: string;
  bedrooms: string;
  bathrooms: string;
  price: string;
  property_type: string;
}

function draftFrom(listing: AdminListingRow): EditDraft {
  return {
    location: currentLocation(listing),
    bedrooms: listing.bedrooms == null ? '' : String(listing.bedrooms),
    bathrooms: listing.bathrooms == null ? '' : String(listing.bathrooms),
    price: currentPrice(listing) == null ? '' : String(currentPrice(listing)),
    property_type: listing.property_type ?? '',
  };
}

export function ListingsSection() {
  const { user } = useAuth();
  const {
    rows,
    total,
    totalPages,
    loading,
    rpcMissing,
    query,
    setFilter,
    clearFilters,
    applySort,
    setPage,
    refresh,
    activeFilterCount,
    selection,
    toggleOne,
    clearSelection,
    bulkBusy,
    toggleActive,
    updateListingFields,
    reassignOwner,
    remove,
    bulkSetActive,
    bulkDelete,
  } = useAdminListings();

  const [showFilters, setShowFilters] = useState(false);
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() =>
    localStorage.getItem(DENSITY_STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable',
  );
  const [filterOwner, setFilterOwner] = useState<Profile | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [reassignUser, setReassignUser] = useState<Profile | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [featureModalListing, setFeatureModalListing] = useState<Listing | null>(null);
  const [grantDaysListing, setGrantDaysListing] = useState<{ id: string; label: string } | null>(null);
  const [chargeListing, setChargeListing] = useState<{ id: string; label: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminListingRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdminListingRow | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Collapse the expanded card if it scrolls out of the current page/result set.
  useEffect(() => {
    if (expandedId && !rows.some((r) => r.id === expandedId)) {
      setExpandedId(null);
      setDraft(null);
      setReassignUser(null);
    }
  }, [rows, expandedId]);

  const toggleDensity = () => {
    setDensity((prev) => {
      const next = prev === 'compact' ? 'comfortable' : 'compact';
      localStorage.setItem(DENSITY_STORAGE_KEY, next);
      return next;
    });
  };

  const openCard = (listing: AdminListingRow) => {
    if (expandedId === listing.id) {
      setExpandedId(null);
      setDraft(null);
      setReassignUser(null);
      return;
    }
    setExpandedId(listing.id);
    setDraft(draftFrom(listing));
    setReassignUser(null);
  };

  const toggleStatus = (value: AdminListingStatus) => {
    const next = query.statuses.includes(value)
      ? query.statuses.filter((s) => s !== value)
      : [...query.statuses, value];
    setFilter({ statuses: next });
  };

  const handleSaveEdit = async (listing: AdminListingRow) => {
    if (!draft) return;
    const patch: Record<string, unknown> = {};

    if (draft.location !== currentLocation(listing)) {
      patch[locationField(listing)] = draft.location.trim() || null;
    }
    const beds = draft.bedrooms === '' ? null : Number(draft.bedrooms);
    if (beds !== (listing.bedrooms ?? null)) patch.bedrooms = beds;
    const baths = draft.bathrooms === '' ? null : Number(draft.bathrooms);
    if (baths !== (listing.bathrooms ?? null)) patch.bathrooms = baths;
    const price = draft.price === '' ? null : Number(draft.price);
    if (price !== currentPrice(listing)) patch[priceField(listing)] = price;
    if (
      canEditPropertyType(listing) &&
      draft.property_type &&
      draft.property_type !== listing.property_type
    ) {
      patch.property_type = draft.property_type;
    }

    if (Object.keys(patch).length === 0) return;
    setSavingEdit(true);
    await updateListingFields(listing.id, listing.__commercial === true, patch);
    setSavingEdit(false);
  };

  const handleReassign = async (listing: AdminListingRow) => {
    if (!reassignUser) return;
    const ok = await reassignOwner(listing.id, listing.__commercial === true, reassignUser);
    if (ok) setReassignUser(null);
  };

  const listingLabel = (l: AdminListingRow) => `${l.title} · ${l.neighborhood || l.location || ''}`;
  const shownFrom = total === 0 ? 0 : (query.page - 1) * query.perPage + 1;
  const shownTo = Math.min(query.page * query.perPage, total);
  const cardPad = density === 'compact' ? 'p-3' : 'p-4';
  const sortValue = `${query.sort}:${query.dir}`;

  return (
    <div className="space-y-4">
      {rpcMissing && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">Listing search isn't installed in the database yet.</p>
            <p>
              Run the SQL in{' '}
              <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">
                supabase/migrations/20260719000000_admin_listings_redesign.sql
              </code>{' '}
              in the Supabase SQL editor, then refresh this page.
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <AdminSearchInput
            value={query.search}
            onChange={(value) => setFilter({ search: value })}
            placeholder="Search anything — address, title, owner, email, phone, ID…"
            className="flex-1"
          />
          <div className="flex items-center gap-2">
            <div className="relative">
              <ArrowUpDown className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={sortValue}
                onChange={(e) => {
                  const opt = SORT_OPTIONS.find((o) => `${o.sort}:${o.dir}` === e.target.value);
                  if (opt) applySort(opt.sort, opt.dir);
                }}
                className="pl-9 pr-8 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 focus:ring-[#4E4B43] focus:border-[#4E4B43] appearance-none bg-white"
                aria-label="Sort listings"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={`${o.sort}:${o.dir}`} value={`${o.sort}:${o.dir}`}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowFilters((s) => !s)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border rounded-lg transition-colors ${
                showFilters || activeFilterCount > 0
                  ? 'border-[#4E4B43] text-[#4E4B43] bg-[#4E4B43]/5'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-[#4E4B43] text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button
              onClick={toggleDensity}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title={density === 'compact' ? 'Switch to comfortable cards' : 'Switch to compact cards'}
            >
              {density === 'compact' ? 'Compact' : 'Comfortable'}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="space-y-4 pt-3 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Owner Type</label>
                <select
                  value={query.ownerRole}
                  onChange={(e) => setFilter({ ownerRole: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                >
                  <option value="">All Roles</option>
                  <option value="landlord">Landlord</option>
                  <option value="agent">Agent</option>
                  <option value="tenant">Tenant</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                <select
                  value={query.listingType}
                  onChange={(e) => setFilter({ listingType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                >
                  <option value="">All Types</option>
                  <option value="rental">Rental</option>
                  <option value="sale">Sale</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Bed Count</label>
                <select
                  value={query.minBedrooms}
                  onChange={(e) => setFilter({ minBedrooms: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                >
                  {BED_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Contact Phone</label>
                <input
                  type="text"
                  inputMode="tel"
                  value={query.contactPhone}
                  onChange={(e) => setFilter({ contactPhone: e.target.value })}
                  placeholder="e.g. 718-555-0134"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date Listed — From</label>
                <input
                  type="date"
                  value={query.dateFrom}
                  onChange={(e) => setFilter({ dateFrom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date Listed — To</label>
                <input
                  type="date"
                  value={query.dateTo}
                  onChange={(e) => setFilter({ dateTo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Account Assigned To</label>
                <UserSearchSelect
                  selectedUser={filterOwner}
                  onSelect={(u) => {
                    setFilterOwner(u);
                    setFilter({ ownerId: u?.id ?? '' });
                  }}
                  placeholder="Filter by owner account…"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((opt) => {
                  const active = query.statuses.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleStatus(opt.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        active
                          ? 'bg-[#4E4B43] text-white border-[#4E4B43]'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  clearFilters();
                  setFilterOwner(null);
                }}
                className="text-sm text-gray-500 hover:text-[#4E4B43] transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <BulkActionsBar
          count={selection.size}
          onClear={clearSelection}
          actions={[
            { label: 'Activate', icon: Power, tone: 'success', onClick: () => bulkSetActive(true), disabled: bulkBusy },
            { label: 'Deactivate', icon: Power, tone: 'default', onClick: () => bulkSetActive(false), disabled: bulkBusy },
            { label: 'Delete', icon: Trash2, tone: 'danger', onClick: () => setConfirmBulkDelete(true), disabled: bulkBusy },
          ]}
        />
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#4E4B43]">
            All Listings {!loading && `(${total.toLocaleString()})`}
          </h3>
        </div>

        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={4} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Home}
            title="No listings found"
            message={
              rpcMissing
                ? 'Install the search function above, then refresh.'
                : 'Try adjusting your search or filters.'
            }
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map((listing) => {
              const isCommercial = listing.__commercial === true;
              const isExpanded = expandedId === listing.id;
              const status = primaryStatus(listing);
              const featured = isListingCurrentlyFeatured(listing);
              const stats = [
                { icon: Eye, label: 'Impressions', value: listing.impressions ?? 0 },
                { icon: MousePointerClick, label: 'Direct views', value: listing.direct_views ?? 0 },
                { icon: MapPin, label: 'Map pin clicks', value: listing.map_pin_clicks ?? 0 },
                { icon: Phone, label: 'Phone reveals', value: listing.phone_reveals ?? 0 },
                { icon: MessageSquare, label: 'Inquiries', value: listing.inquiries ?? 0 },
              ];
              const beds = listing.bedrooms;
              const baths = listing.bathrooms;

              return (
                <div
                  key={listing.id}
                  className={`transition-colors ${
                    selection.has(listing.id) ? 'bg-[#4E4B43]/5' : isExpanded ? 'bg-gray-50/60' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Collapsed row */}
                  <div className={`flex items-start gap-3 ${cardPad}`}>
                    <input
                      type="checkbox"
                      checked={selection.has(listing.id)}
                      onChange={() => toggleOne(listing.id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-[#4E4B43] focus:ring-[#4E4B43] shrink-0"
                      aria-label={`Select ${listing.title}`}
                    />
                    {listing.thumbnail_url ? (
                      <img
                        src={listing.thumbnail_url}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover shrink-0 border border-gray-200"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <Home className="w-5 h-5 text-gray-400" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 truncate max-w-[320px]">
                              {listing.title}
                            </span>
                            {isCommercial && (
                              <span className="shrink-0 inline-flex items-center bg-cyan-50 text-cyan-700 border border-cyan-200 text-xs px-1.5 py-0.5 rounded">
                                Commercial
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{listing.location || '—'}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold text-gray-900 whitespace-nowrap">
                            {priceDisplay(listing)}
                          </div>
                        </div>
                      </div>

                      {/* meta row */}
                      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-600">
                        {beds != null && (
                          <span className="inline-flex items-center gap-1">
                            <BedDouble className="w-4 h-4 text-gray-400" />
                            {beds} bd
                          </span>
                        )}
                        {baths != null && (
                          <span className="inline-flex items-center gap-1">
                            <Bath className="w-4 h-4 text-gray-400" />
                            {baths} ba
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <UserCog className="w-4 h-4 text-gray-400" />
                          {listing.owner?.full_name || (listing.user_id ? 'Unknown' : 'No account')}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-4 h-4 text-gray-400" />
                          {listing.contact_phone ? formatPhoneForDisplay(listing.contact_phone) : '—'}
                        </span>
                      </div>

                      {/* status pills */}
                      <div className="flex items-center flex-wrap gap-2 mt-2">
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                        {featured && <StatusPill tone="amber">Featured</StatusPill>}
                        {!listing.user_id && <StatusPill tone="gray">Archived</StatusPill>}
                      </div>

                      {/* 5 stats */}
                      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs text-gray-500">
                        {stats.map((s) => (
                          <span key={s.label} className="inline-flex items-center gap-1" title={s.label}>
                            <s.icon className="w-3.5 h-3.5 opacity-70" />
                            {s.value.toLocaleString()}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => openCard(listing)}
                      className={`shrink-0 self-center p-2 rounded-lg border transition-colors ${
                        isExpanded
                          ? 'border-[#4E4B43] text-[#4E4B43] bg-[#4E4B43]/5'
                          : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? 'Collapse controls' : 'Expand controls'}
                    >
                      <ChevronDown
                        className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>

                  {/* Expanded controls + inline edit */}
                  {isExpanded && draft && (
                    <div className="px-4 sm:px-6 pb-5 pt-1 space-y-5 border-t border-gray-100 bg-gray-50/60">
                      {/* Controls */}
                      <div className="flex flex-wrap gap-2 pt-4">
                        <Link
                          to={isCommercial ? `/commercial-listing/${listing.id}` : `/listing/${listing.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                        >
                          <Eye className="w-4 h-4" /> View
                        </Link>
                        <Link
                          to={isCommercial ? `/commercial/edit/${listing.id}` : `/edit/${listing.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                        >
                          <Edit className="w-4 h-4" /> Full editor
                        </Link>
                        <button
                          onClick={() => setFeatureModalListing(listing)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                        >
                          <Star
                            className={`w-4 h-4 ${listing.is_featured ? 'fill-current text-yellow-500' : ''}`}
                          />
                          {listing.is_featured ? 'Remove featured' : 'Make featured'}
                        </button>
                        <button
                          onClick={() => toggleActive(listing.id, listing.is_active, isCommercial)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border bg-white transition-colors ${
                            listing.is_active
                              ? 'border-red-200 text-red-600 hover:bg-red-50'
                              : 'border-green-200 text-green-600 hover:bg-green-50'
                          }`}
                        >
                          <Power className="w-4 h-4" />
                          {listing.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        {!isCommercial && listing.listing_type === 'rental' && (
                          <button
                            onClick={() => setGrantDaysListing({ id: listing.id, label: listingLabel(listing) })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-violet-700 bg-white hover:bg-violet-50 transition-colors"
                          >
                            <Clock className="w-4 h-4" /> Grant days
                          </button>
                        )}
                        {!isCommercial && listing.listing_type === 'rental' && (
                          <button
                            onClick={() => setChargeListing({ id: listing.id, label: listingLabel(listing) })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-emerald-700 bg-white hover:bg-emerald-50 transition-colors"
                          >
                            <Wallet className="w-4 h-4" /> Charge
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteTarget(listing)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>

                      {/* Quick edit */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Quick edit</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div className="sm:col-span-2 lg:col-span-4">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                            <input
                              type="text"
                              value={draft.location}
                              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Bedrooms</label>
                            <input
                              type="number"
                              min={0}
                              value={draft.bedrooms}
                              onChange={(e) => setDraft({ ...draft, bedrooms: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Bathrooms</label>
                            <input
                              type="number"
                              min={0}
                              step="0.5"
                              value={draft.bathrooms}
                              onChange={(e) => setDraft({ ...draft, bathrooms: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              {listing.listing_type === 'sale' ? 'Asking price' : 'Price'}
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={draft.price}
                              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                            />
                          </div>
                          {canEditPropertyType(listing) && (
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Property type</label>
                              <select
                                value={draft.property_type}
                                onChange={(e) => setDraft({ ...draft, property_type: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                              >
                                {RENTAL_PROPERTY_TYPES.map((pt) => (
                                  <option key={pt.value} value={pt.value}>
                                    {pt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-4">
                          <button
                            onClick={() => handleSaveEdit(listing)}
                            disabled={savingEdit}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-[#4E4B43] text-white hover:bg-[#3d3a34] transition-colors disabled:opacity-50"
                          >
                            <Save className="w-4 h-4" /> Save changes
                          </button>
                          <button
                            onClick={() => setDraft(draftFrom(listing))}
                            disabled={savingEdit}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="w-4 h-4" /> Reset
                          </button>
                        </div>
                      </div>

                      {/* Owner assignment */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-1">Account</h4>
                        <p className="text-xs text-gray-500 mb-3">
                          Currently:{' '}
                          <span className="font-medium text-gray-700">
                            {listing.owner?.full_name
                              ? `${listing.owner.full_name}${listing.owner.email ? ` (${listing.owner.email})` : ''}`
                              : 'No account (archived)'}
                          </span>
                        </p>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <div className="flex-1">
                            <UserSearchSelect
                              selectedUser={reassignUser}
                              onSelect={setReassignUser}
                              placeholder="Search account to reassign to…"
                            />
                          </div>
                          <button
                            onClick={() => handleReassign(listing)}
                            disabled={!reassignUser}
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-[#4E4B43] text-white hover:bg-[#3d3a34] transition-colors disabled:opacity-50"
                          >
                            <UserCog className="w-4 h-4" /> Reassign
                          </button>
                          {listing.user_id && (
                            <button
                              onClick={() => setArchiveTarget(listing)}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-amber-200 text-amber-700 bg-white hover:bg-amber-50 transition-colors"
                            >
                              <Archive className="w-4 h-4" /> Archive
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && (
          <TablePagination
            page={query.page}
            totalPages={totalPages}
            total={total}
            shownFrom={shownFrom}
            shownTo={shownTo}
            onPage={setPage}
            noun="listings"
          />
        )}
      </div>

      {/* Modals */}
      {featureModalListing && user && (
        <AdminFeatureModal
          isOpen={!!featureModalListing}
          onClose={() => setFeatureModalListing(null)}
          listing={featureModalListing}
          adminId={user.id}
          onSuccess={refresh}
        />
      )}

      <GrantDaysModal
        open={!!grantDaysListing}
        onClose={() => setGrantDaysListing(null)}
        onGranted={() => {
          void refresh();
        }}
        listingId={grantDaysListing?.id ?? null}
        listingLabel={grantDaysListing?.label ?? null}
        adminId={user?.id ?? ''}
      />

      <ChargeListingModal
        open={!!chargeListing}
        onClose={() => setChargeListing(null)}
        listingId={chargeListing?.id ?? null}
        listingLabel={chargeListing?.label ?? null}
      />

      <ConfirmDialog
        isOpen={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => {
          if (archiveTarget) {
            void reassignOwner(archiveTarget.id, archiveTarget.__commercial === true, null);
          }
          setArchiveTarget(null);
        }}
        title="Archive this listing?"
        message={`"${archiveTarget?.title || ''}" will be detached from its owner account (archived). You can reattach it to an account later.`}
        confirmText="Archive"
        severity="warning"
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) remove(deleteTarget.id, deleteTarget.__commercial === true);
          setDeleteTarget(null);
        }}
        title="Delete listing permanently?"
        message={`"${deleteTarget?.title || ''}" will be permanently deleted. This action cannot be undone.`}
        confirmText="Delete Listing"
        severity="danger"
      />

      <ConfirmDialog
        isOpen={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => {
          setConfirmBulkDelete(false);
          void bulkDelete();
        }}
        title={`Delete ${selection.size} listing${selection.size === 1 ? '' : 's'}?`}
        message="The selected listings will be permanently deleted. This action cannot be undone."
        confirmText="Delete Selected"
        severity="danger"
      />
    </div>
  );
}
