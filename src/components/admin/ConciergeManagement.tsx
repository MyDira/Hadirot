import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, FileText, Users, Eye } from 'lucide-react';
import { conciergeService } from '../../services/concierge';
import { ConciergeOverview } from './ConciergeOverview';
import { ConciergeSubmissions } from './ConciergeSubmissions';
import { ConciergeSubscribers } from './ConciergeSubscribers';
import { ConciergeVIPTracking } from './ConciergeVIPTracking';
import type { ConciergeSubscription, ConciergeSubmission } from '../../config/supabase';

type SubTab = 'overview' | 'submissions' | 'subscribers' | 'vip';

const SUB_TABS: { id: SubTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'submissions', label: 'Submissions', icon: FileText },
  { id: 'subscribers', label: 'Subscribers', icon: Users },
  { id: 'vip', label: 'VIP Tracking', icon: Eye },
];

export function ConciergeManagement() {
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [subscriptions, setSubscriptions] = useState<ConciergeSubscription[]>([]);
  const [submissions, setSubmissions] = useState<ConciergeSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [subs, subms] = await Promise.all([
        conciergeService.getAllSubscriptions(),
        conciergeService.getAllSubmissions(),
      ]);
      setSubscriptions(subs);
      setSubmissions(subms);
    } catch (err) {
      console.error('Failed to load concierge data:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4E4B43] mx-auto" />
        <p className="text-gray-600 mt-4">Loading concierge data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all flex-1 justify-center ${
              subTab === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && (
        <ConciergeOverview subscriptions={subscriptions} submissions={submissions} />
      )}
      {subTab === 'submissions' && (
        <ConciergeSubmissions submissions={submissions} onRefresh={loadData} />
      )}
      {subTab === 'subscribers' && (
        <ConciergeSubscribers subscriptions={subscriptions} />
      )}
      {subTab === 'vip' && (
        <ConciergeVIPTracking subscriptions={subscriptions} onRefresh={loadData} />
      )}
    </div>
  );
}
