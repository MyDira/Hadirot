import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Eye, Map, XCircle } from 'lucide-react';
import { CommercialListing, Listing } from '@/config/supabase';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { AdminListingMapModal } from '@/components/admin/AdminListingMapModal';
import { useAdminPending, PendingItem } from '../hooks/useAdminPending';
import { AdminSearchInput } from '../components/AdminSearchInput';
import { TablePagination } from '../components/TablePagination';
import { TableSkeleton } from '../components/TableSkeleton';
import { EmptyState } from '../components/EmptyState';
import { BulkActionsBar } from '../components/BulkActionsBar';

const PENDING_PER_PAGE = 25;

function sortIcon(sort: { field: string; direction: 'asc' | 'desc' }, field: string) {
  if (sort.field !== field) return '';
  return sort.direction === 'asc' ? '↑' : '↓';
}

export function PendingSection() {
  const {
    items,
    filteredCount,
    loading,
    searchTerm,
    search,
    sort,
    setSort,
    page,
    setPage,
    totalPages,
    approve,
    reject,
    bulkApprove,
    bulkReject,
    bulkBusy,
    actionId,
    selection,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
  } = useAdminPending();

  const [mapModalListing, setMapModalListing] = useState<Listing | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingItem | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<'approve' | 'reject' | null>(null);

  const shownFrom = filteredCount === 0 ? 0 : (page - 1) * PENDING_PER_PAGE + 1;
  const shownTo = Math.min(page * PENDING_PER_PAGE, filteredCount);
  const allOnPageSelected = items.length > 0 && items.every((i) => selection.has(i.listing.id));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <BulkActionsBar
          count={selection.size}
          onClear={clearSelection}
          actions={[
            { label: 'Approve', icon: CheckCircle, tone: 'success', onClick: () => setConfirmBulk('approve'), disabled: bulkBusy },
            { label: 'Reject', icon: XCircle, tone: 'danger', onClick: () => setConfirmBulk('reject'), disabled: bulkBusy },
          ]}
        />
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold text-[#4E4B43]">
              Pending Listings {!loading && `(${filteredCount})`}
            </h2>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#1E4A74' }} />
                Residential
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#0891B2' }} />
                Commercial
              </span>
            </div>
          </div>
          <div className="mt-4">
            <AdminSearchInput
              value={searchTerm}
              onChange={search}
              placeholder="Search by title or owner…"
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Eye}
            title="No pending listings"
            message={
              searchTerm ? 'No pending listings match your search.' : 'All listings have been reviewed.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAllOnPage}
                      className="h-4 w-4 rounded border-gray-300 text-[#4E4B43] focus:ring-[#4E4B43]"
                      aria-label="Select all on page"
                    />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => setSort('title')}
                  >
                    Title {sortIcon(sort, 'title')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => setSort('owner')}
                  >
                    Owner {sortIcon(sort, 'owner')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => setSort('created_at')}
                  >
                    Created {sortIcon(sort, 'created_at')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((item) => {
                  const l = item.listing;
                  const borderColor = item.isCommercial ? '#0891B2' : '#1E4A74';
                  const viewPath = item.isCommercial
                    ? `/commercial-listing/${l.id}`
                    : `/listing/${l.id}`;
                  const priceDisplay = l.call_for_price
                    ? 'Call for Price'
                    : item.isCommercial
                      ? l.listing_type === 'sale'
                        ? `$${((l as CommercialListing).asking_price || 0).toLocaleString()}`
                        : `$${(l.price || 0).toLocaleString()}/mo`
                      : l.listing_type === 'sale'
                        ? `$${((l as Listing).asking_price || 0).toLocaleString()}`
                        : `$${(l.price || 0).toLocaleString()}/month`;
                  const subText = item.isCommercial
                    ? (l as CommercialListing).commercial_space_type || 'Commercial'
                    : `${
                        (l as Listing).bedrooms === 0 ? 'Studio' : `${(l as Listing).bedrooms} bed`
                      }, ${(l as Listing).bathrooms} bath`;

                  return (
                    <tr
                      key={l.id}
                      className={`transition-colors hover:bg-gray-50 ${
                        selection.has(l.id) ? 'bg-[#4E4B43]/5' : ''
                      }`}
                      style={{ borderLeft: `3px solid ${borderColor}` }}
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selection.has(l.id)}
                          onChange={() => toggleOne(l.id)}
                          className="h-4 w-4 rounded border-gray-300 text-[#4E4B43] focus:ring-[#4E4B43]"
                          aria-label={`Select ${l.title}`}
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 truncate max-w-xs">
                            {l.title}
                          </span>
                          {item.isCommercial && (
                            <span className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full bg-[#0891B2] text-white">
                              COMM · {l.listing_type === 'sale' ? 'SALE' : 'LEASE'}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{subText}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{l.owner?.full_name || 'Unknown'}</div>
                        <div className="text-sm text-gray-500 capitalize">{l.owner?.role || 'N/A'}</div>
                        {!l.user_id && (
                          <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">
                            Archived
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {priceDisplay}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(l.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-1">
                          <Link
                            to={viewPath}
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-800 transition-colors"
                            title="View Listing"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          {!item.isCommercial && (
                            <button
                              onClick={() => setMapModalListing(l as Listing)}
                              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                              title="View on Map"
                            >
                              <Map className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => approve(item)}
                            disabled={actionId === l.id || bulkBusy}
                            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 hover:text-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Approve Listing"
                          >
                            {actionId === l.id ? (
                              <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => setRejectTarget(item)}
                            disabled={actionId === l.id || bulkBusy}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 hover:text-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Reject Listing"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && (
          <TablePagination
            page={page}
            totalPages={totalPages}
            total={filteredCount}
            shownFrom={shownFrom}
            shownTo={shownTo}
            onPage={setPage}
            noun="pending listings"
          />
        )}
      </div>

      <AdminListingMapModal listing={mapModalListing} onClose={() => setMapModalListing(null)} />

      <ConfirmDialog
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => {
          if (rejectTarget) reject(rejectTarget);
          setRejectTarget(null);
        }}
        title="Reject this listing?"
        message={`"${rejectTarget?.listing.title || ''}" will be rejected and deleted. This action cannot be undone.`}
        confirmText="Reject Listing"
        severity="danger"
      />

      <ConfirmDialog
        isOpen={confirmBulk !== null}
        onClose={() => setConfirmBulk(null)}
        onConfirm={() => {
          const action = confirmBulk;
          setConfirmBulk(null);
          if (action === 'approve') void bulkApprove();
          if (action === 'reject') void bulkReject();
        }}
        title={
          confirmBulk === 'approve'
            ? `Approve ${selection.size} listing${selection.size === 1 ? '' : 's'}?`
            : `Reject ${selection.size} listing${selection.size === 1 ? '' : 's'}?`
        }
        message={
          confirmBulk === 'approve'
            ? 'The selected listings will be approved and published.'
            : 'The selected listings will be rejected and deleted. This action cannot be undone.'
        }
        confirmText={confirmBulk === 'approve' ? 'Approve Selected' : 'Reject Selected'}
        severity={confirmBulk === 'approve' ? 'warning' : 'danger'}
      />
    </div>
  );
}
