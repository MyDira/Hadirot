// Resolves which monetization branch a residential-rental poster falls into:
//   - subscription  → user has Agent/VIP with capacity. Posts free under the plan.
//   - trial_eligible → phone is fresh; offer 14-day trial or pay-at-posting bonus.
//   - must_pay      → phone has recent activity; require $25 to post.
//   - loading / error during async checks.
//
// Phone input is the form's contact_phone (raw user input). We normalize to E.164
// before checking. If the phone is too short to evaluate, we treat it as
// "trial_eligible" optimistically — the wizard's Submit button is disabled anyway
// until a valid phone is entered.

import { useEffect, useState } from 'react';
import { subscriptionsService } from '../services/subscriptions';
import { paymentsService } from '../services/payments';
import type { ListingSubscription } from '../types/monetization';

export type MonetizationGateMode =
  | 'loading'
  | 'subscription'
  | 'subscription_at_cap'
  | 'trial_eligible'
  | 'must_pay'
  | 'admin'
  | 'error';

export interface MonetizationGateState {
  mode: MonetizationGateMode;
  subscription: ListingSubscription | null;
  subscriptionListingsUsed: number;
  errorMessage: string | null;
}

/** Convert user-entered phone to E.164. Returns null if too short to evaluate. */
function phoneToE164(raw: string): string | null {
  const digits = (raw || '').replace(/\D+/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export function useMonetizationGate(opts: {
  contactPhone: string;
  isAdmin: boolean;
  enabled: boolean;
}): MonetizationGateState {
  const [state, setState] = useState<MonetizationGateState>({
    mode: 'loading',
    subscription: null,
    subscriptionListingsUsed: 0,
    errorMessage: null,
  });

  // Subscription check fires once on mount (or admin flag change).
  useEffect(() => {
    if (!opts.enabled) return;

    if (opts.isAdmin) {
      setState({
        mode: 'admin',
        subscription: null,
        subscriptionListingsUsed: 0,
        errorMessage: null,
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const coverage = await subscriptionsService.canPostUnderSubscription();
        if (cancelled) return;
        if (coverage) {
          setState((prev) => ({
            ...prev,
            mode: coverage.canPost ? 'subscription' : 'subscription_at_cap',
            subscription: coverage.sub,
            subscriptionListingsUsed: coverage.used,
            errorMessage: null,
          }));
        } else {
          // No subscription — drop through to phone-based check (handled below).
          setState((prev) => ({
            ...prev,
            mode: 'loading',
            subscription: null,
            subscriptionListingsUsed: 0,
          }));
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          mode: 'error',
          subscription: null,
          subscriptionListingsUsed: 0,
          errorMessage: (err as Error).message || 'Failed to check subscription',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [opts.enabled, opts.isAdmin]);

  // Phone-based check fires when phone changes (debounced) IF user is not
  // covered by a subscription.
  useEffect(() => {
    if (!opts.enabled || opts.isAdmin) return;
    if (state.subscription) return; // already covered

    const normalized = phoneToE164(opts.contactPhone);
    if (!normalized) {
      // Too short — optimistic until they finish typing.
      setState((prev) => ({
        ...prev,
        mode: prev.subscription ? prev.mode : 'trial_eligible',
        errorMessage: null,
      }));
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const eligible = await paymentsService.isPhoneTrialEligible(normalized);
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          mode: eligible ? 'trial_eligible' : 'must_pay',
          errorMessage: null,
        }));
      } catch (err) {
        if (cancelled) return;
        setState({
          mode: 'error',
          subscription: null,
          subscriptionListingsUsed: 0,
          errorMessage: (err as Error).message || 'Failed to check trial eligibility',
        });
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [opts.contactPhone, opts.enabled, opts.isAdmin, state.subscription]);

  return state;
}
