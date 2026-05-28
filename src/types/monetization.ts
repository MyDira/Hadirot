// Type definitions + display constants for the residential-rental monetization
// system. Schema lives in supabase/migrations/2026052715*.sql.
//
// These types are hand-defined here because src/types/database.ts is auto-
// generated and won't carry the new tables until `npm run db:types` is run
// against the live Supabase project. Once that happens, downstream code can
// optionally migrate to Database['public']['Tables']['…']['Row'] types.

export type PaymentKind =
  | 'individual_trial'
  | 'individual_paid'
  | 'subscription'
  | 'admin_granted'
  | 'legacy_free';

export type ListingSubscriptionPlan = 'agent' | 'vip';
export type ListingSubscriptionStatus =
  | 'pending'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'admin_active';

export interface ListingSubscription {
  id: string;
  user_id: string;
  plan: ListingSubscriptionPlan;
  status: ListingSubscriptionStatus;
  listing_cap: number | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  billing_day_of_month: number | null;
  is_admin_granted: boolean;
  granted_by_admin_id: string | null;
  admin_active_from: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
}

export interface PaidListingPayment {
  id: string;
  listing_id: string;
  user_id: string;
  amount_cents: number;
  days_granted: number;
  bonus_days: number;
  source: 'stripe' | 'admin_grant';
  is_initial_purchase: boolean;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  granted_by_admin_id: string | null;
  admin_notes: string | null;
  created_at: string;
}

export interface PaidListingRefund {
  id: string;
  payment_id: string | null;
  listing_id: string | null;
  user_id: string | null;
  amount_cents: number;
  stripe_charge_id: string | null;
  stripe_refund_id: string | null;
  reason: string | null;
  created_at: string;
}

// Multi-day packages — single source of truth for the dashboard picker.
// Mirrors supabase/functions/_shared/stripe-prices.ts.
export interface IndividualListingPackage {
  days: number;
  firstTimeCents: number;
  renewalCents: number;
  // Display label, e.g. "1 month".
  label: string;
}

export const INDIVIDUAL_LISTING_PACKAGES: IndividualListingPackage[] = [
  { days: 30,  firstTimeCents: 2500,  renewalCents: 1500,  label: '1 month' },
  { days: 60,  firstTimeCents: 4000,  renewalCents: 3000,  label: '2 months' },
  { days: 90,  firstTimeCents: 5500,  renewalCents: 4500,  label: '3 months' },
  { days: 120, firstTimeCents: 7000,  renewalCents: 6000,  label: '4 months' },
  { days: 180, firstTimeCents: 10000, renewalCents: 9000,  label: '6 months' },
  { days: 270, firstTimeCents: 14500, renewalCents: 13500, label: '9 months' },
  { days: 360, firstTimeCents: 19000, renewalCents: 18000, label: '12 months' },
];

// At-posting payment grants 30 bonus days on top of the package.
// Only applied when is_initial_purchase=true AND no prior payments AND listing
// is currently in 'individual_trial' state. Webhook enforces this.
export const AT_POSTING_BONUS_DAYS = 30;
export const TRIAL_LENGTH_DAYS = 14;
export const FRESHNESS_DAYS = 30;
export const REACTIVATION_GRACE_DAYS = 30;

// Subscription plan display info. Real Stripe price IDs come from env on the
// edge-function side; the client only knows display attributes.
export interface ListingSubscriptionPlanInfo {
  plan: ListingSubscriptionPlan;
  name: string;
  priceCents: number;
  listingCap: number | null;
  description: string;
}

export const LISTING_SUBSCRIPTION_PLANS: ListingSubscriptionPlanInfo[] = [
  {
    plan: 'agent',
    name: 'Agent',
    priceCents: 5000,
    listingCap: 7,
    description: 'Post up to 7 listings under one account. $50/month, billed via Stripe on the day you started.',
  },
  {
    plan: 'vip',
    name: 'VIP',
    priceCents: 10000,
    listingCap: null,
    description: 'Unlimited listings under one account. $100/month, billed via Stripe on the day you started.',
  },
];

export const CONCIERGE_ADDON_PRICE_CENTS = 5000;

// Derived state for a listing's payment situation. Used by dashboard + wizard.
export type PaymentStateLabel =
  | 'trial_active'
  | 'trial_ending'
  | 'paid_active'
  | 'paid_renewal_due'
  | 'paid_expired'
  | 'subscription_active'
  | 'admin_granted'
  | 'legacy_free'
  | 'deactivated_reactivatable'
  | 'deactivated_permanent'
  | 'unknown';

export interface ListingPaymentState {
  paymentKind: PaymentKind | null;
  label: PaymentStateLabel;
  trialDaysRemaining: number | null;
  paidDaysRemaining: number | null;
  freshnessDaysRemaining: number | null;
  hasSubscriptionCoverage: boolean;
  isLocked: boolean; // bedrooms/location/phone editable?
  nextActionUrl: string | null;
  nextActionLabel: string | null;
}

// Helpers
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
}

export function getPackagePrice(days: number, isFirstPayment: boolean): number | null {
  const pkg = INDIVIDUAL_LISTING_PACKAGES.find((p) => p.days === days);
  if (!pkg) return null;
  return isFirstPayment ? pkg.firstTimeCents : pkg.renewalCents;
}
