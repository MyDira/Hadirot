import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Clock,
  CreditCard as Edit,
  Eye,
  Home,
  Power,
  Rows3,
  SlidersHorizontal,
  Star,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Listing } from '@/config/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatPhoneForDisplay } from '@/utils/phone';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { AdminFeatureModal } from '@/components/admin/AdminFeatureModal';
import { GrantDaysModal } from '@/components/admin/GrantDaysModal';
import { ChargeListingModal } from '@/components/admin/ChargeListingModal';
import { AdminListingRow } from '@/services/adminPanel';
import { useAdminListings } from '../hooks/useAdminListings';
import { AdminSearchInput } from '../components/AdminSearchInput';
import { SortableHeader } from '../components/SortableHeader';
import { StatusPill } from '../components/StatusPill';
import { TablePagination } from '../components/TablePagination';
import { TableSkeleton } from '../components/TableSkeleton';
import { EmptyState } from '../components/EmptyState';
import { BulkActionsBar } from '../components/BulkActionsBar';
import { ColumnsMenu, loadVisibleColumns } from '../components/ColumnsMenu';

const isListingCurrentlyFeatured = (listing: Listing) =>
  Boolean(
    listing.is_featured &&
      listing.featured_expires_at &&
      new Date(listing.featured_expires_at) > new Date(),
  );

const OPTIONAL_COLUMNS = [
  { key: 'phone', label: 'Contact Phone' },
  { key: 'type', label: 'Type' },
  { key: 'neighborhood', label: 'Neighborhood' },
  { key: 'created', label: 'Created' },
];
const COLUMNS_STORAGE_KEY = 'hadirot.admin.listings.columns';
const DENSITY_STORAGE_KEY = 'hadirot.admin.listings.density';

