/*
  # Grandfathering v2 — split by phone volume, stagger trials over 3 days

  Product decisions (June 10 2026):

  1. SINGULAR listings (no other currently-active rental shares the same
     contact phone) → 14-day free trial with the SMS payment links, staggered
     into three even daily cohorts (trial_started_at = now / +1d / +2d) so
     expirations land on days 14–16 instead of one cliff.

  2. HIGH-VOLUME listings (two or more active rentals share a contact phone —
     almost certainly an agent) → tagged 'legacy_free' and left exactly as
     they behave today: the freshness window from the admin panel
     (admin_settings.rental_active_days) keeps governing deactivation, no
     payment is ever demanded, no trial SMS fires. The admin converts these
     accounts to subscriptions manually.

  Unchanged from 20260609000000:
   - Pending-approval rentals → 'individual_trial' (clock stamps at approval).
   - Previously-deactivated rentals → 'legacy_free'.
   - Idempotent: only rows with NULL payment_kind are touched.

  The return signature gains high_volume_count, so the old function is
  dropped first (CREATE OR REPLACE cannot change OUT parameters).
*/

DROP FUNCTION IF EXISTS public.enable_monetization();

CREATE FUNCTION public.enable_monetization()
RETURNS TABLE(
  enabled boolean,
  trialed_count integer,
  high_volume_count integer,
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
  v_high_volume integer := 0;
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

  -- ------------------------------------------------------------------
  -- Active rentals, step 1: SINGULAR phones → staggered 14-day trial.
  -- A listing is singular when its contact_phone_e164 is NULL or appears
  -- on no other currently-active untagged rental.
  -- ------------------------------------------------------------------
  WITH active_rentals AS (
    SELECT id, contact_phone_e164
    FROM listings
    WHERE listing_type = 'rental'
      AND is_active = true
      AND payment_kind IS NULL
  ),
  multi_phones AS (
    SELECT contact_phone_e164
    FROM active_rentals
    WHERE contact_phone_e164 IS NOT NULL
    GROUP BY contact_phone_e164
    HAVING COUNT(*) >= 2
  ),
  singles AS (
    SELECT ar.id,
           ((ROW_NUMBER() OVER (ORDER BY ar.id)) % 3) AS bucket
    FROM active_rentals ar
    WHERE ar.contact_phone_e164 IS NULL
       OR ar.contact_phone_e164 NOT IN (SELECT mp.contact_phone_e164 FROM multi_phones mp)
  ),
  t AS (
    UPDATE listings l
    SET payment_kind = 'individual_trial',
        trial_started_at = v_now + (s.bucket * INTERVAL '1 day'),
        updated_at = v_now
    FROM singles s
    WHERE l.id = s.id
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_trialed FROM t;

  -- ------------------------------------------------------------------
  -- Active rentals, step 2: everything still untagged shares a phone with
  -- another active rental → high-volume lister, leave behavior as today.
  -- 'legacy_free' = freshness window only (admin panel days), never
  -- payment-blocked, no trial SMS.
  -- ------------------------------------------------------------------
  WITH hv AS (
    UPDATE listings
    SET payment_kind = 'legacy_free',
        updated_at = v_now
    WHERE listing_type = 'rental'
      AND is_active = true
      AND payment_kind IS NULL
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_high_volume FROM hv;

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

  RETURN QUERY SELECT true, v_trialed + v_pending, v_high_volume, v_legacy, v_now;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enable_monetization() TO authenticated;

COMMENT ON FUNCTION public.enable_monetization() IS
  'Admin-only launch switch. Flips monetization_enabled and grandfathers rentals: singular-phone actives → individual_trial staggered over 3 daily cohorts; shared-phone (high-volume/agent) actives → legacy_free (freshness-only, as today); pending-approval → individual_trial (clock at approval); deactivated → legacy_free. Idempotent.';
