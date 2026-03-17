/*
  # Split listing_active_days into rental and sale settings

  1. Schema Changes
    - `admin_settings` table: add `rental_active_days` (integer, default 30)
    - `admin_settings` table: add `sale_active_days` (integer, default 30)
    - Migrate existing `listing_active_days` value into both new columns
    - Keep `listing_active_days` column for backward compatibility (not dropped)

  2. Function Changes
    - `set_listing_deactivated_timestamp()` trigger: reads rental_active_days or sale_active_days based on listing_type
    - `auto_inactivate_old_listings()` cron function: uses per-listing-type active_days via CASE expression

  3. Important Notes
    - The in_contract hardcoded 42 days is preserved (unchanged)
    - The guard clause protecting application-provided future expires_at is preserved
    - SMS renewal +14 day extension is NOT affected
*/

-- Add new columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_settings' AND column_name = 'rental_active_days'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN rental_active_days integer DEFAULT 30;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_settings' AND column_name = 'sale_active_days'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN sale_active_days integer DEFAULT 30;
  END IF;
END $$;

-- Migrate existing listing_active_days value into both new columns
UPDATE admin_settings
SET
  rental_active_days = COALESCE(listing_active_days, 30),
  sale_active_days = COALESCE(listing_active_days, 30)
WHERE rental_active_days = 30 AND sale_active_days = 30 AND listing_active_days IS NOT NULL AND listing_active_days != 30;

-- Update the reactivation trigger to use per-type active days
CREATE OR REPLACE FUNCTION public.set_listing_deactivated_timestamp()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_rental_days integer;
  v_sale_days integer;
  v_active_days integer;
BEGIN
  -- Deactivation branch (active -> inactive)
  IF OLD.is_active = true AND NEW.is_active = false THEN
    NEW.deactivated_at = NOW();
  END IF;

  -- Reactivation branch (inactive -> active)
  IF OLD.is_active = false AND NEW.is_active = true THEN
    NEW.deactivated_at = NULL;
    NEW.last_published_at = NOW();

    -- Only compute a fresh expires_at when the UPDATE did not already supply
    -- a future value. This lets SMS renewal (+14 days) and manual renewals
    -- preserve their own expires_at calculations rather than being overwritten.
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
  END IF;

  RETURN NEW;
END;
$function$;

-- Update auto_inactivate to use per-type active days
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
  -- Get the configured listing active days from admin_settings
  SELECT rental_active_days, sale_active_days
    INTO v_rental_days, v_sale_days
    FROM admin_settings LIMIT 1;

  -- Default to 30 if not set
  v_rental_days := COALESCE(v_rental_days, 30);
  v_sale_days := COALESCE(v_sale_days, 30);

  -- Find listings to inactivate
  -- Effective expiration = GREATEST(expires_at, last_published_at + active_days)
  -- active_days is determined per listing based on listing_type
  SELECT
    array_agg(id),
    COUNT(*)::integer
  INTO
    affected_ids,
    affected_count
  FROM listings
  WHERE
    is_active = true
    AND approved = true
    AND (
      -- Both dates are set: use whichever grants the longer active period
      (
        expires_at IS NOT NULL
        AND last_published_at IS NOT NULL
        AND GREATEST(
          expires_at,
          last_published_at + (
            CASE WHEN listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
            * INTERVAL '1 day'
          )
        ) < NOW()
      )
      OR
      -- Only expires_at is set (no last_published_at)
      (
        expires_at IS NOT NULL
        AND last_published_at IS NULL
        AND expires_at < NOW()
      )
      OR
      -- Only last_published_at is set (no expires_at)
      (
        expires_at IS NULL
        AND last_published_at IS NOT NULL
        AND last_published_at < NOW() - (
          CASE WHEN listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
          * INTERVAL '1 day'
        )
      )
    );

  IF affected_ids IS NULL OR affected_count = 0 THEN
    affected_ids := ARRAY[]::uuid[];
    affected_count := 0;
  ELSE
    UPDATE listings
    SET
      is_active = false,
      deactivated_at = NOW(),
      updated_at = NOW()
    WHERE id = ANY(affected_ids);
  END IF;

  RETURN QUERY SELECT affected_count, affected_ids;
END;
$function$;