import React, { useState } from 'react';
import { CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { conciergeService } from '../../services/concierge';
import type { ConciergeSubscription } from '../../config/supabase';

interface ConciergeVIPTrackingProps {
  subscriptions: ConciergeSubscription[];
  onRefresh: () => void;
}

function getCheckStatus(lastCheckedAt: string | null): { label: string; color: string; sortWeight: number } {
  if (!lastCheckedAt) return { label: 'Never checked', color: 'bg-red-100 text-red-700', sortWeight: 999 };
  const daysAgo = (Date.now() - new Date(lastCheckedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysAgo <= 3) return { label: `${Math.floor(daysAgo)}d ago`, color: 'bg-emerald-100 text-emerald-700', sortWeight: daysAgo };
  if (daysAgo <= 6) return { label: `${Math.floor(daysAgo)}d ago`, color: 'bg-amber-100 text-amber-700', sortWeight: daysAgo };
  return { label: `${Math.floor(daysAgo)}d ago`, color: 'bg-red-100 text-red-700', sortWeight: daysAgo };
}

export function ConciergeVIPTracking({ subscriptions, onRefresh }: ConciergeVIPTrackingProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const vipSubs = subscriptions
    .filter((s) => s.tier === 'tier3_vip' && s.status === 'active')
    .sort((a, b) => {
      const sa = getCheckStatus(a.last_checked_at).sortWeight;
      const sb = getCheckStatus(b.last_checked_at).sortWeight;
      return sb - sa;
    });

  const handleMarkChecked = async (id: string) => {
    setMarkingId(id);
    try {
      await conciergeService.markVIPChecked(id);
      onRefresh();
    } catch { /* silent */ }
    setMarkingId(null);
  };

  const handleSaveNotes = async (id: string) => {
    setSavingNotes(true);
    try {
      await conciergeService.updateSubscriptionNotes(id, notesInput);
      setEditingNotesId(null);
      onRefresh();
    } catch { /* silent */ }
    setSavingNotes(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {vipSubs.length} active VIP subscriber{vipSubs.length !== 1 ? 's' : ''} &middot; Sorted by most overdue first
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        {vipSubs.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500 text-sm">No active VIP subscribers</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {vipSubs.map((sub) => {
              const isExpanded = expandedId === sub.id;
              const userName = (sub.user as any)?.full_name || 'Unknown';
              const status = getCheckStatus(sub.last_checked_at);
              const rawSources = (sub.sources || []) as ({ name: string; link?: string } | string)[];
              const sources = rawSources.map((s) => typeof s === 'string' ? { name: s, link: '' } : s);

              return (
                <div key={sub.id}>
                  <div className="px-5 py-3 flex items-center justify-between">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                      className="flex items-center gap-3 text-left flex-1 min-w-0"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">{userName}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {sources.length} source{sources.length !== 1 ? 's' : ''} &middot; Since {new Date(sub.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>
                        {status.label}
                      </span>
                      <button
                        onClick={() => handleMarkChecked(sub.id)}
                        disabled={markingId === sub.id}
                        className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md hover:bg-emerald-100 transition-colors disabled:opacity-50"
                      >
                        {markingId === sub.id ? (
                          <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <CheckCircle className="w-3 h-3" />
                        )}
                        Mark Checked
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-5 pb-4 pl-12 space-y-3">
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-1">Sources:</div>
                        <ul className="space-y-1">
                          {sources.map((source, i) => (
                            <li key={i} className="text-sm text-gray-700 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                              <span>{source.name}</span>
                              {source.link && (
                                <a href={source.link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1E4A74] hover:underline truncate max-w-[200px]">
                                  {source.link}
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-1">Notes:</div>
                        {editingNotesId === sub.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={notesInput}
                              onChange={(e) => setNotesInput(e.target.value)}
                              rows={3}
                              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-[#1E4A74] focus:border-[#1E4A74] outline-none resize-y"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveNotes(sub.id)}
                                disabled={savingNotes}
                                className="text-xs bg-[#1E4A74] text-white px-3 py-1 rounded hover:bg-[#163a5e] disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingNotesId(null)}
                                className="text-xs text-gray-500 hover:text-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <p className="text-sm text-gray-600 flex-1">
                              {sub.admin_notes || <span className="italic text-gray-400">No notes</span>}
                            </p>
                            <button
                              onClick={() => { setEditingNotesId(sub.id); setNotesInput(sub.admin_notes || ''); }}
                              className="text-xs text-[#1E4A74] hover:underline flex-shrink-0"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
