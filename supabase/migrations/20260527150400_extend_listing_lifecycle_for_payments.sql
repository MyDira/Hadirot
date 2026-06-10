/*
  # Extend listing lifecycle functions for monetization

  Two surgical changes to existing functions. Existing freshness logic is preserved
  exactly; the new logic is layered alongside.

  1. `set_listing_deactivated_timestamp()` trigger
     Existing behavior preserved:
      - On active → inactive: set deactivated_at = NOW().
      - On inactive → active: clear deactivated_at, set last_published_at = NOW(),
        compute fresh expires_at if not supplied (per-listing-type via admin_settings).
     New behavior:
      - On active → inactive for residential rentals with payment_kind='individual_paid'
        and a future paid_until: bank the remaining days into paused_paid_days and
        clear paid_until.
      - On inactive → active for residential rentals with payment_kind='individual_paid'
        and paused_paid_days > 0: restore paid_until = NOW() + paused_paid_days days,
        clear paused_paid_days, and clamp expires_at to <= paid_until.

  2. `auto_inactivate_old_listings()` RPC
     Existing behavior preserved: deactivate listings past their freshness window
     (per-type active_days from admin_settings).
     New behavior (residential rentals only): also deactivate when
      - payment_kind='individual_trial' and trial_started_at < NOW() - interval '14 days'
      - payment_kind='individual_paid'  and paid_until < NOW()
      - payment_kind='subscription'     and the user has no active listing_subscriptions row

     The subscription condition is the SAFETY NET; the primary cascade is the Stripe
     webhook's cascade-deactivate-subscription edge fn. This catches missed cascades
     within 24h.

  3. Notes
    - The trigger is responsible for atomically banking paid days on deactivation.
      This means the RPC's UPDATE statement (single SET is_active=false) automatically
      triggers the bank, so paid days are never lost to race conditions.
    - For trial listings being deactivated by the RPC, the trigger has no pause action
      (trials don't accrue banked days). The listing simply becomes inactive.
*/

-- =============================================================
-- Extended trigger function
-- =============================================================
CREATE OR REPLACE FUNCTION public.set_listing_deactivated_timestamp()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_rental_days integer;
  v_sale_days integer;
BEGIN
  -- Deactivation branch (active -> inactive)
  IF OLD.is_active = true AND NEW.is_active = false THEN
    NEW.deactivated_at = NOW();

    -- Bank remaining paid days for residential rentals.
    IF NEW.listing_type = 'rental'
       AND NEW.payment_kind = 'individual_paid'
       AND NEW.paid_until IS NOT NULL
       AND NEW.paid_until > NOW() THEN
      NEW.paused_paid_days = GREATEST(
        0,
        CEIL(EXTRACT(EPOCH FROM (NEW.paid_until - NOW())) / 86400.0)::int
      );
      NEW.paid_until = NULL;
    END IF;
  END IF;

  -- Reactivation branch (inactive -> active)
  IF OLD.is_active = false AND NEW.is_active = true THEN
    NEW.deactivated_at = NULL;
    NEW.last_published_at = NOW();

    -- Restore banked paid days BEFORE computing expires_at, so the clamp below uses
    -- the restored paid_until.
    IF NEW.listing_type = 'rental'
       AND NEW.payment_kind = 'individual_paid'
       AND COALESCE(NEW.paused_paid_days, 0) > 0 THEN
      NEW.paid_until = NOW() + (NEW.paused_paid_days || ' days')::interval;
      NEW.paused_paid_days = 0;
    END IF;

    -- Existing freshness logic: compute expires_at if caller didn't supply one.
    IF NEW.expires_at IS NULL OR NEW.expires_at <= NOW() THEN
      SELECT rental_active_days, sale_active_days
        INTO v_rental_days, v_sale_days
        FROM admin_settings LIMIT 1;

      v_rental_days := COALESCE(v_rental_days, 30);
      v_sale_days := COALESCE(v_sale_days, 30);

      IF NEW.listing_type = 'sale' AND NEW.sale_status = 'in_contract' THEN
        NEW.expires_at = NOW() + INTERVAL '42 days';
      ELSIF NEW.listing_type = 'sale' THEN
        NEW.expires_at = NOW() + (v_sale_days * INTERVAL '1 day');
      ELSE
        NEW.expires_at = NOW() + (v_rental_days * INTERVAL '1 day');
      END IF;
    END IF;

    -- Clamp expires_at to paid_until for paid rentals — the freshness cap can never
    -- exceed the paid balance window.
    IF NEW.listing_type = 'rental'
       AND NEW.payment_kind = 'individual_paid'
       AND NEW.paid_until IS NOT NULL
       AND NEW.expires_at IS NOT NULL
       AND NEW.expires_at > NEW.paid_until THEN
      NEW.expires_at = NEW.paid_until;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- =============================================================
-- Extended auto_inactivate RPC
-- =============================================================
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
  SELECT rental_active_days, sale_active_days
    INTO v_rental_days, v_sale_days
    FROM admin_settings LIMIT 1;

  v_rental_days := COALESCE(v_rental_days, 30);
  v_sale_days := COALESCE(v_sale_days, 30);

  WITH to_inactivate AS (
    SELECT l.id FROM listings l
    WHERE l.is_active = true
      AND l.approved = true
      AND (
        -- (1) EXISTING freshness logic, unchanged
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
        -- (2) NEW: trial expired (residential rentals only)
        OR (
          l.listing_type = 'rental'
          AND l.payment_kind = 'individual_trial'
          AND l.trial_started_at IS NOT NULL
          AND l.trial_started_at < NOW() - INTERVAL '14 days'
        )
        -- (3) NEW: paid balance exhausted (residential rentals only)
        OR (
          l.listing_type = 'rental'
          AND l.payment_kind = 'individual_paid'
          AND l.paid_until IS NOT NULL
          AND l.paid_until < NOW()
        )
        -- (4) NEW: subscription no longer active (safety net for missed cascade)
        OR (
          l.listing_type = 'rental'
          AND l.payment_kind = 'subscription'
          AND NOT EXISTS (
            SELECT 1 FROM listing_subscriptions ls
            WHERE ls.user_id = l.user_id
              AND ls.status IN ('active', 'admin_active')
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
    -- The trigger handles paused_paid_days banking automatically for paid rentals.
    UPDATE listings
    SET is_active = false,
        updated_at = NOW()
    WHERE id = ANY(affected_ids);
  END IF;

  RETURN QUERY SELECT affected_count, affected_ids;
END;
$function$;

COMMENT ON FUNCTION public.set_listing_deactivated_timestamp() IS
  'Trigger function that manages is_active transitions: deactivated_at timestamp, expires_at freshness window, and (new) paid_until banking via paused_paid_days for individual_paid residential rentals.';
COMMENT ON FUNCTION public.auto_inactivate_old_listings() IS
  'Hourly cron. Deactivates listings past freshness AND (new) residential rentals whose trial expired, paid balance ran out, or subscription is gone (safety net).';
