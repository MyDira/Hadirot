import { useCallback, useEffect, useRef, useState } from 'react';
import { Profile, supabase } from '@/config/supabase';
import { adminPanelService, AdminUsersQuery } from '@/services/adminPanel';
import { agenciesService } from '@/services/agencies';
import { salesService } from '@/services/sales';
import { useAdminToast } from '../adminToast';

const DEFAULT_QUERY: AdminUsersQuery = {
  search: '',
  role: '',
  agency: '',
  sort: 'created_at',
  dir: 'desc',
  page: 1,
  perPage: 25,
};

export function useAdminUsers() {
  const toast = useAdminToast();
  const [query, setQuery] = useState<AdminUsersQuery>(DEFAULT_QUERY);
  const [rows, setRows] = useState<Profile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [agencies, setAgencies] = useState<string[]>([]);
  const [salesFeatureEnabled, setSalesFeatureEnabled] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [updatingAgencyAccessId, setUpdatingAgencyAccessId] = useState<string | null>(null);
  const [updatingSalesAccessId, setUpdatingSalesAccessId] = useState<string | null>(null);
  const fetchSeq = useRef(0);

  useEffect(() => {
    adminPanelService.listAgencies().then(setAgencies);
    salesService.isSalesFeatureEnabled().then(setSalesFeatureEnabled);
  }, []);

  const fetchUsers = useCallback(async (q: AdminUsersQuery) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const { rows: data, total: count } = await adminPanelService.searchUsers(q);
      if (seq !== fetchSeq.current) return;
      setRows(data);
      setTotal(count);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  // Debounce text search; everything else refetches immediately.
  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(query), query.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query, fetchUsers]);

  const setFilter = useCallback(
    (patch: Partial<Pick<AdminUsersQuery, 'search' | 'role' | 'agency'>>) => {
      setQuery((prev) => ({ ...prev, ...patch, page: 1 }));
    },
    [],
  );

  const setSort = useCallback((field: AdminUsersQuery['sort']) => {
    setQuery((prev) => ({
      ...prev,
      sort: field,
      dir: prev.sort === field ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'asc',
      page: 1,
    }));
  }, []);

  const setPage = useCallback((page: number) => {
    setQuery((prev) => ({ ...prev, page }));
  }, []);

  const refresh = useCallback(() => fetchUsers(query), [fetchUsers, query]);

  const updateRole = useCallback(
    async (userId: string, newRole: string) => {
      setActionLoadingId(userId);
      try {
        const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
        if (error) throw error;
        setRows((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole as Profile['role'] } : u)),
        );
        toast('User role updated');
      } catch (error) {
        console.error('Error updating user role:', error);
        toast('Failed to update user role. Please try again.', 'error');
      } finally {
        setActionLoadingId(null);
      }
    },
    [toast],
  );

  const toggleAgencyAccess = useCallback(
    async (targetUser: Profile) => {
      if (updatingAgencyAccessId === targetUser.id) return;
      const previousValue = Boolean(targetUser.can_manage_agency);
      const nextValue = !previousValue;

      setUpdatingAgencyAccessId(targetUser.id);
      setRows((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, can_manage_agency: nextValue } : u)),
      );

      try {
        const { error } = await supabase
          .from('profiles')
          .update({ can_manage_agency: nextValue })
          .eq('id', targetUser.id);
        if (error) throw error;

        if (nextValue) {
          try {
            await agenciesService.ensureAgencyForOwner(targetUser.id);
          } catch (ensureError) {
            console.error('[admin] ensureAgencyForOwner failed', ensureError);
          }
        }
        toast('Agency Access updated');
      } catch (error) {
        console.error('Error updating agency access:', error);
        setRows((prev) =>
          prev.map((u) =>
            u.id === targetUser.id ? { ...u, can_manage_agency: previousValue } : u,
          ),
        );
        toast("Couldn't update Agency Access. Try again.", 'error');
      } finally {
        setUpdatingAgencyAccessId(null);
      }
    },
    [toast, updatingAgencyAccessId],
  );

  const toggleSalesAccess = useCallback(
    async (targetUser: Profile) => {
      if (updatingSalesAccessId === targetUser.id) return;
      const previousValue = Boolean(targetUser.can_post_sales);
      const nextValue = !previousValue;

      setUpdatingSalesAccessId(targetUser.id);
      setRows((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, can_post_sales: nextValue } : u)),
      );

      try {
        await salesService.toggleUserSalesPermission(targetUser.id, nextValue);
        toast('Sales Access updated');
      } catch (error) {
        console.error('Error updating sales access:', error);
        setRows((prev) =>
          prev.map((u) => (u.id === targetUser.id ? { ...u, can_post_sales: previousValue } : u)),
        );
        toast("Couldn't update Sales Access. Try again.", 'error');
      } finally {
        setUpdatingSalesAccessId(null);
      }
    },
    [toast, updatingSalesAccessId],
  );

  const removeUser = useCallback(
    async (userId: string) => {
      setActionLoadingId(userId);
      try {
        const { error } = await supabase.functions.invoke('delete-user', {
          body: { userId },
        });
        if (error) throw new Error(error.message || 'Failed to delete user');

        setRows((prev) => prev.filter((u) => u.id !== userId));
        setTotal((prev) => Math.max(0, prev - 1));
        toast('User deleted from profile and authentication system');
      } catch (error) {
        console.error('Error deleting user:', error);
        toast(
          `Failed to delete user: ${error instanceof Error ? error.message : 'unknown error'}`,
          'error',
        );
      } finally {
        setActionLoadingId(null);
      }
    },
    [toast],
  );

  return {
    rows,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    loading,
    query,
    setFilter,
    setSort,
    setPage,
    refresh,
    agencies,
    salesFeatureEnabled,
    actionLoadingId,
    updatingAgencyAccessId,
    updatingSalesAccessId,
    updateRole,
    toggleAgencyAccess,
    toggleSalesAccess,
    removeUser,
  };
}
