/*
  # Monetization hardening — pre-launch audit fixes (June 2026)

  Six server-side fixes surfaced by the production-readiness audit. Each is
  independent; together they close every known way a residential rental can
  be active without coverage, and every way payment state can be tampered with.

  1. payment_kind default + tamper guard (trigger `zz_monetization_payment_guard`)
     - INSERT (rentals, monetization on):
        • NULL payment_kind no longer slips through (the old listing form at
          /post-old and the admin scraped-listings pipeline never set it).
          Default: admins → 'individual_trial' (admins may post unlimited
          free-trial listings by design); non-admins → 'individual_trial' when
          the contact phone is trial-eligible, else 'pending_payment'.
        • Non-admin inserts may not pre-set trial_started_at / paid_until /
          paused_paid_days, may not claim 'admin_granted'/'legacy_free'/
          'individual_paid', and an explicit 'individual_trial' from an
          ineligible phone is downgraded to 'pending_payment'.
     - UPDATE (rentals, monetization on): non-admin authenticated callers can
       no longer change payment_kind / trial_started_at / paid_until /
       paused_paid_days (RLS "Users can update own listings" allows any column;
       this trigger silently reverts those four). Service-role (webhooks, cron,
       SECURITY DEFINER RPCs) and admins are unaffected.

  2. is_phone_trial_eligible now also counts PENDING listings (approved=false,
     never deactivated, created in the last 30 days). Previously a phone could
     queue unlimited "first free trial" listings while none were yet approved.

  3. enable_monetization(): pending-approval rentals at launch are tagged
     'individual_trial' (clock stamps at approval) instead of falling into the
     inactive→'legacy_free' bucket (which would have made them free forever).

  4. auto_inactivate_old_listings (FINAL — supersedes 20260527150900):
     a. 'past_due' now counts as covered (Stripe dunning grace — the webhook
        maps terminal 'unpaid' to 'expired', which is not covered).
     b. New branch (6): active 'individual_paid' rentals with NO paid_until and
        NO banked days are deactivated. Closes the free-republish loophole
        (republish restored nothing but still granted a 30-day freshness run).
     c. Admin-granted subscriptions roll current_period_end forward monthly so
        the admin "who renews next" sort stays correct.

  5. enforce_subscription_listing_cap: 'past_due' counts as a covering status
     (consistent with 4a).
*/

-- ---------------------------------------------------------------
-- 1. Default + tamper-guard trigger.
--    Two trigger registrations of the same function — ordering matters
--    because BEFORE triggers fire alphabetically:
--      • INSERT guard is named zz_* so it runs AFTER
--        trg_normalize_contact_phone and sees contact_phone_e164 populated
--        for the trial-eligibility check.
--      • UPDATE guard is named aa_* so it runs BEFORE
--        listing_deactivation_timestamp_trigger — the guard reverts
--        user-supplied tampering first, then the lifecycle trigger applies
--        its legitimate paid_until banking/restore on is_active flips.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.monetization_payment_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_monetization_on boolean;
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_eligible boolean;
BEGIN
  -- Only residential rentals are monetized.
  IF NEW.listing_type IS DISTINCT FROM 'rental' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(monetization_enabled, false) INTO v_monetization_on
    FROM admin_settings LIMIT 1;
  IF NOT v_monetization_on THEN
    RETURN NEW;
  END IF;

  -- Service-role / cron / SECURITY DEFINER internals have no auth.uid().
  -- They are trusted writers (stripe-webhook, approve-listing, cascade,
  -- reconcile) — let them through untouched.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
    FROM profiles p WHERE p.id = v_uid;

  IF TG_OP = 'INSERT' THEN
    IF v_is_admin THEN
      -- Admins may post unlimited free-trial listings (by design) through any
      -- form, including /post-old and the scraped-listings pipeline. Default
      -- the kind so no admin path bypasses the payment system.
      IF NEW.payment_kind IS NULL THEN
        NEW.payment_kind := 'individual_trial';
      END IF;
      RETURN NEW;
    END IF;

    -- Non-admin inserts: clocks/balances are only ever set server-side.
    NEW.trial_started_at := NULL;
    NEW.paid_until := NULL;
    NEW.paused_paid_days := 0;

    -- Non-admins cannot claim privileged kinds.
    IF NEW.payment_kind IN ('admin_granted', 'legacy_free', 'individual_paid') THEN
      NEW.payment_kind := NULL;
    END IF;

    IF NEW.payment_kind IS NULL OR NEW.payment_kind = 'individual_trial' THEN
      v_eligible := (
        NEW.contact_phone_e164 IS NULL
        OR is_phone_trial_eligible(NEW.contact_phone_e164)
      );
      NEW.payment_kind := CASE WHEN v_eligible THEN 'individual_trial' ELSE 'pending_payment' END;
    END IF;
    -- 'subscription' is validated separately by enforce_subscription_listing_cap.
    RETURN NEW;
  END IF;

  -- UPDATE: silently revert non-admin changes to monetization columns.
  IF NOT v_is_admin THEN
    NEW.payment_kind := OLD.payment_kind;
    NEW.trial_started_at := OLD.trial_started_at;
    NEW.paid_until := OLD.paid_until;
    NEW.paused_paid_days := OLD.paused_paid_days;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zz_monetization_payment_guard ON listings;
