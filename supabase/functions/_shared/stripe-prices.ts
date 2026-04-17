// Single source of truth for Stripe price IDs used by edge functions.
// Client-side counterpart lives in src/services/stripe.ts — keep these in
// sync until we unify via env vars or a shared SKU table.

export const CONCIERGE_PRICES = {
  tier1_quick:   "price_1T5TvZJvRPzH20A9ry7ZTpMk",  // one-time payment
  tier2_forward: "price_1T5Tx4JvRPzH20A995RVffU5",  // monthly subscription
  tier3_vip:     "price_1T5TybJvRPzH20A9GrEh0jTD",  // monthly subscription
} as const;

export const BOOST_PRICES = {
  "7day":  { priceId: "price_1SzMw9JvRPzH20A9CJA2SQ87", amount: 2500, days: 7 },
  "14day": { priceId: "price_1SzeDPJvRPzH20A9i8bj9rrN", amount: 4000, days: 14 },
  "30day": { priceId: "price_1SzMz3JvRPzH20A9pA8pBPwj", amount: 7500, days: 30 },
} as const;

export type ConciergeTier = keyof typeof CONCIERGE_PRICES;
export type BoostPlan = keyof typeof BOOST_PRICES;
