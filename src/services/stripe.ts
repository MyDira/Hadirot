import { supabase } from '../config/supabase';

export interface FeaturedPlan {
  id: string;
  name: string;
  duration: string;
  days: number;
  price: number;
  priceId: string;
}

export interface ConciergePlan {
  id: string;
  tier: 'tier1_quick' | 'tier2_forward' | 'tier3_vip';
  name: string;
  price: number;
  priceId: string;
  mode: 'payment' | 'subscription';
  interval?: string;
}

// NOTE: These Stripe price IDs must match the edge-function shared constants
// at supabase/functions/_shared/stripe-prices.ts. Client bundling and Deno
// runtime can't share the same module, so this duplication is intentional —
// update both when adding or rotating prices.
export const CONCIERGE_PLANS: ConciergePlan[] = [
  {
    id: 'tier1',
    tier: 'tier1_quick',
    name: 'Quick Post',
    price: 25,
    priceId: 'price_1T5TvZJvRPzH20A9ry7ZTpMk',
    mode: 'payment',
  },
  {
    id: 'tier2',
    tier: 'tier2_forward',
    name: 'Forward & Post',
    price: 125,
    priceId: 'price_1T5Tx4JvRPzH20A995RVffU5',
    mode: 'subscription',
    interval: 'month',
  },
  {
    id: 'tier3',
    tier: 'tier3_vip',
    name: 'VIP / Full Service',
    price: 200,
    priceId: 'price_1T5TybJvRPzH20A9GrEh0jTD',
    mode: 'subscription',
    interval: 'month',
  },
];

// IMPORTANT: Replace these price IDs with actual Stripe Price IDs from your catalog
export const FEATURED_PLANS: FeaturedPlan[] = [
  {
    id: '7day',
    name: '1 Week',
    duration: '7 days',
    days: 7,
    price: 25,
    priceId: 'price_1SzMw9JvRPzH20A9CJA2SQ87',
  },
  {
    id: '14day',
    name: '2 Weeks',
    duration: '14 days',
    days: 14,
    price: 40,
    priceId: 'price_1SzeDPJvRPzH20A9i8bj9rrN',
  },
  {
    id: '30day',
    name: '1 Month',
    duration: '30 days',
    days: 30,
    price: 75,
    priceId: 'price_1SzMz3JvRPzH20A9pA8pBPwj',
  },
];

export interface FeaturedPurchase {
  id: string;
  listing_id: string;
  user_id: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  plan: string;
  amount_cents: number;
  status: 'pending' | 'paid' | 'active' | 'expired' | 'cancelled' | 'refunded' | 'free';
  purchased_at: string | null;
  featured_start: string | null;
  featured_end: string | null;
  duration_days: number;
  is_admin_granted: boolean;
  granted_by_admin_id: string | null;
  promo_code_used: string | null;
  created_at: string;
  updated_at: string;
  is_commercial?: boolean;
  listings?: { title: string; location: string; neighborhood: string };
}

export const stripeService = {
  async createCheckoutSession(listingId: string, plan: string) {
    const selectedPlan = FEATURED_PLANS.find(p => p.id === plan);
    if (!selectedPlan) throw new Error('Invalid plan');

    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        listing_id: listingId,
        plan,
        price_id: selectedPlan.priceId,
      },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return data as { url: string; session_id: string };
  },

  async getListingPurchases(listingId: string): Promise<FeaturedPurchase[]> {
    const { data, error } = await supabase
      .from('featured_purchases')
      .select('*')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getUserPurchases(): Promise<FeaturedPurchase[]> {
    const { data, error } = await supabase
      .from('featured_purchases')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    const purchases = (data || []) as FeaturedPurchase[];

    // featured_purchases.listing_id is polymorphic (residential vs commercial,
    // discriminated by is_commercial) with no FK, so resolve titles manually
    // instead of relying on a PostgREST FK embed.
    const resIds = purchases.filter(p => !p.is_commercial).map(p => p.listing_id);
    const comIds = purchases.filter(p => p.is_commercial).map(p => p.listing_id);
    const titleMap: Record<string, { title: string; location: string; neighborhood: string }> = {};

    if (resIds.length) {
      const { data: rl } = await supabase
        .from('listings').select('id, title, location, neighborhood').in('id', resIds);
      (rl || []).forEach((l: any) => {
        titleMap[l.id] = { title: l.title ?? '', location: l.location ?? '', neighborhood: l.neighborhood ?? '' };
      });
    }
    if (comIds.length) {
      const { data: cl } = await supabase
        .from('commercial_listings').select('id, title, full_address, neighborhood').in('id', comIds);
      (cl || []).forEach((l: any) => {
        titleMap[l.id] = { title: l.title ?? '', location: l.full_address ?? '', neighborhood: l.neighborhood ?? '' };
      });
    }

    return purchases.map(p => ({ ...p, listings: titleMap[p.listing_id] }));
  },

  async adminGrantFeature(
    listingId: string,
    plan: string,
    durationDays: number,
    adminId: string,
    mode: 'free' | 'manual_payment',
    amountCents?: number,
    isCommercial = false,
  ) {
    const table = isCommercial ? 'commercial_listings' : 'listings';
    const now = new Date();
    const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const { error: purchaseError } = await supabase
      .from('featured_purchases')
      .insert({
        listing_id: listingId,
        user_id: (await supabase.from(table).select('user_id').eq('id', listingId).single()).data?.user_id,
        plan,
        amount_cents: mode === 'free' ? 0 : (amountCents || 0),
        status: mode === 'free' ? 'free' : 'active',
        is_admin_granted: true,
        granted_by_admin_id: adminId,
        purchased_at: now.toISOString(),
        featured_start: now.toISOString(),
        featured_end: endDate.toISOString(),
        duration_days: durationDays,
        is_commercial: isCommercial,
      });

    if (purchaseError) throw purchaseError;

    const { error: listingError } = await supabase
      .from(table)
      .update({
        is_featured: true,
        featured_started_at: now.toISOString(),
        featured_expires_at: endDate.toISOString(),
        featured_plan: plan,
      })
      .eq('id', listingId);

    if (listingError) throw listingError;
  },

  async adminRemoveFeature(listingId: string, isCommercial = false) {
    const table = isCommercial ? 'commercial_listings' : 'listings';
    await supabase
      .from('featured_purchases')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('listing_id', listingId)
      .in('status', ['active', 'free']);

    const { error } = await supabase
      .from(table)
      .update({
        is_featured: false,
        featured_expires_at: null,
        featured_started_at: null,
        featured_plan: null,
      })
      .eq('id', listingId);

    if (error) throw error;
  },
};
