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
   * Start a 14-day frontend-only free trial of Agent or VIP. No Stripe
   * involved — the row's `created_at` is the trial start. The cron
   * auto-expires trial rows after 14 days, which cascades through the
   * "subscription gone" check to deactivate the user's listings.
   *
   * Blocked if the user already has any active or trial subscription
   * (enforced by the unique partial index in the migration).
   */
  async startFreeTrial(params: {
    plan: ListingSubscriptionPlan;
  }): Promise<ListingSubscription> {
    // Get current user.
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) throw new Error('Not signed in');
    const userId = userData.user.id;

    // Check for an existing active/trial subscription.
    const existing = await this.getMyActiveSubscription();
    if (existing) {
      throw new Error(
        existing.status === 'trial'
          ? 'You already have an active trial. Wait for it to end or cancel it before starting a new one.'
          : 'You already have an active subscription. Cancel it first to start a trial.',
      );
    }

    const listingCap = params.plan === 'agent' ? 7 : null;

    const { data, error } = await sb
      .from('listing_subscriptions')
      .insert({
        user_id: userId,
        plan: params.plan,
        status: 'trial',
        listing_cap: listingCap,
        is_admin_granted: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data as ListingSubscription;
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

  /** Count of the caller's active rental listings already counted under a subscription. */
  async countMySubscriptionCoveredListings(): Promise<number> {
    const { count, error } = await sb
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('listing_type', 'rental')
      .eq('is_active', true)
      .eq('payment_kind', 'subscription');

    if (error) throw error;
    return count ?? 0;
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

  /** Start a Stripe Checkout session for Agent or VIP (optionally + concierge). */
  async createCheckoutSession(params: {
    plan: ListingSubscriptionPlan;
    includeConciergeAddon?: boolean;
  }): Promise<{ url: string; session_id: string }> {
    const { data, error } = await supabase.functions.invoke(
      'create-listing-subscription-checkout',
      {
        body: {
          plan: params.plan,
          include_concierge_addon: !!params.includeConciergeAddon,
        },
      },
    );

    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as { url: string; session_id: string };
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
      .select('*, user:profiles(id, full_name, email, phone)')
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
  }): Promise<ListingSubscription> {
    if (params.billingDayOfMonth < 1 || params.billingDayOfMonth > 28) {
      throw new Error('billingDayOfMonth must be 1..28');
    }

    // Compute next period_end as the next occurrence of billing_day_of_month
    // strictly after today, in UTC.
    const now = new Date();
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), params.billingDayOfMonth, 0, 0, 0));
    if (candidate <= now) {
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
        admin_active_from: now.toISOString(),
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
