// Per-listing payment-status pill shown in the dashboard's Status column.
// Click to expand inline action (Renew / Pay / Reactivate). Color and copy vary
// by derived ListingPaymentState label.
//
// Visual style mirrors the existing dashboard status pills:
//   px-2 py-1 text-xs rounded-full bg-{color}-100 text-{color}-800
// with lucide icons inline.

import { useState } from 'react';
import {
  Sparkles,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Crown,
  ShieldCheck,
  Lock,
  RefreshCw,
  CreditCard,
  RotateCcw,
} from 'lucide-react';
import { paymentsService } from '../../services/payments';
import type { ListingPaymentState, ListingSubscription } from '../../types/monetization';
import type { MonetizationListingFields } from '../../services/payments';

interface PaidListingStatusCardProps {
  listing: MonetizationListingFields;
  subscription: ListingSubscription | null;
  isAdmin: boolean;
  onAfterRenew?: () => void;
  onOpenPayModal?: (listingId: string) => void;
}

interface PillStyle {
  bg: string;
  text: string;
  border: string;
  iconColor: string;
}

const STYLES: Record<string, PillStyle> = {
  green:  { bg: 'bg-emerald-50',  text: 'text-emerald-800',  border: 'border-emerald-200',  iconColor: 'text-emerald-700' },
  amber:  { bg: 'bg-amber-50',    text: 'text-amber-800',    border: 'border-amber-200',    iconColor: 'text-amber-700' },
  red:    { bg: 'bg-red-50',      text: 'text-red-800',      border: 'border-red-200',      iconColor: 'text-red-700' },
  blue:   { bg: 'bg-blue-50',     text: 'text-blue-800',     border: 'border-blue-200',     iconColor: 'text-blue-700' },
  purple: { bg: 'bg-purple-50',   text: 'text-purple-800',   border: 'border-purple-200',   iconColor: 'text-purple-700' },
  gray:   { bg: 'bg-gray-100',    text: 'text-gray-700',     border: 'border-gray-200',     iconColor: 'text-gray-600' },
};

function styleFor(state: ListingPaymentState): PillStyle {
  switch (state.label) {
    case 'trial_active': return STYLES.blue;
    case 'trial_ending': return STYLES.amber;
    case 'paid_active': return STYLES.green;
    case 'paid_renewal_due': return STYLES.amber;
    case 'paid_expired': return STYLES.red;
    case 'subscription_active': return STYLES.purple;
    case 'admin_granted': return STYLES.gray;
    case 'legacy_free': return STYLES.gray;
    case 'deactivated_reactivatable': return STYLES.red;
    case 'deactivated_permanent': return STYLES.gray;
    default: return STYLES.gray;
  }
}

function labelText(state: ListingPaymentState): string {
  switch (state.label) {
    case 'trial_active':
      return state.trialDaysRemaining !== null
        ? `Free trial · ${state.trialDaysRemaining}d left`
        : 'Free trial';
    case 'trial_ending':
      return state.trialDaysRemaining !== null && state.trialDaysRemaining > 0
        ? `Trial ends in ${state.trialDaysRemaining}d`
        : 'Trial ends today';
    case 'paid_active':
      return state.paidDaysRemaining !== null
        ? `Paid · ${state.paidDaysRemaining}d left`
        : 'Paid';
    case 'paid_renewal_due':
      return state.freshnessDaysRemaining !== null && state.freshnessDaysRemaining > 0
        ? `Renews in ${state.freshnessDaysRemaining}d`
        : 'Renew today';
    case 'paid_expired':
      return 'Paid balance ended';
    case 'subscription_active':
      return 'Covered by subscription';
    case 'admin_granted':
      return 'Admin granted';
    case 'legacy_free':
      return 'Free listing';
    case 'deactivated_reactivatable':
      return 'Expired · reactivate';
    case 'deactivated_permanent':
      return 'Permanently inactive';
    default:
      return 'Unknown';
  }
}

function Icon({ state, className }: { state: ListingPaymentState; className?: string }) {
  const c = className || 'w-3.5 h-3.5';
  switch (state.label) {
    case 'trial_active': return <Sparkles className={c} />;
    case 'trial_ending': return <Clock className={c} />;
    case 'paid_active': return <CheckCircle2 className={c} />;
    case 'paid_renewal_due': return <RefreshCw className={c} />;
    case 'paid_expired': return <AlertTriangle className={c} />;
    case 'subscription_active':
      return state.paymentKind === 'subscription' ? <Crown className={c} /> : <ShieldCheck className={c} />;
    case 'admin_granted': return <Lock className={c} />;
    case 'legacy_free': return <CheckCircle2 className={c} />;
    case 'deactivated_reactivatable': return <RotateCcw className={c} />;
    case 'deactivated_permanent': return <AlertTriangle className={c} />;
    default: return <Clock className={c} />;
  }
}

export function PaidListingStatusCard({
  listing,
  subscription,
  isAdmin,
  onAfterRenew,
  onOpenPayModal,
}: PaidListingStatusCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Derive state from listing row.
  const state = paymentsService.derivePaymentState(listing, {
    hasActiveSubscription: subscription !== null,
    isAdmin,
  });

  const style = styleFor(state);
  const text = labelText(state);
  const hasAction = state.nextActionLabel !== null;

  const handleRenew = async () => {
    setBusy(true);
    setErr(null);
    try {
      await paymentsService.extendListing(listing.id);
      onAfterRenew?.();
      setExpanded(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handlePay = () => {
    setExpanded(false);
    onOpenPayModal?.(listing.id);
  };

  // Compact pill (collapsed state).
  const pill = (
    <button
      type="button"
      onClick={() => hasAction && setExpanded((v) => !v)}
      disabled={!hasAction}
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border whitespace-nowrap transition-colors ${style.bg} ${style.text} ${style.border} ${
        hasAction ? 'hover:opacity-90 cursor-pointer' : 'cursor-default'
      }`}
      title={hasAction ? state.nextActionLabel || undefined : undefined}
    >
      <Icon state={state} className={`w-3 h-3 ${style.iconColor}`} />
      <span>{text}</span>
    </button>
  );

  if (!expanded) return pill;

  // Expanded panel — appears below the pill in the same cell.
  const isFreeRenewable =
    state.label === 'paid_renewal_due' && (state.paidDaysRemaining ?? 0) > 0;

  return (
    <div className="space-y-2">
      {pill}
      <div className={`rounded-lg border ${style.border} ${style.bg} p-3 text-xs ${style.text}`}>
        <div className="font-medium mb-2">{state.nextActionLabel}</div>
        {err && (
          <div className="mb-2 text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            {err}
          </div>
        )}
        <div className="flex items-center gap-2">
          {isFreeRenewable ? (
            <button
              type="button"
              onClick={handleRenew}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white border border-current rounded hover:opacity-80 disabled:opacity-50"
            >
              {busy ? (
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Renew now
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePay}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white border border-current rounded hover:opacity-80"
            >
              <CreditCard className="w-3 h-3" />
              {state.label === 'deactivated_reactivatable' ? 'Reactivate' : 'Pay'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs underline hover:no-underline opacity-70"
          >
            Hide
          </button>
        </div>
      </div>
    </div>
  );
}
