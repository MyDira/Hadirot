/*
  # Add 14-day free trial for Agent / VIP subscriptions

  Phase H of the residential-rental monetization plan.

  Per the product spec, agents need a 14-day frontend-only free trial so they
  can post multiple listings before being charged. Trials do NOT go through
  Stripe — they're tracked in listing_subscriptions with status='trial' and
  stripe_subscription_id IS NULL. After 14 days the row auto-expires and the
  user's covered listings deactivate via the existing cascade logic.

  Schema changes:
   - Extend listing_subscriptions.status CHECK to allow 'trial'.
   - Expand the "one active subscription per user" unique index to also
     prevent overlapping trials.

  Behavior:
   - auto_inactivate_old_listings RPC is extended to flip trial rows older
     than 14 days to status='expired' BEFORE evaluating listing deactivation
     conditions. The existing "subscription gone" safety-net then catches
     the user's subscription-covered listings and deactivates them in the
     same call.

  Status mapping:
   - trial         — user-initiated, no Stripe, ≤14 days from created_at.
   - active        — Stripe-managed, currently being charged.
   - admin_active  — manually granted by an admin, no Stripe.
   - past_due      — Stripe says payment failed; dunning in flight.
   - cancelled     — explicitly cancelled (by user, admin, or trial expiry).
   - expired       — period ended without renewal.
*/

-- ---------------------------------------------------------------
-- 1. Extend status CHECK to allow 'trial'.
-- ---------------------------------------------------------------
ALTER TABLE listing_subscriptions
  DROP CONSTRAINT IF EXISTS listing_subscriptions_status_check;

ALTER TABLE listing_subscriptions
  ADD CONSTRAINT listing_subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'past_due', 'cancelled', 'expired', 'admin_active', 'trial'));

-- ---------------------------------------------------------------
-- 2. Update the active-uniqueness index to include trial.
-- ---------------------------------------------------------------
DROP INDEX IF EXISTS idx_listing_subscriptions_one_active_per_user;

CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_subscriptions_one_active_per_user
  ON listing_subscriptions(user_id)
  WHERE status IN ('active', 'admin_active', 'past_due', 'trial');

-- ---------------------------------------------------------------
-- 3. Extend the "who counts as covered" portion of auto_inactivate.
--    The previous version checked status IN ('active', 'admin_active').
--    Now trial counts as covered too (during the 14-day window).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_inactivate_old_listings()
  RETURNS TABLE(inactivated_count integer, listing_ids uuid[])
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  affected_ids uuid[];
  affected_count integer;
  v_rental_days integer;
  v_sale_days integer;
BEGIN
  -- ---------------------------------------------------
  -- STEP 1: expire any 14d+ trial subscriptions first.
  -- The next query catches their listings via the
  -- "subscription gone" branch.
  -- ---------------------------------------------------
  UPDATE listing_subscriptions
  SET status = 'expired',
      cancelled_at = NOW(),
      updated_at = NOW()
  WHERE status = 'trial'
    AND created_at < NOW() - INTERVAL '14 days';

  -- ---------------------------------------------------
  -- STEP 2: load per-listing-type freshness windows.
  -- ---------------------------------------------------
  SELECT rental_active_days, sale_active_days
    INTO v_rental_days, v_sale_days
    FROM admin_settings LIMIT 1;

  v_rental_days := COALESCE(v_rental_days, 30);
  v_sale_days := COALESCE(v_sale_days, 30);

  -- ---------------------------------------------------
  -- STEP 3: find listings to inactivate.
  -- ---------------------------------------------------
  WITH to_inactivate AS (
    SELECT l.id FROM listings l
    WHERE l.is_active = true
      AND l.approved = true
      AND (
        -- (1) EXISTING freshness logic, unchanged.
        (
          (
            l.expires_at IS NOT NULL
            AND l.last_published_at IS NOT NULL
            AND GREATEST(
              l.expires_at,
              l.last_published_at + (
                CASE WHEN l.listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
                * INTERVAL '1 day'
              )
            ) < NOW()
          )
          OR (
            l.expires_at IS NOT NULL
            AND l.last_published_at IS NULL
            AND l.expires_at < NOW()
          )
          OR (
            l.expires_at IS NULL
            AND l.last_published_at IS NOT NULL
            AND l.last_published_at < NOW() - (
              CASE WHEN l.listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
              * INTERVAL '1 day'
            )
          )
        )
        -- (2) trial expired (residential rentals only)
        OR (
          l.listing_type = 'rental'
          AND l.payment_kind = 'individual_trial'
          AND l.trial_started_at IS NOT NULL
          AND l.trial_started_at < NOW() - INTERVAL '14 days'
        )
        -- (3) paid balance exhausted (residential rentals only)
        OR (
          l.listing_type = 'rental'
          AND l.payment_kind = 'individual_paid'
          AND l.paid_until IS NOT NULL
          AND l.paid_until < NOW()
        )
        -- (4) subscription no longer active (safety net + handles trial expiry above)
        OR (
          l.listing_type = 'rental'
          AND l.payment_kind = 'subscription'
          AND NOT EXISTS (
            SELECT 1 FROM listing_subscriptions ls
            WHERE ls.user_id = l.user_id
              AND ls.status IN ('active', 'admin_active', 'trial')
          )
        )
      )
  )
  SELECT array_agg(id), COUNT(*)::integer
    INTO affected_ids, affected_count
    FROM to_inactivate;

  IF affected_ids IS NULL OR affected_count = 0 THEN
    affected_ids := ARRAY[]::uuid[];
    affected_count := 0;
  ELSE
    UPDATE listings
    SET is_active = false,
        updated_at = NOW()
    WHERE id = ANY(affected_ids);
  END IF;

  RETURN QUERY SELECT affected_count, affected_ids;
END;
$function$;

COMMENT ON FUNCTION public.auto_inactivate_old_listings() IS
  'Hourly cron. (1) Auto-expires trial subscriptions older than 14d. (2) Deactivates listings past freshness OR with expired trial/balance/subscription. The "subscription gone" branch covers users whose trial just expired.';
