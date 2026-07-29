import React, { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, MessageSquare, X } from 'lucide-react';
import type { ScrapedListing } from '@/config/supabase';
import {
  buildOutreachPreview,
  isOutreachEligible,
  type OutreachSendSummary,
} from '@/services/aiIntake';

interface IntakeOutreachModalProps {
  /** Leads the admin selected — eligibility is split for display here. */
  listings: ScrapedListing[];
  onClose: () => void;
  onConfirm: (eligibleIds: string[]) => Promise<OutreachSendSummary>;
  /** Fired after a send so the parent can reload the table. */
  onSent: (summary: OutreachSendSummary) => void;
}

/**
 * Confirmation gate for the landlord posting offer. Texting real people is
 * irreversible, so the admin sees exactly who gets a message and the exact
 * words before anything sends.
 */
export function IntakeOutreachModal({
  listings,
  onClose,
  onConfirm,
  onSent,
}: IntakeOutreachModalProps) {
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<OutreachSendSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { eligible, blocked } = useMemo(() => {
    const eligible: ScrapedListing[] = [];
    const blocked: Array<{ listing: ScrapedListing; reason: string }> = [];
    for (const l of listings) {
      const check = isOutreachEligible(l);
      if (check.ok) eligible.push(l);
      else blocked.push({ listing: l, reason: check.reason ?? 'Not eligible' });
    }
    return { eligible, blocked };
  }, [listings]);

  const preview = eligible.length > 0 ? buildOutreachPreview(eligible[0]) : null;

  const handleSend = async () => {
    if (eligible.length === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await onConfirm(eligible.map((l) => l.id));
      setSummary(result);
      onSent(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={sending ? undefined : onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#4E4B43]" />
            {summary ? 'Offers sent' : 'Send posting offer by SMS'}
          </h3>
          <button
            onClick={onClose}
            disabled={sending}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {summary ? (
            <>
              <p className="text-sm text-gray-700">
                Texted <strong>{summary.sent}</strong> landlord{summary.sent === 1 ? '' : 's'}.
                {summary.skipped > 0 && ` ${summary.skipped} skipped.`}
                {summary.errors > 0 && ` ${summary.errors} failed.`}
              </p>
              <div className="space-y-1.5">
                {summary.results.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 text-xs">
                    <span
                      className={`mt-0.5 px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                        r.status === 'sent'
                          ? 'bg-green-100 text-green-700'
                          : r.status === 'skipped'
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {r.status}
                    </span>
                    <span className="min-w-0">
                      <span className="text-gray-800">{r.title || 'Untitled'}</span>
                      {r.reason && <span className="text-gray-500"> — {r.reason}</span>}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Replies show up under <strong>Messages</strong>. A landlord replying YES gets
                published automatically with the 2-week free posting.
              </p>
            </>
          ) : (
            <>
              {eligible.length > 0 ? (
                <>
                  <div>
                    <p className="text-sm font-medium text-gray-800 mb-1.5">
                      Texting {eligible.length} landlord{eligible.length === 1 ? '' : 's'}:
                    </p>
                    <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
                      {eligible.map((l) => (
                        <div key={l.id} className="px-3 py-2 text-xs flex justify-between gap-2">
                          <span className="text-gray-800 truncate">{l.title || 'Untitled'}</span>
                          <span className="text-gray-500 flex-shrink-0">
                            {l.contact_phone_display || l.contact_phone}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {preview && (
                    <div>
                      <p className="text-sm font-medium text-gray-800 mb-1.5">They'll receive:</p>
                      <div className="bg-gray-100 rounded-lg p-3 text-xs text-gray-800 whitespace-pre-wrap">
                        {preview}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        Each message names that lead's own apartment and cross streets.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-600">
                  None of the selected leads can be texted right now.
                </p>
              )}

              {blocked.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-900 flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Skipping {blocked.length} lead{blocked.length === 1 ? '' : 's'}
                  </p>
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {blocked.map(({ listing, reason }) => (
                      <p key={listing.id} className="text-[11px] text-amber-800">
                        {listing.title || 'Untitled'} — {reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2.5">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex-shrink-0 px-5 py-3.5 border-t border-gray-200 flex justify-end gap-2">
          {summary ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white bg-[#4E4B43] rounded-md hover:bg-[#3a3833] transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={sending}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || eligible.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#4E4B43] rounded-md hover:bg-[#3a3833] disabled:opacity-50 transition-colors"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4" />
                    Send {eligible.length > 0 ? eligible.length : ''} offer
                    {eligible.length === 1 ? '' : 's'}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