function priceDisplay(listing: AdminListingRow): string {
  if (listing.call_for_price) return 'Call for Price';
  if (listing.listing_type === 'sale') {
    return `$${(listing.asking_price || 0).toLocaleString()}`;
  }
  return `$${(listing.price || 0).toLocaleString()}/month`;
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
    setSort,
    setPage,
    refresh,
    activeFilterCount,
    selection,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    bulkBusy,
    toggleActive,
    remove,
    bulkSetActive,
    bulkDelete,
  } = useAdminListings();

  const [showFilters, setShowFilters] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() =>
    loadVisibleColumns(COLUMNS_STORAGE_KEY, OPTIONAL_COLUMNS.map((c) => c.key)),
  );
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() =>
    localStorage.getItem(DENSITY_STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable',
  );
  const [featureModalListing, setFeatureModalListing] = useState<Listing | null>(null);
  const [grantDaysListing, setGrantDaysListing] = useState<{ id: string; label: string } | null>(null);
  const [chargeListing, setChargeListing] = useState<{ id: string; label: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminListingRow | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDensity = () => {
    setDensity((prev) => {
      const next = prev === 'compact' ? 'comfortable' : 'compact';
      localStorage.setItem(DENSITY_STORAGE_KEY, next);
      return next;
    });
  };

  const cellPad = density === 'compact' ? 'px-4 py-2' : 'px-4 py-4';
  const show = (key: string) => visibleColumns.has(key);
  const shownFrom = total === 0 ? 0 : (query.page - 1) * query.perPage + 1;
  const shownTo = Math.min(query.page * query.perPage, total);
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selection.has(r.id));
  const listingLabel = (l: AdminListingRow) =>
    `${l.title} · ${l.neighborhood || l.location || ''}`;

  return (
    <div className="space-y-4">
      {rpcMissing && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">Listing search isn't installed in the database yet.</p>
            <p>
              Run the SQL in <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">supabase/migrations/20260611000000_admin_panel_search.sql</code>{' '}
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
            <ColumnsMenu
              columns={OPTIONAL_COLUMNS}
              visible={visibleColumns}
              onToggle={toggleColumn}
              storageKey={COLUMNS_STORAGE_KEY}
            />
            <button
              onClick={toggleDensity}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title={density === 'compact' ? 'Switch to comfortable rows' : 'Switch to compact rows'}
            >
              <Rows3 className="w-4 h-4" />
              {density === 'compact' ? 'Compact' : 'Comfortable'}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Owner Role</label>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select
                value={query.status}
                onChange={(e) => setFilter({ status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
              >
                <option value="">All Status</option>
                <option value="featured">Featured</option>
                <option value="standard">Standard</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Active</label>
              <select
                value={query.active}
                onChange={(e) => setFilter({ active: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
              >
                <option value="">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Created From</label>
              <input
                type="date"
                value={query.dateFrom}
                onChange={(e) => setFilter({ dateFrom: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Created To</label>
              <input
                type="date"
                value={query.dateTo}
                onChange={(e) => setFilter({ dateTo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
              />
            </div>
            <div className="md:col-span-3 xl:col-span-6 flex justify-end">
              <button
                onClick={clearFilters}
                className="text-sm text-gray-500 hover:text-[#4E4B43] transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
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
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#4E4B43]">
            All Listings {!loading && `(${total.toLocaleString()})`}
          </h3>
        </div>
        {loading ? (
          <TableSkeleton rows={8} cols={7} />
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
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className={`${cellPad} w-10`}>
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAllOnPage}
                      className="h-4 w-4 rounded border-gray-300 text-[#4E4B43] focus:ring-[#4E4B43]"
                      aria-label="Select all on page"
                    />
                  </th>
                  <SortableHeader label="Property" field="title" sort={query.sort} dir={query.dir} onSort={setSort} />
                  <SortableHeader label="Owner" field="owner" sort={query.sort} dir={query.dir} onSort={setSort} />
                  {show('phone') && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Contact Phone
                    </th>
                  )}
                  {show('type') && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                  )}
                  {show('neighborhood') && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Neighborhood
                    </th>
                  )}
                  <SortableHeader label="Price" field="price" sort={query.sort} dir={query.dir} onSort={setSort} />
                  {show('created') && (
                    <SortableHeader label="Created" field="created_at" sort={query.sort} dir={query.dir} onSort={setSort} />
                  )}
                  <SortableHeader label="Active" field="is_active" sort={query.sort} dir={query.dir} onSort={setSort} />
                  <SortableHeader label="Status" field="featured" sort={query.sort} dir={query.dir} onSort={setSort} />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((listing) => (
                  <tr
                    key={listing.id}
                    className={`transition-colors hover:bg-gray-50 ${
                      selection.has(listing.id) ? 'bg-[#4E4B43]/5' : ''
                    }`}
                  >
                    <td className={cellPad}>
                      <input
                        type="checkbox"
                        checked={selection.has(listing.id)}
                        onChange={() => toggleOne(listing.id)}
                        className="h-4 w-4 rounded border-gray-300 text-[#4E4B43] focus:ring-[#4E4B43]"
                        aria-label={`Select ${listing.title}`}
                      />
                    </td>
                    <td className={cellPad}>
                      <div className="flex items-center gap-3 min-w-[200px]">
                        {listing.thumbnail_url ? (
                          <img
                            src={listing.thumbnail_url}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-200"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                            <Home className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate max-w-[260px]">
                            {listing.title}
                          </div>
                          <div className="text-sm text-gray-500 truncate max-w-[260px]">
                            {listing.location}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-sm`}>
                      <div className="font-medium text-gray-900">
                        {listing.owner?.full_name || 'Unknown'}
                      </div>
                      <div className="text-sm text-gray-500 capitalize">
                        {listing.owner?.role === 'agent'
                          ? listing.owner.agency || 'Unknown Agency'
                          : listing.owner?.role || 'Unknown role'}
                      </div>
                      {!listing.user_id && <StatusPill tone="gray">Archived</StatusPill>}
                    </td>
                    {show('phone') && (
                      <td className={`${cellPad} whitespace-nowrap text-sm text-gray-500`}>
                        {listing.contact_phone ? formatPhoneForDisplay(listing.contact_phone) : '—'}
                      </td>
                    )}
                    {show('type') && (
                      <td className={`${cellPad} whitespace-nowrap`}>
                        <StatusPill tone={listing.listing_type === 'sale' ? 'blue' : 'gray'}>
                          {listing.listing_type === 'sale' ? 'Sale' : 'Rental'}
                        </StatusPill>
                      </td>
                    )}
                    {show('neighborhood') && (
                      <td className={`${cellPad} whitespace-nowrap text-sm text-gray-500`}>
                        {listing.neighborhood || '—'}
                      </td>
                    )}
                    <td className={`${cellPad} whitespace-nowrap text-sm text-gray-900`}>
                      {priceDisplay(listing)}
                    </td>
                    {show('created') && (
                      <td className={`${cellPad} whitespace-nowrap text-sm text-gray-500`}>
                        {new Date(listing.created_at).toLocaleDateString()}
                      </td>
                    )}
                    <td className={`${cellPad} whitespace-nowrap`}>
                      <StatusPill tone={listing.is_active ? 'green' : 'red'}>
                        {listing.is_active ? 'Yes' : 'No'}
                      </StatusPill>
                    </td>
                    <td className={`${cellPad} whitespace-nowrap`}>
                      <StatusPill tone={isListingCurrentlyFeatured(listing) ? 'amber' : 'gray'}>
                        {isListingCurrentlyFeatured(listing) ? 'Featured' : 'Standard'}
                      </StatusPill>
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-sm font-medium`}>
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/listing/${listing.id}`}
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-800 transition-colors"
                          title="View Listing"
                        >
                          <Eye style={{ width: 18, height: 18 }} />
                        </Link>
                        <Link
                          to={`/edit/${listing.id}`}
                          className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 hover:text-green-800 transition-colors"
                          title="Edit Listing"
                        >
                          <Edit style={{ width: 18, height: 18 }} />
                        </Link>
                        <button
                          onClick={() => setFeatureModalListing(listing)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            listing.is_featured
                              ? 'text-yellow-500 hover:bg-yellow-50 hover:text-yellow-600'
                              : 'text-gray-400 hover:bg-yellow-50 hover:text-yellow-500'
                          }`}
                          title={listing.is_featured ? 'Remove Featured' : 'Make Featured'}
                        >
                          <Star
                            style={{ width: 18, height: 18 }}
                            className={listing.is_featured ? 'fill-current' : ''}
                          />
                        </button>
                        <button
                          onClick={() => toggleActive(listing.id, listing.is_active)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            listing.is_active
                              ? 'text-red-500 hover:bg-red-50 hover:text-red-600'
                              : 'text-green-500 hover:bg-green-50 hover:text-green-600'
                          }`}
                          title={listing.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Power style={{ width: 18, height: 18 }} />
                        </button>
                        {listing.listing_type === 'rental' && (
                          <button
                            onClick={() =>
                              setGrantDaysListing({ id: listing.id, label: listingLabel(listing) })
                            }
                            className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 hover:text-violet-800 transition-colors"
                            title="Grant paid days (admin)"
                          >
                            <Clock style={{ width: 18, height: 18 }} />
                          </button>
                        )}
                        {listing.listing_type === 'rental' && (
                          <button
                            onClick={() =>
                              setChargeListing({ id: listing.id, label: listingLabel(listing) })
                            }
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                            title="Charge via Stripe (on behalf of owner)"
                          >
                            <Wallet style={{ width: 18, height: 18 }} />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteTarget(listing)}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 hover:text-red-800 transition-colors"
                          title="Delete Listing"
                        >
                          <Trash2 style={{ width: 18, height: 18 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) remove(deleteTarget.id);
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
