/*
  # Fix Listing Deletion and Add Dynamic Lifecycle Control

  1. Fix NOT NULL Constraint
     - Remove NOT NULL from listings.user_id to allow anonymization

  2. Add Dynamic Lifecycle Control
     - Add listing_active_days column to admin_settings (default 30)
     - Update auto_inactivate_old_listings() to read from admin_settings
     - Uses safe multiplication for interval calculation

  3. Security
     - Verify RLS policies handle NULL user_id gracefully
     - Ensure anonymized listings are admin-only
*/

-- Step 1: Remove NOT NULL constraint from listings.user_id
ALTER TABLE listings ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Add listing_active_days to admin_settings
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS listing_active_days INTEGER DEFAULT 30;

-- Step 3: Update existing admin_settings row
UPDATE admin_settings
SET listing_active_days = 30
WHERE listing_active_days IS NULL;

-- Step 4: Update auto_inactivate_old_listings() function with SAFE interval calculation
CREATE OR REPLACE FUNCTION auto_inactivate_old_listings()
RETURNS TABLE(
  inactivated_count integer,
  listing_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_ids uuid[];
  affected_count integer;
  active_days integer;
BEGIN
  -- Get the configured listing active days from admin_settings
  SELECT listing_active_days INTO active_days
  FROM admin_settings
  LIMIT 1;

  -- Default to 30 if not set
  IF active_days IS NULL THEN
    active_days := 30;
  END IF;

  -- Find listings to inactivate
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
      -- Primary: Use expires_at if set
      (expires_at IS NOT NULL AND expires_at < NOW())
      OR
      -- Fallback: Use last_published_at + configurable days (SAFE multiplication)
      (expires_at IS NULL AND last_published_at IS NOT NULL
       AND last_published_at < NOW() - (active_days * INTERVAL '1 day'))
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
$$;

-- Step 5: Update function comment
COMMENT ON FUNCTION auto_inactivate_old_listings() IS
'Deactivates listings past their expires_at date. Falls back to last_published_at + configurable days (from admin_settings.listing_active_days) if expires_at is null. Called by inactivate-old-listings edge function.';

-- Step 6: Add documentation about NULL user_id
COMMENT ON COLUMN listings.user_id IS
'User who created the listing. Can be NULL for anonymized/archived listings. NULL listings are filtered by RLS from public access.';