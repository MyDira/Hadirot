import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, Profile } from '@/config/supabase';
import { adminPanelService, AdminListingRow, AdminListingsQuery } from '@/services/adminPanel';
import { useAdminToast } from '../adminToast';

const DEFAULT_QUERY: AdminListingsQuery = {
  search: '',
  ownerRole: '',
  listingType: '',
  statuses: [],
  ownerId: '',
  minBedrooms: '',
  contactPhone: '',
  dateFrom: '',
  dateTo: '',
  sort: 'created_at',
  dir: 'desc',
  page: 1,
  perPage: 25,
};

// Fields where a fresh sort should start descending (newest/highest/most first).
const DESC_FIRST_FIELDS: AdminListingsQuery['sort'][] = [
  'created_at',
  'price',
  'is_active',
  'featured',
  'bedrooms',
];

export function useAdminListings() {
  const toast = useAdminToast();
  const [query, setQuery] = useState<AdminListingsQuery>(DEFAULT_QUERY);
  const [rows, setRows] = useState<AdminListingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rpcMissing, setRpcMissing] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const fetchSeq = useRef(0);

  const fetchListings = useCallback(async (q: AdminListingsQuery) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const { rows: data, total: count, rpcMissing: missing } =
        await adminPanelService.searchListings(q);
      if (seq !== fetchSeq.current) return;
      setRows(data);
      setTotal(count);
      setRpcMissing(Boolean(missing));
    } catch (error) {
      console.error('Error loading listings:', error);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchListings(query), query.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query, fetchListings]);

  const setFilter = useCallback(
    (
      patch: Partial<
        Pick<
          AdminListingsQuery,
          | 'search'
          | 'ownerRole'
          | 'listingType'
          | 'statuses'
          | 'ownerId'
          | 'minBedrooms'
          | 'contactPhone'
          | 'dateFrom'
          | 'dateTo'
        >
      >,
    ) => {
      setQuery((prev) => ({ ...prev, ...patch, page: 1 }));
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setQuery((prev) => ({
      ...DEFAULT_QUERY,
      sort: prev.sort,
      dir: prev.dir,
      perPage: prev.perPage,
    }));
  }, []);

  const setSort = useCallback((field: AdminListingsQuery['sort']) => {
    setQuery((prev) => ({
      ...prev,
      sort: field,
      dir:
        prev.sort === field
          ? prev.dir === 'asc'
            ? 'desc'
            : 'asc'
          : DESC_FIRST_FIELDS.includes(field)
            ? 'desc'
            : 'asc',
      page: 1,
    }));
  }, []);

  // Direct sort setter for the redesign's sort dropdown (setSort only toggles
  // direction on the already-active field).
  const applySort = useCallback(
    (sort: AdminListingsQuery['sort'], dir: AdminListingsQuery['dir']) => {
      setQuery((prev) => ({ ...prev, sort, dir, page: 1 }));
    },
    [],
  );

  const setPage = useCallback((page: number) => {
    setQuery((prev) => ({ ...prev, page }));
  }, []);

  const refresh = useCallback(() => fetchListings(query), [fetchListings, query]);

  const activeFilterCount =
    [query.ownerRole, query.listingType, query.ownerId, query.minBedrooms, query.contactPhone.trim()].filter(
      Boolean,
    ).length +
    (query.statuses.length > 0 ? 1 : 0) +
    (query.search.trim() ? 1 : 0) +
    (query.dateFrom || query.dateTo ? 1 : 0);

  // --- selection ---
  const toggleOne = useCallback((id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllOnPage = useCallback(() => {
    setSelection((prev) => {
      const pageIds = rows.map((r) => r.id);
      const allSelected = pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      pageIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }, [rows]);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  // --- row + bulk actions ---
  const toggleActive = useCallback(
    async (id: string, isActive: boolean, isCommercial = false) => {
      try {
        const { error } = await supabase
          .from(isCommercial ? 'commercial_listings' : 'listings')
          .update({ is_active: !isActive })
          .eq('id', id);
        if (error) throw error;
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: !isActive } : r)));
        toast(!isActive ? 'Listing activated' : 'Listing deactivated');
      } catch (error) {
        console.error('Error updating listing active status:', error);
        toast('Failed to update listing. Please try again.', 'error');
      }
    },
    [toast],
  );

  // Inline "quick edit" — patch a handful of fields (location, bed/bath, price,
  // property type) directly on the underlying table with an optimistic row update.
  const updateListingFields = useCallback(
    async (id: string, isCommercial: boolean, patch: Record<string, unknown>) => {
      try {
        const { error } = await supabase
          .from(isCommercial ? 'commercial_listings' : 'listings')
          .update(patch)
          .eq('id', id);
        if (error) throw error;
        setRows((prev) =>
          prev.map((r) => (r.id === id ? ({ ...r, ...patch } as AdminListingRow) : r)),
        );
        toast('Listing updated');
        return true;
      } catch (error) {
        console.error('Error updating listing:', error);
        toast('Failed to save changes. Please try again.', 'error');
        return false;
      }
    },
    [toast],
  );

  // Reassign owner (owner = a profile) or archive (owner = null → detach owner).
  const reassignOwner = useCallback(
    async (id: string, isCommercial: boolean, owner: Profile | null) => {
      try {
        const { error } = await supabase
          .from(isCommercial ? 'commercial_listings' : 'listings')
          .update({ user_id: owner?.id ?? null })
          .eq('id', id);
        if (error) throw error;
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? ({
                  ...r,
                  user_id: owner?.id ?? null,
                  owner: owner ?? undefined,
                } as AdminListingRow)
              : r,
          ),
        );
        toast(owner ? 'Listing reassigned' : 'Listing archived');
        return true;
      } catch (error) {
        console.error('Error reassigning listing owner:', error);
        toast(owner ? 'Failed to reassign listing.' : 'Failed to archive listing.', 'error');
        return false;
      }
    },
    [toast],
  );

  const remove = useCallback(
    async (id: string, isCommercial = false) => {
      try {
        const { error } = await supabase
          .from(isCommercial ? 'commercial_listings' : 'listings')
          .delete()
          .eq('id', id);
        if (error) throw error;
        toast('Listing deleted');
        await refresh();
      } catch (error) {
        console.error('Error deleting listing:', error);
        toast('Failed to delete listing. Please try again.', 'error');
      }
    },
    [refresh, toast],
  );

  const bulkSetActive = useCallback(
    async (active: boolean) => {
      const ids = Array.from(selection);
      setBulkBusy(true);
      try {
        await adminPanelService.bulkSetListingsActive(ids, active);
        toast(`${ids.length} listing${ids.length === 1 ? '' : 's'} ${active ? 'activated' : 'deactivated'}`);
        clearSelection();
        await refresh();
      } catch (error) {
        console.error('Error bulk-updating listings:', error);
        toast('Bulk update failed. Please try again.', 'error');
      } finally {
        setBulkBusy(false);
      }
    },
    [selection, clearSelection, refresh, toast],
  );

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selection);
    setBulkBusy(true);
    try {
      await adminPanelService.bulkDeleteListings(ids);
      toast(`${ids.length} listing${ids.length === 1 ? '' : 's'} deleted`);
      clearSelection();
      await refresh();
    } catch (error) {
      console.error('Error bulk-deleting listings:', error);
      toast('Bulk delete failed. Please try again.', 'error');
    } finally {
      setBulkBusy(false);
    }
  }, [selection, clearSelection, refresh, toast]);

  return {
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    loading,
    rpcMissing,
    query,
    setFilter,
    clearFilters,
    setSort,
    applySort,
    setPage,
    refresh,
    activeFilterCount,
    selection,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    bulkBusy,
    toggleActive,
    updateListingFields,
    reassignOwner,
    remove,
    bulkSetActive,
    bulkDelete,
  };
}
