/*
  # [P2 / Track-1] UNIQUE on stripe_subscription_id (subscription tables)

  ## Finding (audit 01-database-rls.md)
  Nothing prevents two rows from claiming the same Stripe subscription:
    - listing_subscriptions.stripe_subscription_id has only a PLAIN partial index
      (idx_listing_subscriptions_stripe_sub). The one-active-per-user partial
      unique does NOT stop a cancelled row + new row (or a webhook double-insert)
      pointing at one Stripe subscription.
    - concierge_subscriptions.stripe_subscription_id has no index at all.
  Duplicate rows for one Stripe subscription cause entitlement/reconciliation
  ambiguity (which row does cascade-deactivate-subscription update?).

  ## Pre-flight dup checks (RUN FIRST against prod; must each return 0 rows):
  --   SELECT stripe_subscription_id, count(*) FROM public.listing_subscriptions
  --   WHERE stripe_subscription_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
  --   SELECT stripe_subscription_id, count(*) FROM public.concierge_subscriptions
  --   WHERE stripe_subscription_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
  ## If dups exist, reconcile before applying.

  ## Note on CONCURRENTLY
  Plain CREATE UNIQUE INDEX (in-transaction migration). For a zero-lock build on
  a large table, run CREATE UNIQUE INDEX CONCURRENTLY by hand outside a txn.

  ## Follow-up (Track 3 / billing)
  Ensure subscription webhook upserts use ON CONFLICT (stripe_subscription_id).

  ## Reversal (spirit)
  DROP INDEX IF EXISTS idx_listing_subscriptions_stripe_sub_unique;
  DROP INDEX IF EXISTS idx_concierge_subscriptions_stripe_sub_unique;
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_subscriptions_stripe_sub_unique
  ON public.listing_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_concierge_subscriptions_stripe_sub_unique
  ON public.concierge_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