DROP TRIGGER IF EXISTS zz_monetization_payment_guard_ins ON listings;
DROP TRIGGER IF EXISTS aa_monetization_payment_guard_upd ON listings;

CREATE TRIGGER zz_monetization_payment_guard_ins
  BEFORE INSERT ON listings
  FOR EACH ROW EXECUTE FUNCTION monetization_payment_guard();

CREATE TRIGGER aa_monetization_payment_guard_upd
  BEFORE UPDATE ON listings
  FOR EACH ROW
  WHEN (
    OLD.payment_kind IS DISTINCT FROM NEW.payment_kind
    OR OLD.trial_started_at IS DISTINCT FROM NEW.trial_started_at
    OR OLD.paid_until IS DISTINCT FROM NEW.paid_until
    OR OLD.paused_paid_days IS DISTINCT FROM NEW.paused_paid_days
  )
  EXECUTE FUNCTION monetization_payment_guard();

COMMENT ON FUNCTION public.monetization_payment_guard() IS
  'Guard on listings (rentals, monetization on). INSERT (zz_, after phone normalization): defaults payment_kind for paths that skip the wizard (old form, pipeline) — admins → individual_trial, others → trial if phone-eligible else pending_payment. UPDATE (aa_, before the lifecycle trigger): reverts non-admin changes to payment_kind/trial_started_at/paid_until/paused_paid_days. Service-role writers unaffected.';

-- ---------------------------------------------------------------
-- 2. Phone trial eligibility: pending listings count too.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_phone_trial_eligible(p_phone_e164 text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM listings
    WHERE contact_phone_e164 = p_phone_e164
      AND listing_type = 'rental'
      AND (
        is_active = true
        OR (deactivated_at IS NOT NULL AND deactivated_at > NOW() - INTERVAL '30 days')
        -- Pending approval (never deactivated): occupies the phone so a user
        -- can't queue multiple "first free trial" listings before approval.
        OR (
          approved = false
          AND is_active = false
          AND deactivated_at IS NULL
          AND created_at > NOW() - INTERVAL '30 days'
        )
      )
  );
$$;

COMMENT ON FUNCTION is_phone_trial_eligible(text) IS
  'Returns true if the phone has no rental listing active, pending approval (last 30d), or deactivated within the last 30 days. Drives the 14-day free trial gate.';

