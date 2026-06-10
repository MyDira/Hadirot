// Admin "charge this listing via Stripe (on behalf of the owner)" modal.
//
// Use case: a user calls in and reads their card number over the phone. The
// admin picks a day-package, opens the real Stripe Checkout in a new tab, and
// types the caller's card. The charge / receipt attach to the LISTING OWNER's
// Stripe customer (the edge function resolves the customer from the owner, not
// the admin) and the webhook grants days to the owner's listing exactly as a
// self-serve payment would.
//
// Distinct from GrantDaysModal, which adds free days with no Stripe charge.

import { useEffect, useState } from 'react';
import { CreditCard, ExternalLink } from 'lucide-react';
import { paymentsService } from '../../services/payments';
import { INDIVIDUAL_LISTING_PACKAGES, formatCents } from '../../types/monetization';

export interface ChargeListingModalProps {
  open: boolean;
  onClose: () => void;
  listingId: string | null;
  /** Optional human-readable label for the listing (shown in the header). */
  listingLabel?: string | null;
}

export function ChargeListingModal({
  open,
  onClose,
  listingId,
  listingLabel,
}: ChargeListingModalProps) {
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [priorPaymentCount, setPriorPaymentCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setDays(30);
      setErr(null);
      setBusy(false);
      setCheckoutUrl(null);
      setPriorPaymentCount(null);
    }
  }, [open]);

  // First-time vs renewal pricing depends on prior payments for this listing.
  useEffect(() => {
    if (!open || !listingId) return;
    let cancelled = false;
    (async () => {
      try {
        const count = await paymentsService.getPriorPaymentCount(listingId);
        if (!cancelled) setPriorPaymentCount(count);
      } catch {
        if (!cancelled) setPriorPaymentCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, listingId]);

  if (!open || !listingId) return null;

  const isFirstPayment = priorPaymentCount === 0;
  const selectedPkg = INDIVIDUAL_LISTING_PACKAGES.find((p) => p.days === days);
  const priceCents = selectedPkg
    ? isFirstPayment
      ? selectedPkg.firstTimeCents
      : selectedPkg.renewalCents
    : 0;

  const handleCreateCheckout = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await paymentsService.createCheckoutSession({
        listingId,
        days,
        isInitialPurchase: false, // admin charges never qualify for the at-posting bonus
      });
      setCheckoutUrl(res.url);
      // Open the Stripe Checkout immediately so the admin can key the card.
      window.open(res.url, '_blank', 'noopener');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Charge via Stripe</h3>
        <p className="text-sm text-gray-500 mb-1">
          Opens a real Stripe Checkout scoped to the listing owner. Enter the card the
          caller gave you. Days are granted to the owner's listing when payment completes.
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

        {checkoutUrl ? (
          <div className="space-y-3">
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
              Stripe Checkout opened in a new tab. If a pop-up blocker stopped it, use the
              link below.
            </div>
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-accent-600 hover:text-accent-700"
            >
              <ExternalLink className="w-4 h-4" />
              Open Stripe Checkout
            </a>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Days
              {priorPaymentCount !== null && (
                <span className="ml-2 normal-case text-gray-400 font-normal">
                  {isFirstPayment ? '(first payment pricing)' : '(renewal pricing)'}
                </span>
              )}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {INDIVIDUAL_LISTING_PACKAGES.map((pkg) => {
                const cents = isFirstPayment ? pkg.firstTimeCents : pkg.renewalCents;
                const selected = pkg.days === days;
                return (
                  <button
                    key={pkg.days}
                    type="button"
                    onClick={() => setDays(pkg.days)}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      selected
                        ? 'border-accent-500 bg-accent-50/40 ring-1 ring-accent-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900">{pkg.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{formatCents(cents)}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm text-gray-600">Amount to charge</span>
              <span className="text-lg font-bold text-gray-900">{formatCents(priceCents)}</span>
            </div>

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
                onClick={handleCreateCheckout}
                disabled={busy}
                className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
              >
                {busy ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                Open Stripe Checkout
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
