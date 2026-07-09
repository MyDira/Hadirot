/*
  # Stripe webhook event log (idempotency + retry-safety + error visibility)

  Backs the Track-3 P1 fix "webhook DB failures return 200 -> lost entitlement".

  The stripe-webhook function now:
    1. Claims each Stripe event id in this table before dispatch (a row with
       processed_at = NULL means "seen but not yet successfully processed").
    2. Skips events whose row already has processed_at SET (successfully
       processed) — this is the cross-handler idempotency guard.
    3. On a money-critical handler failure, records the error text here and
       re-throws so the outer catch returns HTTP 500 and Stripe retries.
       processed_at stays NULL, so the retry reprocesses; the per-handler atomic
       unique-index inserts (paid_listing_payments, featured_purchases,
       listing_subscriptions) prevent any double-grant on that reprocess.
    4. On success, stamps processed_at = now() and clears error.

  ⚠️ DEPLOY ORDERING: this migration MUST be applied to the database BEFORE the
  updated stripe-webhook function is deployed. The new function code reads and
  writes this table on every event; without the table it would error on every
  webhook. Apply migration first, then redeploy stripe-webhook.

  This migration is purely additive (new table only). No existing objects change.
*/

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id     text PRIMARY KEY,
  type         text,
  processed_at timestamptz DEFAULT now(),
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_webhook_events IS
  'One row per Stripe webhook event id. processed_at NULL = claimed but not yet successfully processed (retryable); processed_at SET = done (idempotent skip). error holds the last handler failure text for admin visibility. Written only by the service-role stripe-webhook function.';

-- Service-role only. No RLS policies are added, so with RLS enabled the table
-- is inaccessible to anon/authenticated (the webhook uses the service-role key,
-- which bypasses RLS). This keeps the ledger private.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Helps an admin "recent failures" view scan unprocessed / errored events.
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_unprocessed
  ON public.stripe_webhook_events (created_at)
  WHERE processed_at IS NULL;
