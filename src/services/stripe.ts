import { supabase } from '../config/supabase';

export interface FeaturedPlan {
  id: string;
  name: string;
  duration: string;
  days: number;
  price: number;
  priceId: string;
}

// IMPORTANT: Replace these price IDs with actual Stripe Price IDs from your catalog
export const FEATURED_PLANS: FeaturedPlan[] = [
  {
    id: '7day',
    name: '1 Week',
    duration: '7 days',
    days: 7,
    price: 25,
    priceId: 'price_1Szi8QJvRPzH20A9F7OyDcMm',
  },
  {
    id: '14day',
    name: '2 Weeks',
    duration: '14 days',
    days: 14,
    price: 40,
    priceId: 'price_1Szi8qJvRPzH20A97lYHtSdC',
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
      .select('*, listings(title, location, neighborhood)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async adminGrantFeature(
    listingId: string,
    plan: string,
    durationDays: number,
    adminId: string,
    mode: 'free' | 'manual_payment',
    amountCents?: number,
  ) {
    const now = new Date();
    const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const { error: purchaseError } = await supabase
      .from('featured_purchases')
      .insert({
        listing_id: listingId,
        user_id: (await supabase.from('listings').select('user_id').eq('id', listingId).single()).data?.user_id,
        plan,
        amount_cents: mode === 'free' ? 0 : (amountCents || 0),
        status: mode === 'free' ? 'free' : 'active',
        is_admin_granted: true,
        granted_by_admin_id: adminId,
        purchased_at: now.toISOString(),
        featured_start: now.toISOString(),
        featured_end: endDate.toISOString(),
        duration_days: durationDays,
      });

    if (purchaseError) throw purchaseError;

    const { error: listingError } = await supabase
      .from('listings')
      .update({
        is_featured: true,
        featured_started_at: now.toISOString(),
        featured_expires_at: endDate.toISOString(),
        featured_plan: plan,
      })
      .eq('id', listingId);

    if (listingError) throw listingError;
  },

  async adminRemoveFeature(listingId: string) {
    await supabase
      .from('featured_purchases')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('listing_id', listingId)
      .in('status', ['active', 'free']);

    const { error } = await supabase
      .from('listings')
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
