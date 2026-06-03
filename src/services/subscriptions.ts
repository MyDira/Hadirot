// Listing subscriptions service (Agent / VIP / concierge add-on).
// Schema in supabase/migrations/20260527150000_create_monetization_tables.sql.
//
// Note: the Supabase client is currently typed against the pre-migration
// Database schema. Until `npm run db:types` regenerates it, we use a
// targeted cast for the new tables. After regen, we can drop the cast.

import { supabase } from '../config/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ListingSubscription,
  ListingSubscriptionPlan,
} from '../types/monetization';
import { paymentsService, type MonetizationListingFields } from './payments';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as SupabaseClient<any, 'public', any>;

export const subscriptionsService = {
  // -----------------------------------------------------------
  // User-facing
  // -----------------------------------------------------------

  /** Return the caller's currently-active listing subscription, if any.
   * Includes trial subscriptions — they cover listings the same as paid ones
   * until the 14-day window elapses. */
  async getMyActiveSubscription(): Promise<ListingSubscription | null> {
    const { data, error } = await sb
      .from('listing_subscriptions')
      .select('*')
      .in('status', ['active', 'admin_active', 'past_due', 'trial'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return (data as ListingSubscription | null) ?? null;
  },

  /**
   * Start a 14-day Stripe-managed free trial of Agent or VIP.
   *
   * Phase K change: the trial now runs through Stripe Checkout. The user is
   * required to enter a card; Stripe charges nothing for 14 days then
   * auto-charges on day 14 (or marks the subscription past_due if the card
   * fails). This is the "commitment" version of the trial — easier to convert,
   * more revenue.
   *
   * Returns a Stripe Checkout URL; caller should redirect the browser to it.
   * The listing_subscriptions row is created when the Stripe webhook fires
   * checkout.session.completed (status='trial').
   *
   * Blocked at checkout-create time if the user already has an active or
   * trial subscription.
   */
  async startFreeTrial(params: {
    plan: ListingSubscriptionPlan;
  }): Promise<{ url: string; session_id: string }> {
    const result = await this.createCheckoutSession({
      plan: params.plan,
      includeConciergeAddon: false,
      withTrial: true,
    });
    return { url: result.url, session_id: result.session_id };
  },

  /** Returns whether caller has the concierge add-on attached to an active sub. */
  async hasConciergeAddon(): Promise<boolean> {
    const sub = await this.getMyActiveSubscription();
    if (!sub) return false;
    const { data } = await sb
      .from('concierge_subscriptions')
      .select('id')
      .eq('tier', 'addon_concierge')
      .eq('listing_subscription_id', sub.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    return !!data;
  },

  /**
   * Count of the caller's OWN rental listings that draw on their subscription's
   * listing cap.
   *
   * A listing occupies a subscription slot when it is *live or pending admin
   * approval* — both count, so a poster can't keep submitting new listings past
   * the cap while earlier ones sit "in review". Deactivated / expired /
   * awaiting-payment listings do NOT occupy a slot.
   *
   * EXCEPTION (product rule): a listing the user paid for individually — or one
   * on its own per-listing free trial — does NOT count against the subscription
   * cap *until those purchased/trial days are fully used up*. Once an individual
   * listing's days run out it falls back to drawing on the subscription, so it
   * begins counting again.
   *
   * Scoped to the caller via an explicit user_id filter (listings are publicly
   * readable, so RLS alone would count platform-wide).
   */
  async countMySubscriptionCoveredListings(): Promise<number> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;

    const { data, error } = await sb
      .from('listings')
      .select(
        'id, user_id, listing_type, is_active, approved, payment_kind, trial_started_at, paid_until, paused_paid_days, expires_at, deactivated_at, created_at',
      )
      .eq('user_id', user.id)
      .eq('listing_type', 'rental');

    if (error) throw error;

    const rows = (data || []) as MonetizationListingFields[];

    return rows.filter((row) => {
      const ps = paymentsService.derivePaymentState(row, {
        hasActiveSubscription: true,
        isAdmin: false,
      });

      // Not live and not pending approval (dead, reactivatable, or awaiting an
      // unfinished payment) → doesn't occupy a slot.
      if (
        ps.label === 'deactivated_permanent' ||
        ps.label === 'deactivated_reactivatable' ||
        ps.label === 'payment_required'
      ) {
        return false;
      }

      // Independently covered by an active individual purchase / per-listing
      // trial → excluded until those days are fully counted.
      if (ps.paymentKind === 'individual_paid' && (ps.paidDaysRemaining ?? 0) > 0) {
        return false;
      }
      if (ps.paymentKind === 'individual_trial' && (ps.trialDaysRemaining ?? 0) > 0) {
        return false;
      }

      // Everything else that is live-or-pending draws on the subscription cap.
      return true;
    }).length;
  },

  /**
   * Returns true if caller has an active subscription with remaining capacity to
   * cover another listing. Returns null if not subscribed at all.
   */
  async canPostUnderSubscription(): Promise<
    { canPost: boolean; sub: ListingSubscription; used: number; cap: number | null } | null
  > {
    const sub = await this.getMyActiveSubscription();
    if (!sub) return null;
    const used = await this.countMySubscriptionCoveredListings();
    const canPost = sub.listing_cap === null || used < sub.listing_cap;
    return { canPost, sub, used, cap: sub.listing_cap };
  },

  /** Start a Stripe Checkout session for Agent or VIP (optionally + concierge,
   *  optionally with the 14-day trial — see startFreeTrial). */
  async createCheckoutSession(params: {
    plan: ListingSubscriptionPlan;
    includeConciergeAddon?: boolean;
    /** When true, attach Stripe's 14-day trial. Card is collected but not charged
     *  until day 14. */
    withTrial?: boolean;
    /** Admin-only: subscribe on behalf of this user. The Stripe customer /
     *  subscription attach to the target, not the admin caller. */
    targetUserId?: string;
  }): Promise<{ url: string; session_id: string; with_trial?: boolean }> {
    const { data, error } = await supabase.functions.invoke(
      'create-listing-subscription-checkout',
      {
        body: {
          plan: params.plan,
          include_concierge_addon: !!params.includeConciergeAddon,
          with_trial: !!params.withTrial,
          ...(params.targetUserId ? { target_user_id: params.targetUserId } : {}),
        },
      },
    );

    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as { url: string; session_id: string; with_trial?: boolean };
  },

  /**
   * Admin: open a real Stripe Checkout on behalf of a user (admin keys the
   * caller's card over the phone). The Stripe customer / subscription attach
   * to the target user, and the webhook creates that user's
   * listing_subscriptions row exactly as a self-serve checkout would.
   *
   * Returns a Stripe Checkout URL; the admin UI should open it in a new tab.
   */
  async adminCreateSubscriptionCheckout(params: {
    targetUserId: string;
    plan: ListingSubscriptionPlan;
    includeConciergeAddon?: boolean;
  }): Promise<{ url: string; session_id: string }> {
    const result = await this.createCheckoutSession({
      plan: params.plan,
      includeConciergeAddon: params.includeConciergeAddon,
      targetUserId: params.targetUserId,
    });
    return { url: result.url, session_id: result.session_id };
  },

  /**
   * Upgrade an existing Agent subscription to VIP, paying only the prorated
   * difference (~$50/mo) — NOT a fresh $100 checkout.
   *
   * Stripe-backed subscriptions are modified in place with proration (the card
   * on file is charged the delta immediately). Admin-granted/manual
   * subscriptions just flip plan/cap. No redirect — resolves in place.
   *
   * Throws if the caller has no active subscription or is already on VIP.
   */
  async upgradeToVip(): Promise<{ upgraded: boolean; prorated: boolean; manual: boolean }> {
    const { data, error } = await supabase.functions.invoke(
      'upgrade-listing-subscription',
      { body: { plan: 'vip' } },
    );
    if (error) {
      // Surface the edge function's JSON error body when present.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = (error as any)?.context;
      const msg = ctx?.error || (error as Error).message;
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data as { upgraded: boolean; prorated: boolean; manual: boolean };
  },

  // -----------------------------------------------------------
  // Admin-only
  // -----------------------------------------------------------

  /**
   * Admin: list all subscriptions sorted by upcoming renewal (closest first).
   * Joins the owner profile for display.
   */
  async listAll(): Promise<
    Array<ListingSubscription & { user?: { id: string; full_name: string; email: string; phone?: string } }>
  > {
    const { data, error } = await sb
      .from('listing_subscriptions')
      .select('*, user:profiles!listing_subscriptions_user_id_fkey(id, full_name, email, phone)')
      .order('current_period_end', { ascending: true, nullsFirst: false });

    if (error) throw error;
    return (data || []) as Array<
      ListingSubscription & { user?: { id: string; full_name: string; email: string; phone?: string } }
    >;
  },

  /**
   * Admin: search profiles for the "add subscriber" picker.
   * Matches email or full_name substring.
   */
  async searchProfiles(
    query: string,
  ): Promise<Array<{ id: string; full_name: string; email: string }>> {
    const q = query.trim();
    if (q.length < 2) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10);
    if (error) throw error;
    return (data || []) as Array<{ id: string; full_name: string; email: string }>;
  },

  /**
   * Admin: create a manual (no-Stripe) subscription for a user.
   * Sets status='admin_active' with billing_day_of_month and computes
   * current_period_end as the next occurrence of that day.
   */
  async adminCreate(params: {
    userId: string;
    plan: ListingSubscriptionPlan;
    billingDayOfMonth: number;
    adminId: string;
    notes?: string;
    /** Optional arbitrary start date (YYYY-MM-DD or ISO). When provided, the
     *  subscription is treated as active from this date and current_period_end
     *  is the next billing-day occurrence strictly after it. Defaults to now. */
    startDate?: string;
  }): Promise<ListingSubscription> {
    if (params.billingDayOfMonth < 1 || params.billingDayOfMonth > 28) {
      throw new Error('billingDayOfMonth must be 1..28');
    }

    // The "anchor" is the chosen start date (defaults to now). current_period_end
    // is the next occurrence of billing_day_of_month strictly after the anchor.
    const now = new Date();
    const anchor = params.startDate ? new Date(params.startDate) : now;
    if (Number.isNaN(anchor.getTime())) {
      throw new Error('Invalid startDate');
    }

    const candidate = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), params.billingDayOfMonth, 0, 0, 0));
    if (candidate <= anchor) {
      // Roll to next month.
      candidate.setUTCMonth(candidate.getUTCMonth() + 1);
    }

    const listingCap = params.plan === 'agent' ? 7 : null;

    const { data, error } = await sb
      .from('listing_subscriptions')
      .insert({
        user_id: params.userId,
        plan: params.plan,
        status: 'admin_active',
        listing_cap: listingCap,
        billing_day_of_month: params.billingDayOfMonth,
        current_period_end: candidate.toISOString(),
        is_admin_granted: true,
        granted_by_admin_id: params.adminId,
        admin_active_from: anchor.toISOString(),
        admin_notes: params.notes ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data as ListingSubscription;
  },

  /** Admin: cancel a subscription (admin-granted or Stripe). Cascade handled by trigger/cron. */
  async adminCancel(id: string): Promise<void> {
    const { error } = await sb
      .from('listing_subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;

    // Trigger the cascade explicitly so listings deactivate without waiting for cron.
    const { data: row } = await sb
      .from('listing_subscriptions')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();
    if (row?.user_id) {
      await supabase.functions.invoke('cascade-deactivate-subscription', {
        body: { user_id: row.user_id, listing_subscription_id: id },
      });
    }
  },

  /** Admin: change billing day (1..28). Rolls current_period_end to next occurrence. */
  async adminUpdateBillingDay(id: string, day: number): Promise<void> {
    if (day < 1 || day > 28) throw new Error('day must be 1..28');
    const now = new Date();
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 0, 0, 0));
    if (candidate <= now) candidate.setUTCMonth(candidate.getUTCMonth() + 1);

    const { error } = await sb
      .from('listing_subscriptions')
      .update({
        billing_day_of_month: day,
        current_period_end: candidate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
  },

  /** Admin: update notes. */
  async adminUpdateNotes(id: string, notes: string): Promise<void> {
    const { error } = await sb
      .from('listing_subscriptions')
      .update({ admin_notes: notes, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },
};
