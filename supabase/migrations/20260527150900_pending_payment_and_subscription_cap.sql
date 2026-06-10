/*
  # pending_payment kind + server-side subscription cap

  Three hardening changes surfaced by the pre-launch audit.

  1. New payment_kind value 'pending_payment'.
     The wizard's "must pay" branch now creates the listing with
     payment_kind='pending_payment' (instead of NULL) before redirecting to
     Stripe. If the user abandons checkout the listing can no longer be mistaken
     for a free/legacy listing at admin-approval time. The Stripe webhook flips
     it to 'individual_paid' on payment success exactly as before (the webhook's
     "fresh purchase" branch handles it — no bonus days, since bonus requires
     payment_kind='individual_trial').

  2. auto_inactivate_old_listings (FINAL) gains a branch (5): when monetization
     is on, any APPROVED + ACTIVE rental still sitting in 'pending_payment' is
     deactivated. This is the safety net for the case where an admin approves an
     unpaid "must pay" listing — it can never enjoy a free 30-day freshness run.

  3. enforce_subscription_listing_cap() BEFORE INSERT trigger on listings.
     The Agent 7-listing cap was previously enforced only client-side (wizard
     gate). A tampered client could insert listings with
     payment_kind='subscription' past the cap. This trigger re-checks on insert:
       - only fires for residential rentals tagged 'subscription'
       - only when monetization_enabled = true
       - admins are exempt
       - requires an active/admin_active/trial subscription
       - counts the user's subscription rentals already live OR pending approval
         (is_active = true OR approved = false) and rejects at/over cap.
     VIP (listing_cap NULL) is treated as unlimited.
     The Stripe webhook covers existing listings via UPDATE (not INSERT) and
     already respects the cap, so this INSERT-only trigger doesn't interfere.
*/

-- ---------------------------------------------------------------
-- 1. Extend payment_kind CHECK to allow 'pending_payment'.
-- ---------------------------------------------------------------
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_payment_kind_check;
ALTER TABLE listings ADD CONSTRAINT listings_payment_kind_check
  CHECK (payment_kind IS NULL OR payment_kind IN (
    'individual_trial',
    'individual_paid',
    'subscription',
    'admin_granted',
    'legacy_free',
    'pending_payment'
  ));

COMMENT ON COLUMN listings.payment_kind IS
  'Residential-rental monetization classifier. NULL for sale listings or pre-monetization rentals. ''pending_payment'' = wizard "must pay" listing whose Stripe checkout has not completed. See migrations 20260527150100 / 20260527150900.';

-- ---------------------------------------------------------------
-- 2. Final auto_inactivate_old_listings — adds the pending_payment branch (5).
--    Supersedes 150400 / 150700 / 150800.
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
  v_monetization_on boolean;
BEGIN
  SELECT rental_active_days, sale_active_days, COALESCE(monetization_enabled, false)
    INTO v_rental_days, v_sale_days, v_monetization_on
    FROM admin_settings LIMIT 1;

  v_rental_days := COALESCE(v_rental_days, 30);
  v_sale_days := COALESCE(v_sale_days, 30);

  -- Trial-subscription auto-expiry only when monetization is on. Stripe manages
  -- Stripe-backed trials; we only expire no-card admin/SQL trials.
  IF v_monetization_on THEN
    UPDATE listing_subscriptions
    SET status = 'expired',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE status = 'trial'
      AND stripe_subscription_id IS NULL
      AND created_at < NOW() - INTERVAL '14 days';
  END IF;

  WITH to_inactivate AS (
    SELECT l.id FROM listings l
    WHERE l.is_active = true
      AND l.approved = true
      AND (
        -- (1) EXISTING freshness — always applies.
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
        -- (2)-(5) payment-kind branches — gated on flag.
        OR (
          v_monetization_on AND (
            (
              l.listing_type = 'rental'
              AND l.payment_kind = 'individual_trial'
              AND l.trial_started_at IS NOT NULL
              AND l.trial_started_at < NOW() - INTERVAL '14 days'
            )
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'individual_paid'
              AND l.paid_until IS NOT NULL
              AND l.paid_until < NOW()
            )
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'subscription'
              AND NOT EXISTS (
                SELECT 1 FROM listing_subscriptions ls
                WHERE ls.user_id = l.user_id
                  AND ls.status IN ('active', 'admin_active', 'trial')
              )
            )
            -- (5) NEW: never-paid "must pay" listing that slipped through approval.
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'pending_payment'
            )
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
  'Hourly cron. Always enforces freshness. When monetization is on, also deactivates expired trials, exhausted paid balances, gone subscriptions, and never-paid pending_payment listings.';

-- ---------------------------------------------------------------
-- 3. Server-side subscription listing-cap enforcement (BEFORE INSERT).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_subscription_listing_cap()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_monetization_on boolean;
  v_is_admin boolean;
  v_has_sub boolean;
  v_cap integer;
  v_used integer;
BEGIN
  -- Only guard residential rentals tagged as subscription-covered.
  IF NEW.listing_type <> 'rental' OR NEW.payment_kind IS DISTINCT FROM 'subscription' THEN
    RETURN NEW;
  END IF;

  -- Only enforce when monetization is active.
  SELECT COALESCE(monetization_enabled, false) INTO v_monetization_on
    FROM admin_settings LIMIT 1;
  IF NOT v_monetization_on THEN
    RETURN NEW;
  END IF;

  -- Admins are exempt from caps.
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Find the user's covering subscription. NULL listing_cap (VIP) = unlimited,
  -- represented as a large sentinel so the comparison below always passes.
  SELECT
    bool_or(true),
    MAX(CASE WHEN listing_cap IS NULL THEN 2147483647 ELSE listing_cap END)
  INTO v_has_sub, v_cap
  FROM listing_subscriptions
  WHERE user_id = NEW.user_id
    AND status IN ('active', 'admin_active', 'trial');

  IF NOT COALESCE(v_has_sub, false) THEN
    RAISE EXCEPTION 'No active subscription to cover this listing'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Count the user's subscription rentals already consuming a slot: live OR
  -- still pending approval. (The NEW row is not yet inserted.)
  SELECT COUNT(*) INTO v_used
  FROM listings
  WHERE user_id = NEW.user_id
    AND listing_type = 'rental'
    AND payment_kind = 'subscription'
    AND (is_active = true OR approved = false);

  IF v_used >= v_cap THEN
    RAISE EXCEPTION 'Subscription listing cap reached (% of %)', v_used, v_cap
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'enforce_subscription_listing_cap_trg') THEN
    CREATE TRIGGER enforce_subscription_listing_cap_trg
      BEFORE INSERT ON listings
      FOR EACH ROW EXECUTE FUNCTION enforce_subscription_listing_cap();
  END IF;
END $$;

COMMENT ON FUNCTION public.enforce_subscription_listing_cap() IS
  'BEFORE INSERT guard: rejects new subscription-covered residential rentals that exceed the user''s plan cap (Agent=7, VIP=unlimited). Admins exempt; only active when monetization_enabled = true.';
