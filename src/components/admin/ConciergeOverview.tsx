import React from 'react';
import { Users, FileText, DollarSign } from 'lucide-react';
import type { ConciergeSubscription, ConciergeSubmission } from '../../config/supabase';

interface ConciergeOverviewProps {
  subscriptions: ConciergeSubscription[];
  submissions: ConciergeSubmission[];
}

export function ConciergeOverview({ subscriptions, submissions }: ConciergeOverviewProps) {
  const activeSubs = subscriptions.filter(s => s.status === 'active');
  const tier1Count = activeSubs.filter(s => s.tier === 'tier1_quick').length;
  const tier2Count = activeSubs.filter(s => s.tier === 'tier2_forward').length;
  const tier3Count = activeSubs.filter(s => s.tier === 'tier3_vip').length;

  const paidSubmissions = submissions.filter(s => s.status === 'paid' || s.status === 'processing');
  const monthlyRevenue = tier2Count * 125 + tier3Count * 200;

  const stats = [
    { label: 'Tier 2 Subscribers', value: tier2Count, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Tier 3 VIP', value: tier3Count, icon: Users, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Pending Submissions', value: paidSubmissions.length, icon: FileText, color: 'text-amber-600 bg-amber-50' },
    { label: 'Est. Monthly Revenue', value: `$${monthlyRevenue.toLocaleString()}`, icon: DollarSign, color: 'text-green-600 bg-green-50' },
  ];

  const recentSubmissions = submissions.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${stat.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xl font-bold text-gray-900">{stat.value}</div>
                  <div className="text-xs text-gray-500">{stat.label}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Recent Submissions</h3>
        </div>
        {recentSubmissions.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500 text-sm">No submissions yet</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentSubmissions.map((sub) => (
              <div key={sub.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {(sub.user as any)?.full_name || 'Unknown'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 line-clamp-1 max-w-md">
                    {sub.blurb}
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  sub.status === 'paid' ? 'bg-amber-50 text-amber-700' :
                  sub.status === 'processing' ? 'bg-blue-50 text-blue-700' :
                  sub.status === 'posted' ? 'bg-emerald-50 text-emerald-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {sub.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
