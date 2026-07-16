// One friendly, reassuring status line for a residential-rental listing.
// Shared by the dashboard cards and the listing-detail owner/admin banner so
// both surfaces describe a listing's state identically.
//
// Avoids scary money language ("Permanently inactive", "Pay") in favor of
// plain, calm copy.
//
// Free agents (agent-free posting) never pay, so their approved+active
// listings always read as a plain "Live" — the trial / paid / "keep it active"
// wording is suppressed regardless of the stored payment_kind.

import type { ListingPaymentState } from '../types/monetization';

export type StatusTone = 'good' | 'warn' | 'muted';

export interface ListingStatusLine {
  dot: string;
  text: string;
  tone: StatusTone;
}

export function getRentalStatusLine(
  listing: { approved?: boolean | null; is_active?: boolean | null },
  payState: ListingPaymentState | null,
  daysUntilExpiration: number | null,
  isFreeAgent = false,
): ListingStatusLine {
  if (!listing.approved) {
    return { dot: 'bg-amber-400', text: "In review — we'll publish it soon", tone: 'warn' };
  }
  if (!listing.is_active) {
    return { dot: 'bg-gray-400', text: 'Paused — not visible to renters', tone: 'muted' };
  }
  // Free-posting agents don't pay: an approved, live listing is simply "Live".
  // Skip all trial / paid / renewal money copy for them.
  if (isFreeAgent) {
    return { dot: 'bg-emerald-500', text: 'Live', tone: 'good' };
  }
  if (payState) {
    switch (payState.label) {
      case 'paid_expired':
        return { dot: 'bg-amber-400', text: 'Time’s up — add days to keep it live', tone: 'warn' };
      case 'paid_renewal_due':
        return { dot: 'bg-amber-400', text: 'Renewal coming up soon', tone: 'warn' };
      case 'trial_ending':
        return { dot: 'bg-amber-400', text: `Free trial ending${payState.trialDaysRemaining != null ? ` · ${payState.trialDaysRemaining}d left` : ''}`, tone: 'warn' };
      case 'trial_active':
        return { dot: 'bg-emerald-500', text: `Live · free trial${payState.trialDaysRemaining != null ? ` · ${payState.trialDaysRemaining}d left` : ''}`, tone: 'good' };
      case 'paid_active':
        return { dot: 'bg-emerald-500', text: `Live${payState.paidDaysRemaining != null ? ` · ${payState.paidDaysRemaining} days left` : ''}`, tone: 'good' };
      case 'subscription_active':
        return { dot: 'bg-emerald-500', text: 'Live · covered by your plan', tone: 'good' };
      case 'admin_granted':
        return { dot: 'bg-emerald-500', text: 'Live · complimentary', tone: 'good' };
      case 'payment_required':
        return { dot: 'bg-amber-400', text: 'Finish payment to publish', tone: 'warn' };
      case 'legacy_free':
        return { dot: 'bg-emerald-500', text: 'Live', tone: 'good' };
    }
  }
  if (daysUntilExpiration != null) {
    if (daysUntilExpiration <= 0) {
      return { dot: 'bg-amber-400', text: 'Expired — extend to keep it live', tone: 'warn' };
    }
    return { dot: 'bg-emerald-500', text: `Live · ${daysUntilExpiration} day${daysUntilExpiration === 1 ? '' : 's'} left`, tone: 'good' };
  }
  return { dot: 'bg-emerald-500', text: 'Live', tone: 'good' };
}
