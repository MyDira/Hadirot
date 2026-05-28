// Shared admin "grant N paid days to a listing" modal.
// Used from /admin (main listings table) and /admin/subscriptions (paid tab).

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { paymentsService } from '../../services/payments';

export interface GrantDaysModalProps {
  open: boolean;
  onClose: () => void;
  onGranted: () => void;
  listingId: string | null;
  /** Optional human-readable label for the listing (shown in the modal header). */
  listingLabel?: string | null;
  adminId: string;
}

export function GrantDaysModal({
  open,
  onClose,
  onGranted,
  listingId,
  listingLabel,
  adminId,
}: GrantDaysModalProps) {
  const [days, setDays] = useState(30);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDays(30);
      setNotes('');
      setErr(null);
      setBusy(false);
    }
  }, [open]);

  if (!open || !listingId) return null;

  const handleGrant = async () => {
    setBusy(true);
    setErr(null);
    try {
      await paymentsService.adminGrantDays({
        listingId,
        days,
        adminId,
        notes: notes.trim() || undefined,
      });
      onGranted();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Grant paid days</h3>
        <p className="text-sm text-gray-500 mb-1">
          Adds days to this listing's paid balance. Recorded as an admin grant (no Stripe).
        </p>
        {listingLabel && (
          <p className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1 mt-1 mb-3 truncate">
            {listingLabel}
          </p>
        )}
        {err && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {err}
          </div>
        )}
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Days
        </label>
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(Math.max(1, Math.min(365, parseInt(e.target.value || '30', 10))))}
          className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-accent-500 focus:border-accent-500"
        />
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Why is this admin grant being made?"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-accent-500 focus:border-accent-500"
        />
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGrant}
            disabled={busy}
            className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Grant
          </button>
        </div>
      </div>
    </div>
  );
}
