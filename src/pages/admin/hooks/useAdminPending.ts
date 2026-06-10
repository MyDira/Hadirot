import { useCallback, useEffect, useMemo, useState } from 'react';
import { CommercialListing, Listing, supabase } from '@/config/supabase';
import { commercialListingsService } from '@/services/commercialListings';
import { useAdminToast } from '../adminToast';

export type PendingItem =
  | { isCommercial: false; listing: Listing }
  | { isCommercial: true; listing: CommercialListing };

export interface PendingSort {
  field: string;
  direction: 'asc' | 'desc';
}

const PENDING_PER_PAGE = 25;

export function useAdminPending() {
  const toast = useAdminToast();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSortState] = useState<PendingSort>({ field: 'created_at', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let resQuery = supabase
        .from('listings')
        .select(
          `
          *,
          owner:profiles!listings_user_id_fkey(full_name, role, agency)
        `,
        )
        .eq('approved', false);

      if (sort.field !== 'owner') {
        resQuery = resQuery.order(sort.field, { ascending: sort.direction === 'asc' });
      }

      const [{ data: pendingRes }, pendingComm] = await Promise.all([
        resQuery,
        commercialListingsService.getAdminCommercialListings(false),
      ]);

      const residentialItems: PendingItem[] = (pendingRes || []).map((l) => ({
        isCommercial: false,
        listing: l,
      }));
      const commercialItems: PendingItem[] = (pendingComm || []).map((l) => ({
        isCommercial: true,
        listing: l,
      }));

      const combined = [...residentialItems, ...commercialItems].sort((a, b) => {
        const aDate = new Date(a.listing.created_at).getTime();
        const bDate = new Date(b.listing.created_at).getTime();
        return sort.direction === 'asc' ? aDate - bDate : bDate - aDate;
      });

      setItems(combined);
      setSelection(new Set());
    } catch (error) {
      console.error('Error loading pending listings:', error);
    } finally {
      setLoading(false);
    }
  }, [sort]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(
      (item) =>
        (item.listing.title || '').toLowerCase().includes(term) ||
        (item.listing.owner?.full_name || '').toLowerCase().includes(term),
    );
  }, [items, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PENDING_PER_PAGE));
  const pageItems = filtered.slice((page - 1) * PENDING_PER_PAGE, page * PENDING_PER_PAGE);

  const setSort = useCallback((field: string) => {
    setSortState((prev) =>
      prev.field === field
        ? { ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' },
    );
    setPage(1);
  }, []);

  const search = useCallback((term: string) => {
    setSearchTerm(term);
    setPage(1);
  }, []);

  const approveOne = useCallback(async (item: PendingItem): Promise<boolean> => {
    const { error } = await supabase.functions.invoke('approve-listing', {
      body: { listingId: item.listing.id, isCommercial: item.isCommercial },
    });
    if (error) throw error;
    return true;
  }, []);

  const rejectOne = useCallback(async (item: PendingItem): Promise<boolean> => {
    if (item.isCommercial) {
      await commercialListingsService.deleteCommercialListing(item.listing.id);
    } else {
      const { error } = await supabase.from('listings').delete().eq('id', item.listing.id);
      if (error) throw error;
    }
    return true;
  }, []);

  const approve = useCallback(
    async (item: PendingItem) => {
      setActionId(item.listing.id);
      try {
        await approveOne(item);
        toast('Listing approved successfully!');
        await load();
      } catch (error) {
        console.error('Error approving listing:', error);
        toast('Failed to approve listing. Please try again.', 'error');
      } finally {
        setActionId(null);
      }
    },
    [approveOne, load, toast],
  );

  const reject = useCallback(
    async (item: PendingItem) => {
      setActionId(item.listing.id);
      try {
        await rejectOne(item);
        toast('Listing rejected');
        await load();
      } catch (error) {
        console.error('Error rejecting listing:', error);
        toast('Failed to reject listing. Please try again.', 'error');
      } finally {
        setActionId(null);
      }
    },
    [rejectOne, load, toast],
  );

  const runBulk = useCallback(
    async (ids: Set<string>, op: (item: PendingItem) => Promise<boolean>, verb: string) => {
      const targets = items.filter((i) => ids.has(i.listing.id));
      setBulkBusy(true);
      let ok = 0;
      let failed = 0;
      for (const item of targets) {
        try {
          await op(item);
          ok++;
        } catch (error) {
          console.error(`Error during bulk ${verb}:`, error);
          failed++;
        }
      }
      setBulkBusy(false);
      toast(
        failed === 0
          ? `${ok} listing${ok === 1 ? '' : 's'} ${verb}`
          : `${ok} ${verb}, ${failed} failed`,
        failed === 0 ? 'success' : 'error',
      );
      await load();
    },
    [items, load, toast],
  );

  const bulkApprove = useCallback(
    () => runBulk(selection, approveOne, 'approved'),
    [runBulk, selection, approveOne],
  );
  const bulkReject = useCallback(
    () => runBulk(selection, rejectOne, 'rejected'),
    [runBulk, selection, rejectOne],
  );

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
      const pageIds = pageItems.map((i) => i.listing.id);
      const allSelected = pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      pageIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }, [pageItems]);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  return {
    items: pageItems,
    filteredCount: filtered.length,
    loading,
    searchTerm,
    search,
    sort,
    setSort,
    page,
    setPage,
    totalPages,
    refresh: load,
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
  };
}
