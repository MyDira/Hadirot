import React, { useState } from 'react';
import { ChevronDown, Trash2, UserCheck, Users as UsersIcon } from 'lucide-react';
import { Profile } from '@/config/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAdminSignInAsUser } from '@/hooks/useAdminSignInAsUser';
import { formatPhoneForDisplay } from '@/utils/phone';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { AdminSearchInput } from '../components/AdminSearchInput';
import { SortableHeader } from '../components/SortableHeader';
import { StatusPill } from '../components/StatusPill';
import { TablePagination } from '../components/TablePagination';
import { TableSkeleton } from '../components/TableSkeleton';
import { EmptyState } from '../components/EmptyState';

function AccessToggle({
  checked,
  busy,
  label,
  onToggle,
}: {
  checked: boolean;
  busy: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      disabled={busy}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-[#4E4B43]' : 'bg-gray-300'
      } ${busy ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function UsersSection() {
  const { profile } = useAuth();
  const { signInAsUser, loading: signingInAsUser } = useAdminSignInAsUser();
  const {
    rows,
    total,
    totalPages,
    loading,
    query,
    setFilter,
    setSort,
    setPage,
    agencies,
    salesFeatureEnabled,
    actionLoadingId,
    updatingAgencyAccessId,
    updatingSalesAccessId,
    updatingFreeAgentId,
    updateRole,
    toggleAgencyAccess,
    toggleSalesAccess,
    toggleFreeAgent,
    removeUser,
  } = useAdminUsers();

  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [impersonatingUserId, setImpersonatingUserId] = useState<string | null>(null);

  const handleSignInAsUser = async (targetUser: Profile) => {
    if (!profile?.is_admin) return;
    if (targetUser.is_admin) {
      alert('Cannot sign in as another admin user.');
      return;
    }

    const confirmed = confirm(
      `Sign in as ${targetUser.full_name}?\n\n` +
        `You will be signed out of your admin account and signed in as this user.\n` +
        `To return to your admin account, sign out and sign back in with your admin credentials.\n\n` +
        `Continue?`,
    );
    if (!confirmed) return;

    setImpersonatingUserId(targetUser.id);
    try {
      await signInAsUser(targetUser.id);
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Failed to sign in as user:', error);
      alert(`Failed to sign in as user: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setImpersonatingUserId(null);
    }
  };

  const shownFrom = total === 0 ? 0 : (query.page - 1) * query.perPage + 1;
  const shownTo = Math.min(query.page * query.perPage, total);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[#4E4B43]">Filter Users</h3>
          <button
            onClick={() => setFilter({ search: '', role: '', agency: '' })}
            className="text-sm text-gray-500 hover:text-[#4E4B43] transition-colors"
          >
            Clear Filters
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <AdminSearchInput
              value={query.search}
              onChange={(value) => setFilter({ search: value })}
              placeholder="Name, email, phone, or agency…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Role</label>
            <select
              value={query.role}
              onChange={(e) => setFilter({ role: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
            >
              <option value="">All Roles</option>
              <option value="tenant">Tenant</option>
              <option value="landlord">Landlord</option>
              <option value="agent">Agent</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Agency</label>
            <select
              value={query.agency}
              onChange={(e) => setFilter({ agency: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#4E4B43] focus:border-[#4E4B43]"
            >
              <option value="">All Agencies</option>
              {agencies.map((agency) => (
                <option key={agency} value={agency}>
                  {agency}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-[#4E4B43]">
            All Users {!loading && `(${total.toLocaleString()})`}
          </h3>
        </div>
        {loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No users found"
            message="Try adjusting your search or filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <SortableHeader label="User" field="full_name" sort={query.sort} dir={query.dir} onSort={setSort} />
                  <SortableHeader label="Role" field="role" sort={query.sort} dir={query.dir} onSort={setSort} />
                  <SortableHeader label="Agency" field="agency" sort={query.sort} dir={query.dir} onSort={setSort} className="hidden lg:table-cell" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Agency Access
                  </th>
                  <th
                    className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${
                      !salesFeatureEnabled ? 'opacity-50' : ''
                    }`}
                  >
                    Sales Access
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    title="Marks the user as a free-posting agent (overrides the paywall while 'Charge agents' is off)."
                  >
                    Free Posting
                  </th>
                  <SortableHeader label="Status" field="status" sort={query.sort} dir={query.dir} onSort={setSort} className="hidden lg:table-cell" />
                  <SortableHeader label="Joined" field="created_at" sort={query.sort} dir={query.dir} onSort={setSort} className="hidden xl:table-cell" />
                  <SortableHeader label="Contact" field="phone" sort={query.sort} dir={query.dir} onSort={setSort} className="hidden xl:table-cell" />
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 text-sm">
                {rows.map((user) => (
                  <tr
                    key={user.id}
                    className={`transition-colors hover:bg-gray-50 ${user.is_banned ? 'bg-red-50 hover:bg-red-50' : ''}`}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="space-y-1">
                        <div className="font-medium text-gray-900 leading-tight break-words">
                          {user.full_name || 'No name provided'}
                        </div>
                        <div className="text-xs text-gray-500 break-all">
                          {user.email || 'No email'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="relative inline-block w-full max-w-[180px]">
                        <select
                          value={user.role}
                          onChange={(e) => updateRole(user.id, e.target.value)}
                          disabled={actionLoadingId === user.id || user.id === profile?.id}
                          className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-1 pr-8 text-sm focus:border-[#4E4B43] focus:outline-none focus:ring-1 focus:ring-[#4E4B43] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="tenant">Tenant</option>
                          <option value="landlord">Landlord</option>
                          <option value="agent">Agent</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      </div>
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 align-top text-sm text-gray-900">
                      {user.agency || '–'}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <AccessToggle
                        checked={Boolean(user.can_manage_agency)}
                        busy={updatingAgencyAccessId === user.id}
                        label="Toggle agency access"
                        onToggle={() => toggleAgencyAccess(user)}
                      />
                    </td>
                    <td className={`px-4 py-3 align-top ${!salesFeatureEnabled ? 'opacity-50' : ''}`}>
                      <AccessToggle
                        checked={Boolean(user.can_post_sales)}
                        busy={updatingSalesAccessId === user.id}
                        label="Toggle sales access"
                        onToggle={() => toggleSalesAccess(user)}
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <AccessToggle
                        checked={Boolean(user.free_posting_agent)}
                        busy={updatingFreeAgentId === user.id}
                        label="Toggle free posting (agent)"
                        onToggle={() => toggleFreeAgent(user)}
                      />
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        <StatusPill tone={user.is_admin ? 'red' : 'green'}>
                          {user.is_admin ? 'Admin' : 'User'}
                        </StatusPill>
                        <StatusPill tone={user.is_banned ? 'red' : 'green'}>
                          {user.is_banned ? 'Banned' : 'Active'}
                        </StatusPill>
                      </div>
                    </td>
                    <td className="hidden xl:table-cell px-4 py-3 align-top text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="hidden xl:table-cell px-4 py-3 align-top text-sm text-gray-900">
                      {formatPhoneForDisplay(user.phone) || 'No phone'}
                    </td>
                    <td className="px-4 py-3 align-top text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        {!user.is_admin && (
                          <button
                            onClick={() => handleSignInAsUser(user)}
                            disabled={impersonatingUserId === user.id || signingInAsUser}
                            className="p-1.5 rounded-lg text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Sign In As User"
                          >
                            {impersonatingUserId === user.id ? (
                              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <UserCheck className="h-4 w-4" />
                            )}
                          </button>
                        )}
                        {user.id !== profile?.id && (
                          <button
                            onClick={() => setDeleteTarget(user)}
                            disabled={actionLoadingId === user.id}
                            className="p-1.5 rounded-lg text-red-600 transition-colors hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Delete User"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
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
            noun="users"
          />
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) removeUser(deleteTarget.id);
          setDeleteTarget(null);
        }}
        title="Delete user permanently?"
        message={`${deleteTarget?.full_name || 'This user'} will be permanently deleted, along with all their listings. This action cannot be undone.`}
        confirmText="Delete User"
        severity="danger"
      />
    </div>
  );
}
