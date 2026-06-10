/*
  # Stagger grandfathered trial expirations over 3 days

  Product decision (June 10 2026): when monetization activates, every live
  rental enters its 14-day free trial at once — which would make them ALL
  expire (and SMS-blast their owners) in the same hour on day 14.

  This redefines enable_monetization() so active rentals are split into three
  even cohorts with trial_started_at of NOW(), NOW()+1 day, and NOW()+2 days.
  Expirations then land on days 14, 15 and 16, and the trial-reminder SMS
  waves stagger the same way (days 11–16). Nobody's trial is shortened —
  cohorts 2 and 3 simply get 15/16 days instead of exactly 14.

  Everything else matches 20260609000000: pending-approval rentals →
  'individual_trial' with the clock stamped at approval; previously
  deactivated rentals → 'legacy_free'. Idempotent (only touches rows with
  NULL payment_kind).
*/

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

  -- Active rentals → 14-day trial, staggered into three even cohorts
  -- (start now / +1 day / +2 days) so the day-14 expiration cliff spreads
  -- across three days.
  WITH cohorts AS (
    SELECT id, ((ROW_NUMBER() OVER (ORDER BY id)) % 3) AS bucket
    FROM listings
    WHERE listing_type = 'rental'
      AND is_active = true
      AND payment_kind IS NULL
  ),
  t AS (
    UPDATE listings l
    SET payment_kind = 'individual_trial',
        trial_started_at = v_now + (c.bucket * INTERVAL '1 day'),
        updated_at = v_now
    FROM cohorts c
    WHERE l.id = c.id
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_trialed FROM t;

  -- Pending-approval rentals → individual_trial, clock stamped at approval.
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

  -- Remaining inactive rentals (previously live, deactivated) → legacy_free.
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
  'Admin-only launch switch. Flips monetization_enabled and grandfathers rentals: active → individual_trial staggered over 3 daily cohorts (expirations on days 14-16), pending-approval → individual_trial (clock at approval), deactivated → legacy_free. Idempotent.';
