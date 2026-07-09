// Single source of truth for Stripe price IDs used by edge functions.
// Client-side counterpart lives in src/services/stripe.ts — keep these in
// sync until we unify via env vars or a shared SKU table.

// Env-overridable (see LISTING_SUBSCRIPTION_PRICES note below). Setting the
// secret lets a test->live price rotation happen with NO code change/redeploy.
export const CONCIERGE_PRICES = {
  tier1_quick:   Deno.env.get("STRIPE_CONCIERGE_TIER1_PRICE_ID") || "price_1T5TvZJvRPzH20A9ry7ZTpMk",  // one-time payment
  tier2_forward: Deno.env.get("STRIPE_CONCIERGE_TIER2_PRICE_ID") || "price_1T5Tx4JvRPzH20A995RVffU5",  // monthly subscription
  tier3_vip:     Deno.env.get("STRIPE_CONCIERGE_TIER3_PRICE_ID") || "price_1T5TybJvRPzH20A9GrEh0jTD",  // monthly subscription
} as const;

export const BOOST_PRICES = {
  "7day":  { priceId: Deno.env.get("STRIPE_BOOST_7DAY_PRICE_ID")  || "price_1SzMw9JvRPzH20A9CJA2SQ87", amount: 2500, days: 7 },
  "14day": { priceId: Deno.env.get("STRIPE_BOOST_14DAY_PRICE_ID") || "price_1SzeDPJvRPzH20A9i8bj9rrN", amount: 4000, days: 14 },
  "30day": { priceId: Deno.env.get("STRIPE_BOOST_30DAY_PRICE_ID") || "price_1SzMz3JvRPzH20A9pA8pBPwj", amount: 7500, days: 30 },
} as const;

// Featured-listing prices (create-checkout-session, mode: 'payment').
// SECURITY: the checkout function derives the charged price AND the granted
// duration_days AND amount_cents from THIS table keyed by the validated plan —
// never from a client-supplied price_id. Keeping priceId/amount/days together
// here is what makes "pay the 7-day price, get 30 days" impossible.
export const FEATURED_PRICES = {
  "7day":  { priceId: Deno.env.get("STRIPE_FEATURED_7DAY_PRICE_ID")  || "price_1SzMw9JvRPzH20A9CJA2SQ87", amount: 2500, days: 7 },
  "14day": { priceId: Deno.env.get("STRIPE_FEATURED_14DAY_PRICE_ID") || "price_1SzeDPJvRPzH20A9i8bj9rrN", amount: 4000, days: 14 },
  "30day": { priceId: Deno.env.get("STRIPE_FEATURED_30DAY_PRICE_ID") || "price_1SzMz3JvRPzH20A9pA8pBPwj", amount: 7500, days: 30 },
} as const;

// Residential-rental monetization (Phase B).
// Subscription plans require Stripe price IDs (recurring monthly).
// Individual listing payments use ad-hoc price_data (variable day packages).
//
// Mapping note (Stripe product name → our plan key):
//   "Agent Plan — Starter"   ($50/mo, 7-listing cap) → agent
//   "Agent Plan — Unlimited" ($100/mo, unlimited)    → vip
//   "Concierge Listing Service" ($50/mo)             → addon_concierge
// ⚠️ The literals below were supplied by the owner (June 10 2026) as the
// launch price ids. BEFORE LAUNCH verify they exist with Stripe's "Test
// mode" toggle OFF — a price id only works in the mode it was created in,
// so if these are test-mode ids, live checkout creation will fail loudly
// until live prices are created and set via the env secrets (which always
// take precedence over these fallbacks). See MONETIZATION_LAUNCH_PLAN.md
// §0.1/0.2.
export const LISTING_SUBSCRIPTION_PRICES = {
  agent:           Deno.env.get("STRIPE_AGENT_PRICE_ID")           || "price_1Tc8PYJvRPzH20A9UURtXKeg",
  vip:             Deno.env.get("STRIPE_VIP_PRICE_ID")             || "price_1Tc8PxJvRPzH20A9OyuLWHHD",
  addon_concierge: Deno.env.get("STRIPE_ADDON_CONCIERGE_PRICE_ID") || "price_1Tc8QSJvRPzH20A9qA8Gp1PF",
} as const;

// Per-day-package pricing for individual residential-rental payments.
// Pricing model:
//   - First paid month on a listing: $25
//   - Subsequent paid months: $15
// Multi-month packages are computed as first-month + N additional months at $15 each.
export const INDIVIDUAL_LISTING_PACKAGES = [
  { days: 30,  first_time_cents: 2500,  renewal_cents: 1500  },
  { days: 60,  first_time_cents: 4000,  renewal_cents: 3000  },
  { days: 90,  first_time_cents: 5500,  renewal_cents: 4500  },
  { days: 120, first_time_cents: 7000,  renewal_cents: 6000  },
  { days: 180, first_time_cents: 10000, renewal_cents: 9000  },
  { days: 270, first_time_cents: 14500, renewal_cents: 13500 },
  { days: 360, first_time_cents: 19000, renewal_cents: 18000 },
] as const;

export type IndividualListingDays = (typeof INDIVIDUAL_LISTING_PACKAGES)[number]["days"];
export type ListingSubscriptionPlan = keyof typeof LISTING_SUBSCRIPTION_PRICES;
export type ConciergeTier = keyof typeof CONCIERGE_PRICES;
export type BoostPlan = keyof typeof BOOST_PRICES;
export type FeaturedPlan = keyof typeof FEATURED_PRICES;
