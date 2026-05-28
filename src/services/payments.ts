// Individual residential-rental payments service.
// Covers: one-off Stripe Checkout, free renewal of paid listings, RPC helpers,
// payment-state derivation for UI, and admin grant operations.
//
// See supabase/migrations/2026052715*.sql for schema. The Supabase client is
// cast where it references tables not yet in src/types/database.ts (run
// `npm run db:types` to regenerate).
//
// ─────────────────────────────────────────────────────────────────────────────
// Stripe price IDs and config:
//   This client doesn't hold Stripe price IDs directly. The edge functions
//   (create-individual-listing-checkout, create-listing-subscription-checkout)
//   read price IDs from Supabase Edge Function secrets:
//     STRIPE_AGENT_PRICE_ID
//     STRIPE_VIP_PRICE_ID
//     STRIPE_ADDON_CONCIERGE_PRICE_ID
//   Individual one-off payments use ad-hoc price_data (no price ID needed) —
//   the amount is computed from INDIVIDUAL_LISTING_PACKAGES in
//   src/types/monetization.ts (mirrored in
//   supabase/functions/_shared/stripe-prices.ts).
//   See .env.example for the full list of edge-function secrets to configure.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../config/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AT_POSTING_BONUS_DAYS,
  FRESHNESS_DAYS,
  INDIVIDUAL_LISTING_PACKAGES,
  TRIAL_LENGTH_DAYS,
  REACTIVATION_GRACE_DAYS,
  getPackagePrice,
  type ListingPaymentState,
  type PaidListingPayment,
  type PaymentKind,
  type PaymentStateLabel,
} from '../types/monetization';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as SupabaseClient<any, 'public', any>;

// Minimal listing shape consumed by getListingPaymentState. UI passes whatever
// fields it already has on hand.
export interface MonetizationListingFields {
  id: string;
  user_id: string;
  listing_type: string;
  is_active: boolean | null;
  payment_kind: PaymentKind | null;
  trial_started_at: string | null;
  paid_until: string | null;
  paused_paid_days: number | null;
  expires_at: string | null;
  deactivated_at: string | null;
  created_at: string | null;
}

function daysBetween(future: string | Date, now: Date = new Date()): number {
  const futureMs = typeof future === 'string' ? new Date(future).getTime() : future.getTime();
  return Math.ceil((futureMs - now.getTime()) / 86400000);
}

