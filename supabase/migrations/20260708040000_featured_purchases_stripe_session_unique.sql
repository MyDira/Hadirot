/*
  # [P1 / Track-1] featured_purchases: add Stripe-session idempotency UNIQUE

  ## Finding (audit 01-database-rls.md)
  featured_purchases has only a PLAIN index (idx_featured_purchases_stripe_session)
  on stripe_checkout_session_id, whereas paid_listing_payments has a partial
  UNIQUE (idx_paid_listing_payments_stripe_session_unique). Stripe delivers
  webhooks at-least-once; without a unique key on stripe_checkout_session_id a
  redelivered checkout.session.completed can insert a duplicate featured_purchases
  row for one payment (double entitlement / accounting drift).

  ## Pre-flight dup check (RUN THIS FIRST against prod; must return 0 rows before
  ## the UNIQUE index can be created):
  --   SELECT stripe_checkout_session_id, count(*)
  --   FROM public.featured_purchases
  --   WHERE stripe_checkout_session_id IS NOT NULL
  --   GROUP BY 1 HAVING count(*) > 1;
  ## If rows come back, dedupe before applying (keep the earliest paid row).

  ## Note on CONCURRENTLY
  Supabase runs each migration inside a transaction, and CREATE INDEX CONCURRENTLY
  cannot run in a transaction block. This migration therefore uses a plain
  CREATE UNIQUE INDEX (brief write lock; fine at current volume, ~hundreds of
  rows). To build without locking on a large table, instead run this statement
  by hand outside a transaction:
  --   CREATE UNIQUE INDEX CONCURRENTLY idx_featured_purchases_stripe_session_unique
  --     ON public.featured_purchases (stripe_checkout_session_id)
  --     WHERE stripe_checkout_session_id IS NOT NULL;

  ## Follow-up (Track 3 / billing)
  Ensure the stripe-webhook handler upserts with
  ON CONFLICT (stripe_checkout_session_id) DO NOTHING/UPDATE.

  ## Reversal (spirit)
  DROP INDEX IF EXISTS idx_featured_purchases_stripe_session_unique;
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_featured_purchases_stripe_session_unique
  ON public.featured_purchases (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
