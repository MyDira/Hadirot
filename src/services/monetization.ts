import { supabase } from '../config/supabase';

export interface MonetizationFeature {
  id: string;
  feature_key: string;
  feature_name: string;
  feature_type: 'one_time' | 'subscription';
  is_enabled: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  plan_key: string;
  plan_name: string;
  account_type: 'agency' | 'landlord';
  price_cents: number;
  billing_period: 'monthly' | 'yearly';
  listings_per_month: number;
  stripe_price_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FeaturePricing {
  id: string;
  feature_key: string;
  price_cents: number;
  duration_days: number | null;
  stripe_price_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeatureEntitlement {
  id: string;
  profile_id: string;
  agency_id: string | null;
  feature_key: string;
  entitlement_source: 'purchase' | 'subscription' | 'admin_grant' | 'promotional';
  is_active: boolean;
  expires_at: string | null;
  granted_by_admin_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentTransaction {
  id: string;
  profile_id: string;
  agency_id: string | null;
  transaction_type: 'subscription' | 'one_time' | 'refund';
  feature_key: string | null;
  amount_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_invoice_id: string | null;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UserSubscription {
  id: string;
  profile_id: string;
  agency_id: string | null;
  plan_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'expired';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  listings_used_this_period: number;
  created_at: string;
  updated_at: string;
}

export const monetizationService = {
  async getAllFeatures(): Promise<MonetizationFeature[]> {
    const { data, error } = await supabase
      .from('monetization_features')
      .select('*')
      .order('feature_name');

    if (error) throw error;
    return data || [];
  },

  async toggleFeature(featureKey: string, enabled: boolean): Promise<void> {
    const { error } = await supabase
      .from('monetization_features')
      .update({ is_enabled: enabled })
      .eq('feature_key', featureKey);

    if (error) throw error;
  },

  async getAllSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('account_type')
      .order('sort_order');

    if (error) throw error;
    return data || [];
  },

  async updateSubscriptionPlan(
    planId: string,
    updates: Partial<SubscriptionPlan>
  ): Promise<void> {
    const { error } = await supabase
      .from('subscription_plans')
      .update(updates)
      .eq('id', planId);

    if (error) throw error;
  },

  async toggleSubscriptionPlan(planId: string, active: boolean): Promise<void> {
    const { error } = await supabase
      .from('subscription_plans')
      .update({ is_active: active })
      .eq('id', planId);

    if (error) throw error;
  },

  async getAllFeaturePricing(): Promise<FeaturePricing[]> {
    const { data, error } = await supabase
      .from('feature_pricing')
      .select('*')
      .order('feature_key');

    if (error) throw error;
    return data || [];
  },

  async updateFeaturePricing(
    pricingId: string,
    updates: Partial<FeaturePricing>
  ): Promise<void> {
    const { error } = await supabase
      .from('feature_pricing')
      .update(updates)
      .eq('id', pricingId);

    if (error) throw error;
  },

  async grantFeatureAccess(params: {
    profileId: string;
    featureKey: string;
    expiresAt?: string | null;
    agencyId?: string | null;
    notes?: string;
  }): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('Must be authenticated to grant access');
    }

    const { error } = await supabase.from('feature_entitlements').insert({
      profile_id: params.profileId,
      agency_id: params.agencyId || null,
      feature_key: params.featureKey,
      entitlement_source: 'admin_grant',
      is_active: true,
      expires_at: params.expiresAt || null,
      granted_by_admin_id: user.id,
      notes: params.notes || null,
    });

    if (error) throw error;
  },

  async revokeFeatureAccess(entitlementId: string): Promise<void> {
    const { error } = await supabase
      .from('feature_entitlements')
      .update({ is_active: false })
      .eq('id', entitlementId);

    if (error) throw error;
  },

  async getUserEntitlements(profileId: string): Promise<FeatureEntitlement[]> {
    const { data, error } = await supabase
      .from('feature_entitlements')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getAllTransactions(limit = 50): Promise<PaymentTransaction[]> {
    const { data, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  async getUserTransactions(profileId: string): Promise<PaymentTransaction[]> {
    const { data, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getAllActiveSubscriptions(): Promise<UserSubscription[]> {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getRevenueStats(): Promise<{
    totalRevenue: number;
    subscriptionRevenue: number;
    oneTimeRevenue: number;
    transactionCount: number;
    activeSubscriptions: number;
  }> {
    const { data: transactions, error: txError } = await supabase
      .from('payment_transactions')
      .select('transaction_type, amount_cents, status')
      .eq('status', 'succeeded');

    if (txError) throw txError;

    const { data: subscriptions, error: subError } = await supabase
      .from('user_subscriptions')
      .select('id')
      .eq('status', 'active');

    if (subError) throw subError;

    const totalRevenue = transactions?.reduce((sum, tx) => sum + tx.amount_cents, 0) || 0;
    const subscriptionRevenue = transactions
      ?.filter(tx => tx.transaction_type === 'subscription')
      .reduce((sum, tx) => sum + tx.amount_cents, 0) || 0;
    const oneTimeRevenue = transactions
      ?.filter(tx => tx.transaction_type === 'one_time')
      .reduce((sum, tx) => sum + tx.amount_cents, 0) || 0;

    return {
      totalRevenue,
      subscriptionRevenue,
      oneTimeRevenue,
      transactionCount: transactions?.length || 0,
      activeSubscriptions: subscriptions?.length || 0,
    };
  },

  formatPrice(cents: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  },

  centsToDollars(cents: number): number {
    return cents / 100;
  },

  dollarsToCents(dollars: number): number {
    return Math.round(dollars * 100);
  },
};