export const paymentsService = {
  // -----------------------------------------------------------
  // Checkout + renewal
  // -----------------------------------------------------------

  /**
   * Start a Stripe Checkout for an individual listing payment.
   * `isInitialPurchase` should ONLY be true when called from the wizard's
   * "Pay $25 now" button at posting time — that's the gate for the 30-bonus-days
   * sweetener. Dashboard payments must pass false.
   */
  async createCheckoutSession(params: {
    listingId: string;
    days: number;
    isInitialPurchase: boolean;
  }): Promise<{
    url: string;
    session_id: string;
    amount_cents: number;
    days: number;
    is_first_payment: boolean;
  }> {
    if (!INDIVIDUAL_LISTING_PACKAGES.some((p) => p.days === params.days)) {
      throw new Error(`Invalid day package: ${params.days}`);
    }

    const { data, error } = await supabase.functions.invoke(
      'create-individual-listing-checkout',
      {
        body: {
          listing_id: params.listingId,
          days: params.days,
          is_initial_purchase: params.isInitialPurchase,
        },
      },
    );

    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as {
      url: string;
      session_id: string;
      amount_cents: number;
      days: number;
      is_first_payment: boolean;
    };
  },

  /**
   * Free renewal of an active paid (or subscription-covered) listing.
   * Extends expires_at by 30 days clamped to paid_until. No charge.
   */
  async extendListing(listingId: string): Promise<{ new_expires_at: string }> {
    const { data, error } = await supabase.functions.invoke('extend-paid-listing', {
      body: { listing_id: listingId },
    });

    if (error) throw error;
    if (data?.error) {
      // 402 needs_payment surfaces here as a friendly error.
      throw new Error(data.error);
    }
    return data as { new_expires_at: string };
  },

  // -----------------------------------------------------------
  // Helpers + RPC
  // -----------------------------------------------------------

  /** Returns true if the phone (E.164) is eligible for a fresh 14-day trial. */
  async isPhoneTrialEligible(phoneE164: string): Promise<boolean> {
    const { data, error } = await sb.rpc('is_phone_trial_eligible', {
      p_phone_e164: phoneE164,
    });
    if (error) throw error;
    return data === true;
  },

  /** Returns true if a listing's bedrooms/location/phone are locked for non-admin owner. */
  async isListingLocked(listingId: string): Promise<boolean> {
    const { data, error } = await sb.rpc('is_listing_locked', { p_listing_id: listingId });
    if (error) throw error;
    return data === true;
  },

  /** All payments on a listing, newest first. */
  async getListingPayments(listingId: string): Promise<PaidListingPayment[]> {
    const { data, error } = await sb
      .from('paid_listing_payments')
      .select('*')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as PaidListingPayment[];
  },

  /** Number of prior payments on this listing — drives first-time-vs-renewal pricing. */
  async getPriorPaymentCount(listingId: string): Promise<number> {
    const { count, error } = await sb
      .from('paid_listing_payments')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listingId);
    if (error) throw error;
    return count ?? 0;
  },

  /** Get the right amount in cents for a {days, listing} combo. */
  async getRenewalAmountCents(listingId: string, days: number): Promise<number> {
    const priorCount = await this.getPriorPaymentCount(listingId);
    const cents = getPackagePrice(days, priorCount === 0);
    if (cents === null) throw new Error(`Invalid day package: ${days}`);
    return cents;
  },

  // -----------------------------------------------------------
  // Payment state derivation (drives dashboard pills + modal CTAs)
  // -----------------------------------------------------------

  /**
   * Pure-derivation of a listing's payment status from its row + (optionally) the
   * user's active subscription info. UI passes in what it already has.
   */
  derivePaymentState(
    listing: MonetizationListingFields,
    opts: { hasActiveSubscription: boolean; isAdmin: boolean } = {
      hasActiveSubscription: false,
      isAdmin: false,
    },
  ): ListingPaymentState {
    const now = new Date();
    const paymentKind = listing.payment_kind;
    const isLocked =
      !opts.isAdmin &&
      listing.listing_type === 'rental' &&
      listing.created_at !== null &&
      daysBetween(now, new Date(listing.created_at)) >= 10;

    // Default to "unknown" until we narrow.
    let label: PaymentStateLabel = 'unknown';
    let trialDaysRemaining: number | null = null;
    let paidDaysRemaining: number | null = null;
    let freshnessDaysRemaining: number | null = null;
    let nextActionUrl: string | null = null;
    let nextActionLabel: string | null = null;

    if (listing.expires_at) {
      freshnessDaysRemaining = daysBetween(listing.expires_at, now);
    }

    // Branch 1: not active
    if (!listing.is_active) {
      if (paymentKind === 'legacy_free') {
        label = 'deactivated_reactivatable';
      } else if (listing.deactivated_at) {
        const days = daysBetween(listing.deactivated_at, now);
        if (days <= 0 && days > -REACTIVATION_GRACE_DAYS) {
          label = 'deactivated_reactivatable';
        } else {
          label = 'deactivated_permanent';
        }
      } else {
        label = 'deactivated_permanent';
      }
      nextActionLabel = label === 'deactivated_reactivatable' ? 'Reactivate' : null;
      nextActionUrl = label === 'deactivated_reactivatable' ? `/dashboard?listing=${listing.id}&action=reactivate` : null;
      return {
        paymentKind,
        label,
        trialDaysRemaining,
        paidDaysRemaining,
        freshnessDaysRemaining,
        hasSubscriptionCoverage: false,
        isLocked,
        nextActionUrl,
        nextActionLabel,
      };
    }

    // Branch 2: active — by payment_kind
    switch (paymentKind) {
      case 'individual_trial': {
        if (listing.trial_started_at) {
          const trialEnd = new Date(listing.trial_started_at);
          trialEnd.setUTCDate(trialEnd.getUTCDate() + TRIAL_LENGTH_DAYS);
          trialDaysRemaining = daysBetween(trialEnd, now);
        }
        if (trialDaysRemaining !== null && trialDaysRemaining <= 3) {
          label = 'trial_ending';
          nextActionLabel = 'Pay $25 to keep it live';
        } else {
          label = 'trial_active';
          nextActionLabel = 'Upgrade now (get 30 bonus days)';
        }
        nextActionUrl = `/dashboard?listing=${listing.id}&action=pay`;
        break;
      }
      case 'individual_paid': {
        if (listing.paid_until) {
          paidDaysRemaining = daysBetween(listing.paid_until, now);
        }
        if (paidDaysRemaining !== null && paidDaysRemaining <= 0) {
          label = 'paid_expired';
          nextActionLabel = 'Renew now';
          nextActionUrl = `/dashboard?listing=${listing.id}&action=pay`;
        } else if (freshnessDaysRemaining !== null && freshnessDaysRemaining <= 3) {
          label = 'paid_renewal_due';
          // If balance left, free renewal. Otherwise must pay.
          if (paidDaysRemaining !== null && paidDaysRemaining > 0) {
            nextActionLabel = 'Renew (free, draws balance)';
            nextActionUrl = `/dashboard?listing=${listing.id}&action=renew`;
          } else {
            nextActionLabel = 'Pay to keep it live';
            nextActionUrl = `/dashboard?listing=${listing.id}&action=pay`;
          }
        } else {
          label = 'paid_active';
        }
        break;
      }
      case 'subscription': {
        label = 'subscription_active';
        // Freshness still applies; if expiring, prompt renewal.
        if (freshnessDaysRemaining !== null && freshnessDaysRemaining <= 3) {
          nextActionLabel = 'Renew (free)';
          nextActionUrl = `/dashboard?listing=${listing.id}&action=renew`;
        }
        break;
      }
      case 'admin_granted': {
        label = 'admin_granted';
        break;
      }
      case 'legacy_free': {
        label = 'legacy_free';
        break;
      }
      default: {
        label = 'unknown';
      }
    }

    return {
      paymentKind,
      label,
      trialDaysRemaining,
      paidDaysRemaining,
      freshnessDaysRemaining,
      hasSubscriptionCoverage: paymentKind === 'subscription' && opts.hasActiveSubscription,
      isLocked,
      nextActionUrl,
      nextActionLabel,
    };
  },

  // -----------------------------------------------------------
  // Admin operations
  // -----------------------------------------------------------

  /**
   * Admin: grant N days to a listing as admin_grant (no Stripe).
   * Inserts a paid_listing_payments row and advances paid_until.
   */
  async adminGrantDays(params: {
    listingId: string;
    days: number;
    adminId: string;
    notes?: string;
  }): Promise<void> {
    const { data: listing, error: lookupErr } = await sb
      .from('listings')
      .select('id, user_id, listing_type, payment_kind, paid_until, is_active, paused_paid_days')
      .eq('id', params.listingId)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (!listing) throw new Error('Listing not found');
    if ((listing as { listing_type: string }).listing_type !== 'rental') {
      throw new Error('Admin day-grants apply to residential rentals only.');
    }

    const now = new Date();
    const l = listing as {
      user_id: string;
      payment_kind: PaymentKind | null;
      paid_until: string | null;
      is_active: boolean | null;
    };

    // Compute new paid_until: stack on existing or start fresh.
    let newPaidUntil: Date;
    if (l.paid_until && new Date(l.paid_until) > now) {
      newPaidUntil = new Date(l.paid_until);
      newPaidUntil.setUTCDate(newPaidUntil.getUTCDate() + params.days);
    } else {
      newPaidUntil = new Date(now);
      newPaidUntil.setUTCDate(newPaidUntil.getUTCDate() + params.days);
    }

    const { error: payErr } = await sb.from('paid_listing_payments').insert({
      listing_id: params.listingId,
      user_id: l.user_id,
      amount_cents: 0,
      days_granted: params.days,
      bonus_days: 0,
      source: 'admin_grant',
      is_initial_purchase: false,
      granted_by_admin_id: params.adminId,
      admin_notes: params.notes ?? null,
    });
    if (payErr) throw payErr;

    // Compute new expires_at = LEAST(now+30, newPaidUntil).
    const fresh = new Date(now);
    fresh.setUTCDate(fresh.getUTCDate() + FRESHNESS_DAYS);
    const newExpires = newPaidUntil < fresh ? newPaidUntil : fresh;

    const update: Record<string, unknown> = {
      payment_kind: 'individual_paid',
      paid_until: newPaidUntil.toISOString(),
      expires_at: newExpires.toISOString(),
      paused_paid_days: 0,
      updated_at: now.toISOString(),
    };
    if (!l.is_active) update.is_active = true;

    const { error: updErr } = await sb
      .from('listings')
      .update(update)
      .eq('id', params.listingId);
    if (updErr) throw updErr;
  },

  /**
   * Admin: mark a listing as admin_granted (no payment, no expiry from payment side).
   * Freshness deactivation still applies.
   */
  async adminMarkGranted(listingId: string): Promise<void> {
    const { error } = await sb
      .from('listings')
      .update({
        payment_kind: 'admin_granted',
        paid_until: null,
        paused_paid_days: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', listingId);
    if (error) throw error;
  },

  /** Admin: list paid listings sorted by days-remaining ascending (closest to expiry first). */
  async adminListPaidListings(): Promise<
    Array<{
      id: string;
      user_id: string;
      paid_until: string | null;
      neighborhood: string | null;
      location: string | null;
      price: number | null;
      payment_kind: PaymentKind;
      user?: { full_name: string; email: string };
    }>
  > {
    const { data, error } = await sb
      .from('listings')
      .select(
        'id, user_id, paid_until, neighborhood, location, price, payment_kind, user:profiles(full_name, email)',
      )
      .eq('listing_type', 'rental')
      .eq('is_active', true)
      .eq('payment_kind', 'individual_paid')
      .order('paid_until', { ascending: true });
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []) as any[];
  },
};

// Re-export the at-posting constant for the wizard's UI math.
export { AT_POSTING_BONUS_DAYS, TRIAL_LENGTH_DAYS };
