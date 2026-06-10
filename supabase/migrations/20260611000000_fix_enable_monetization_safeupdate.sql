/*
  # Fix: enable/disable_monetization vs safeupdate (production-only failure)

  Live Supabase loads the `safeupdate` module on API (PostgREST) connections,
  which rejects any UPDATE without a WHERE clause — including inside functions
  invoked via /rest/v1/rpc. Both monetization switches updated the single-row
  `admin_settings` table with no WHERE clause, so clicking "Activate
  monetization" in the admin panel failed with:

      400 — "UPDATE requires a WHERE clause"

  The failure was atomic (nothing was flipped or tagged). Local Docker does
  not preload safeupdate, which is why every local test passed.

  Fix: add `WHERE id IS NOT NULL` (admin_settings.id is uuid NOT NULL, so the
  predicate matches the one row and satisfies safeupdate). Everything else in
  both functions is unchanged from 20260610000000 — all other UPDATEs already
  carry real WHERE clauses.
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
      monetization_enabled_at = COALESCE(monetization_enabled_at, v_now)
  WHERE id IS NOT NULL;  -- single-row table; predicate satisfies safeupdate

  -- Active rentals, step 1: SINGULAR phones → staggered 14-day trial.
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

  -- Active rentals, step 2: still-untagged actives share a phone → high-volume.
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

  -- Remaining inactive rentals → legacy_free.
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
  'Admin-only launch switch (safeupdate-compatible). Flips monetization_enabled and grandfathers rentals: singular-phone actives → individual_trial staggered over 3 daily cohorts; shared-phone (agent) actives → legacy_free; pending-approval → individual_trial (clock at approval); deactivated → legacy_free. Idempotent.';

CREATE OR REPLACE FUNCTION public.disable_monetization()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_is_admin boolean;
BEGIN
  SELECT COALESCE(p.is_admin, false) INTO v_caller_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Only admins may call disable_monetization';
  END IF;

  UPDATE admin_settings
  SET monetization_enabled = false
  WHERE id IS NOT NULL;  -- single-row table; predicate satisfies safeupdate
END;
$function$;

GRANT EXECUTE ON FUNCTION public.disable_monetization() TO authenticated;

COMMENT ON FUNCTION public.disable_monetization() IS
  'Admin-only emergency switch (safeupdate-compatible). Sets monetization_enabled to false. Does not undo grandfather tags so re-enabling is safe.';