-- ---------------------------------------------------------------
-- 3. enable_monetization: pending rentals → individual_trial.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enable_monetization()
RETURNS TABLE(
  enabled boolean,
  trialed_count integer,
  legacy_count integer,
  enabled_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_is_admin boolean;
  v_trialed integer := 0;
  v_pending integer := 0;
  v_legacy integer := 0;
  v_now timestamptz := NOW();
BEGIN
  SELECT COALESCE(p.is_admin, false) INTO v_caller_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Only admins may call enable_monetization';
  END IF;

  UPDATE admin_settings
  SET monetization_enabled = true,
      monetization_enabled_at = COALESCE(monetization_enabled_at, v_now);

  -- Active rentals → 14-day trial starting now.
  WITH t AS (
    UPDATE listings
    SET payment_kind = 'individual_trial',
        trial_started_at = v_now,
        updated_at = v_now
    WHERE listing_type = 'rental'
      AND is_active = true
      AND payment_kind IS NULL
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_trialed FROM t;

  -- Pending-approval rentals (never deactivated) → individual_trial with NO
  -- trial_started_at; approve-listing stamps the clock at approval. Without
  -- this they'd fall into the legacy_free bucket below and post free forever.
  WITH p AS (
    UPDATE listings
    SET payment_kind = 'individual_trial',
        updated_at = v_now
    WHERE listing_type = 'rental'
      AND is_active = false
      AND approved = false
      AND deactivated_at IS NULL
      AND payment_kind IS NULL
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_pending FROM p;

  -- Remaining inactive rentals (previously live, now deactivated) → legacy_free.
  WITH l AS (
    UPDATE listings
    SET payment_kind = 'legacy_free',
        updated_at = v_now
    WHERE listing_type = 'rental'
      AND is_active = false
      AND payment_kind IS NULL
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_legacy FROM l;

  RETURN QUERY SELECT true, v_trialed + v_pending, v_legacy, v_now;
END;
$function$;

COMMENT ON FUNCTION public.enable_monetization() IS
  'Admin-only launch switch. Flips monetization_enabled and grandfathers rentals: active → individual_trial (clock now), pending-approval → individual_trial (clock at approval), deactivated → legacy_free. Idempotent.';

-- ---------------------------------------------------------------
-- 4. auto_inactivate_old_listings FINAL (supersedes 20260527150900).
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

  IF v_monetization_on THEN
    -- Expire no-card (admin/SQL) trial subscriptions after 14 days. Stripe
    -- manages Stripe-backed trials.
    UPDATE listing_subscriptions
    SET status = 'expired',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE status = 'trial'
      AND stripe_subscription_id IS NULL
      AND created_at < NOW() - INTERVAL '14 days';

    -- Roll admin-granted renewal anchors forward to the next occurrence of
    -- billing_day_of_month so the admin "who renews next" sort stays honest.
    UPDATE listing_subscriptions
    SET current_period_end = CASE
          WHEN date_trunc('month', NOW()) + ((billing_day_of_month - 1) * INTERVAL '1 day') > NOW()
            THEN date_trunc('month', NOW()) + ((billing_day_of_month - 1) * INTERVAL '1 day')
          ELSE date_trunc('month', NOW() + INTERVAL '1 month') + ((billing_day_of_month - 1) * INTERVAL '1 day')
        END,
        updated_at = NOW()
    WHERE status = 'admin_active'
      AND billing_day_of_month IS NOT NULL
      AND current_period_end IS NOT NULL
      AND current_period_end < NOW();
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
        -- (2)-(6) payment-kind branches — gated on flag.
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
            -- (4) subscription no longer covering. 'past_due' stays covered
            -- (Stripe dunning grace); the webhook maps terminal 'unpaid' to
            -- 'expired', which is not in this list.
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'subscription'
              AND NOT EXISTS (
                SELECT 1 FROM listing_subscriptions ls
                WHERE ls.user_id = l.user_id
                  AND ls.status IN ('active', 'admin_active', 'trial', 'past_due')
              )
            )
            -- (5) never-paid "must pay" listing that slipped through approval.
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'pending_payment'
            )
            -- (6) paid listing with no balance left AND nothing banked — e.g.
            -- republished after its paid days ran out. Without this branch a
            -- free republish bought 30 fresh days on an exhausted listing.
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'individual_paid'
              AND l.paid_until IS NULL
              AND COALESCE(l.paused_paid_days, 0) <= 0
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
  'Hourly cron. Always enforces freshness. When monetization is on: expires no-card trials, rolls admin-granted renewal anchors, and deactivates expired trials, exhausted/empty paid balances, uncovered subscription listings (past_due = still covered), and never-paid pending_payment listings.';

-- ---------------------------------------------------------------
-- 5. Cap trigger: past_due counts as covering (matches 4a).
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
  IF NEW.listing_type <> 'rental' OR NEW.payment_kind IS DISTINCT FROM 'subscription' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(monetization_enabled, false) INTO v_monetization_on
    FROM admin_settings LIMIT 1;
  IF NOT v_monetization_on THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  SELECT
    bool_or(true),
    MAX(CASE WHEN listing_cap IS NULL THEN 2147483647 ELSE listing_cap END)
  INTO v_has_sub, v_cap
  FROM listing_subscriptions
  WHERE user_id = NEW.user_id
    AND status IN ('active', 'admin_active', 'trial', 'past_due');

  IF NOT COALESCE(v_has_sub, false) THEN
    RAISE EXCEPTION 'No active subscription to cover this listing'
      USING ERRCODE = 'check_violation';
  END IF;

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
