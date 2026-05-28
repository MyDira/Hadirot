/*
  # Monetization feature flag + safe activation RPC

  Phase J. Lets the admin deploy migrations + code well before launch,
  test internally, then flip a single boolean on launch day to activate
  the whole monetization system in one atomic step.

  Behavior:
    - admin_settings.monetization_enabled (default false).
    - When false: the wizard creates rental listings exactly like today
      (payment_kind=NULL, trial_started_at=NULL). The auto_inactivate
      RPC ignores the new payment-kind branches and only enforces the
      existing freshness window. Dashboard pills, trial banner, and
      monetization modal hide on the client.
    - When true (post enable_monetization()): full system active.

  This migration ALSO supersedes the auto_inactivate_old_listings RPC
  definition from migrations 20260527150400 and 20260527150700. The
  final version now gates conditions (2), (3), (4) on
  monetization_enabled.
*/

-- ---------------------------------------------------------------
-- 1. Feature flag column.
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_settings' AND column_name = 'monetization_enabled'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN monetization_enabled boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_settings' AND column_name = 'monetization_enabled_at'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN monetization_enabled_at timestamptz;
  END IF;
END $$;

COMMENT ON COLUMN admin_settings.monetization_enabled IS
  'Master switch for the residential-rental monetization system. Flipped to true via enable_monetization() RPC on launch day.';
COMMENT ON COLUMN admin_settings.monetization_enabled_at IS
  'When monetization was activated (informational only). Set by enable_monetization().';

-- ---------------------------------------------------------------
-- 2. Activation RPC.
--    Flips the flag and grandfathers existing rentals atomically.
--    Idempotent — safe to call more than once; the listing UPDATEs use
--    `payment_kind IS NULL` guards so they only touch un-tagged rows.
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
  v_legacy integer := 0;
  v_now timestamptz := NOW();
BEGIN
  -- Admin-only.
  SELECT COALESCE(p.is_admin, false) INTO v_caller_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Only admins may call enable_monetization';
  END IF;

  -- Flip the flag.
  UPDATE admin_settings
  SET monetization_enabled = true,
      monetization_enabled_at = COALESCE(monetization_enabled_at, v_now);

  -- Grandfather active rentals into 14-day trial.
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

  -- Tag inactive rentals as legacy_free.
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

  RETURN QUERY SELECT true, v_trialed, v_legacy, v_now;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enable_monetization() TO authenticated;

COMMENT ON FUNCTION public.enable_monetization() IS
  'Admin-only. Flips admin_settings.monetization_enabled to true and grandfathers existing residential rentals (active→individual_trial, inactive→legacy_free). Idempotent — safe to call again, only touches rows with NULL payment_kind.';

-- ---------------------------------------------------------------
-- 3. Optional disable RPC for emergencies.
--    Flips the flag back to false. Does NOT undo grandfather tags
--    (existing payment_kind values stay) so we can re-enable later
--    without retagging.
-- ---------------------------------------------------------------
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

  UPDATE admin_settings SET monetization_enabled = false;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.disable_monetization() TO authenticated;

COMMENT ON FUNCTION public.disable_monetization() IS
  'Admin-only emergency switch. Sets monetization_enabled to false. Does not undo grandfather tags so re-enabling is safe.';

-- ---------------------------------------------------------------
-- 4. Final auto_inactivate_old_listings RPC.
--    Supersedes the earlier versions from 150400 and 150700. The new
--    payment-kind branches (trial expired, paid balance, subscription
--    gone) are SKIPPED when monetization_enabled = false. Existing
--    freshness logic always runs. Trial-subscription auto-expiry only
--    fires when the flag is on.
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

  -- Trial-subscription auto-expiry only when monetization is on.
  IF v_monetization_on THEN
    UPDATE listing_subscriptions
    SET status = 'expired',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE status = 'trial'
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
        -- (2)-(4) NEW payment-kind branches — gated on flag.
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
  'Hourly cron. Always enforces freshness. The new payment-kind branches (trial/paid/subscription) only fire when admin_settings.monetization_enabled = true.';
