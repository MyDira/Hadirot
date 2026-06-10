// QuickPayDaysModal — a small, single-listing payment modal.
//
// Opened from a specific listing row's green "Pay"/"Renew" action (or the
// status pill). Because the listing is already known from the row, there's no
// listing picker and no Subscribe tab — the user just chooses how many days to
// add and continues to Stripe Checkout. This is the lightweight counterpart to
// the full MonetizationModal, which stays for the generic "pay or subscribe"
// entry point.

import { useEffect, useState } from 'react';
import { X, CreditCard, Calendar } from 'lucide-react';
import { paymentsService } from '../../services/payments';
import { INDIVIDUAL_LISTING_PACKAGES, formatCents } from '../../types/monetization';

export interface QuickPayDaysModalProps {
  open: boolean;
  onClose: () => void;
  /** The single listing being paid for. Null hides the modal. */
  listing: { id: string; label: string } | null;
}

export function QuickPayDaysModal({ open, onClose, listing }: QuickPayDaysModalProps) {
  const [selectedDays, setSelectedDays] = useState<number>(30);
  const [priorPaymentCount, setPriorPaymentCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedDays(30);
    setErr(null);
    setBusy(false);
  }, [open, listing?.id]);

  // First payment vs renewal pricing depends on prior paid history.
  useEffect(() => {
    if (!open || !listing?.id) {
      setPriorPaymentCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const count = await paymentsService.getPriorPaymentCount(listing.id);
        if (!cancelled) setPriorPaymentCount(count);
      } catch {
        if (!cancelled) setPriorPaymentCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, listing?.id]);

  if (!open || !listing) return null;

  const isFirstPayment = priorPaymentCount === 0;
  const selectedPkg = INDIVIDUAL_LISTING_PACKAGES.find((p) => p.days === selectedDays);
  const priceCents = selectedPkg
    ? isFirstPayment
      ? selectedPkg.firstTimeCents
      : selectedPkg.renewalCents
    : 0;

  const handlePay = async () => {
    setBusy(true);
    setErr(null);
    try {
      const checkout = await paymentsService.createCheckoutSession({
        listingId: listing.id,
        days: selectedDays,
        isInitialPurchase: false, // dashboard payments never qualify for the at-posting bonus
      });
      window.location.href = checkout.url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-4 sm:p-6">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Add days to this listing</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{listing.label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 -m-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 overflow-y-auto flex-1 space-y-5">
          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {err}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              <Calendar className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              How many days?
              {priorPaymentCount !== null && (
                <span className="ml-2 normal-case text-gray-400 font-normal">
                  {isFirstPayment
                    ? '(first payment — $25 for 30 days)'
                    : '(renewal pricing — $15/30 days)'}
                </span>
              )}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {INDIVIDUAL_LISTING_PACKAGES.map((pkg) => {
                const cents = isFirstPayment ? pkg.firstTimeCents : pkg.renewalCents;
                const selected = pkg.days === selectedDays;
                return (
                  <button
                    key={pkg.days}
                    type="button"
                    onClick={() => setSelectedDays(pkg.days)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      selected
                        ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900">{pkg.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{pkg.days}d · {formatCents(cents)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Total */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">Total today</div>
            <div className="text-xl font-bold text-gray-900">{formatCents(priceCents)}</div>
          </div>

          <button
            type="button"
            onClick={handlePay}
            disabled={busy}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                Continue to checkout
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
