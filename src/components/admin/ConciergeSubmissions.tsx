import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { conciergeService } from '../../services/concierge';
import type { ConciergeSubmission } from '../../config/supabase';

interface ConciergeSubmissionsProps {
  submissions: ConciergeSubmission[];
  onRefresh: () => void;
}

const STATUS_OPTIONS = ['pending', 'paid', 'processing', 'posted', 'rejected'] as const;

export function ConciergeSubmissions({ submissions, onRefresh }: ConciergeSubmissionsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [listingIdInput, setListingIdInput] = useState('');

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      await conciergeService.updateSubmissionStatus(id, newStatus);
      onRefresh();
    } catch { /* silent */ }
    setUpdatingId(null);
  };

  const handleLinkListing = async (id: string) => {
    if (!listingIdInput.trim()) return;
    setUpdatingId(id);
    try {
      await conciergeService.updateSubmissionStatus(id, 'posted', undefined, listingIdInput.trim());
      setLinkingId(null);
      setListingIdInput('');
      onRefresh();
    } catch { /* silent */ }
    setUpdatingId(null);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-5 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Tier 1 Submissions ({submissions.length})</h3>
      </div>

      {submissions.length === 0 ? (
        <div className="px-5 py-8 text-center text-gray-500 text-sm">No submissions yet</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {submissions.map((sub) => {
            const isExpanded = expandedId === sub.id;
            const userName = (sub.user as any)?.full_name || 'Unknown';
            const userEmail = (sub.user as any)?.email || '';
            const userPhone = (sub.user as any)?.phone || '';

            return (
              <div key={sub.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4 text-left">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <div>
                      <div className="text-sm font-medium text-gray-900">{userName}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(sub.created_at).toLocaleDateString()} &middot; {userEmail}
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    sub.status === 'paid' ? 'bg-amber-50 text-amber-700' :
                    sub.status === 'processing' ? 'bg-blue-50 text-blue-700' :
                    sub.status === 'posted' ? 'bg-emerald-50 text-emerald-700' :
                    sub.status === 'rejected' ? 'bg-red-50 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {sub.status}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-4 pl-12 space-y-3">
                    <div className="bg-gray-50 rounded-lg p-4 text-sm whitespace-pre-wrap text-gray-700">
                      {sub.blurb}
                    </div>

                    {userPhone && (
                      <div className="text-xs text-gray-500">Phone: {userPhone}</div>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="text-xs text-gray-500">Status:</label>
                      <select
                        value={sub.status}
                        onChange={(e) => handleStatusChange(sub.id, e.target.value)}
                        disabled={updatingId === sub.id}
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-[#1E4A74] focus:border-[#1E4A74] outline-none"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>

                      {!sub.listing_id && (
                        <>
                          {linkingId === sub.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Listing ID"
                                value={listingIdInput}
                                onChange={(e) => setListingIdInput(e.target.value)}
                                className="text-xs border border-gray-300 rounded px-2 py-1 w-48 focus:ring-1 focus:ring-[#1E4A74] focus:border-[#1E4A74] outline-none"
                              />
                              <button
                                onClick={() => handleLinkListing(sub.id)}
                                disabled={updatingId === sub.id}
                                className="text-xs bg-[#1E4A74] text-white px-2 py-1 rounded hover:bg-[#163a5e]"
                              >
                                Link
                              </button>
                              <button
                                onClick={() => { setLinkingId(null); setListingIdInput(''); }}
                                className="text-xs text-gray-500 hover:text-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setLinkingId(sub.id)}
                              className="text-xs text-[#1E4A74] hover:underline"
                            >
                              Link to listing
                            </button>
                          )}
                        </>
                      )}

                      {sub.listing_id && (
                        <span className="text-xs text-emerald-600">
                          Linked: {sub.listing_id.slice(0, 8)}...
                        </span>
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
  );
}
