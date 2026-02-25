import React, { useState } from 'react';
import type { ConciergeSubscription } from '../../config/supabase';

interface ConciergeSubscribersProps {
  subscriptions: ConciergeSubscription[];
}

export function ConciergeSubscribers({ subscriptions }: ConciergeSubscribersProps) {
  const [tierFilter, setTierFilter] = useState<string>('all');

  const filtered = subscriptions.filter((s) => {
    if (s.tier === 'tier1_quick') return false;
    if (tierFilter === 'all') return true;
    return s.tier === tierFilter;
  });

  const tierLabel = (tier: string) => {
    if (tier === 'tier2_forward') return 'Forward & Post';
    if (tier === 'tier3_vip') return 'VIP';
    return tier;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-500">Filter by tier:</label>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:ring-1 focus:ring-[#1E4A74] focus:border-[#1E4A74] outline-none"
        >
          <option value="all">All</option>
          <option value="tier2_forward">Forward & Post</option>
          <option value="tier3_vip">VIP</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-gray-600">Name</th>
              <th className="px-4 py-2.5 text-left font-medium text-gray-600">Tier</th>
              <th className="px-4 py-2.5 text-left font-medium text-gray-600 hidden md:table-cell">Details</th>
              <th className="px-4 py-2.5 text-left font-medium text-gray-600 hidden lg:table-cell">Started</th>
              <th className="px-4 py-2.5 text-left font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No subscribers found</td>
              </tr>
            ) : (
              filtered.map((sub) => {
                const userName = (sub.user as any)?.full_name || 'Unknown';
                const userEmail = (sub.user as any)?.email || '';
                return (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{userName}</div>
                      <div className="text-xs text-gray-500">{userEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        sub.tier === 'tier2_forward' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {tierLabel(sub.tier)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {sub.tier === 'tier2_forward' && sub.email_handle && (
                        <span className="text-xs text-gray-600">{sub.email_handle}@list.hadirot.com</span>
                      )}
                      {sub.tier === 'tier3_vip' && sub.sources && (
                        <span className="text-xs text-gray-600">
                          {(sub.sources as string[]).length} source{(sub.sources as string[]).length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-500">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        sub.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                        sub.status === 'past_due' ? 'bg-red-50 text-red-700' :
                        sub.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {sub.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
