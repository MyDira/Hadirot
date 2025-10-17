/*
  # Create automatic listing lifecycle functions

  1. Functions
    - `auto_inactivate_old_listings()` - Deactivates listings after 30 days
    - `auto_delete_very_old_listings()` - Deletes listings 30 days after deactivation

  2. Lifecycle Stages
    - Stage 1: Listing is active (posted/renewed)
    - Stage 2: After 30 days from last_published_at -> auto-deactivate (becomes inactive)
    - Stage 3: After 30 days from deactivated_at -> auto-delete (permanently removed)
    - Total: 60 days from publish to permanent deletion

  3. Auto-Inactivation Logic
    - Finds listings older than 30 days based on last_published_at
    - Only affects active listings
    - Sets is_active = false
    - Trigger automatically sets deactivated_at timestamp
    - Email notification sent by separate edge function

  4. Auto-Deletion Logic
    - Finds listings deactivated more than 30 days ago
    - Only affects inactive listings with deactivated_at set
    - Permanently deletes listings (CASCADE handles related data)
    - No email notification (already notified at deactivation)

  5. Security
    - SECURITY DEFINER allows service role to execute
    - Functions designed to be called by edge functions
    - Returns count for logging and monitoring
*/

-- Create auto-inactivation function (30 days after publishing/renewal)
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
BEGIN
  -- Find and update listings that are older than 30 days
  WITH updated_listings AS (
    UPDATE listings
    SET
      is_active = false,
      updated_at = NOW()
    WHERE
      is_active = true
      AND last_published_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT
    array_agg(id),
    COUNT(*)::integer
  INTO
    affected_ids,
    affected_count
  FROM updated_listings;

  -- Handle case where no listings were updated
  IF affected_ids IS NULL THEN
    affected_ids := ARRAY[]::uuid[];
    affected_count := 0;
  END IF;

  -- Log the operation
  RAISE NOTICE 'Auto-inactivated % listings: %', affected_count, affected_ids;

  -- Return results
  RETURN QUERY SELECT affected_count, affected_ids;
END;
$$;

-- Create auto-deletion function (30 days after deactivation)
CREATE OR REPLACE FUNCTION auto_delete_very_old_listings()
RETURNS TABLE(
  deleted_count integer,
  listing_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_ids uuid[];
  affected_count integer;
BEGIN
  -- Collect IDs of listings to be deleted for logging
  SELECT
    array_agg(id),
    COUNT(*)::integer
  INTO
    affected_ids,
    affected_count
  FROM listings
  WHERE
    is_active = false
    AND deactivated_at IS NOT NULL
    AND deactivated_at < NOW() - INTERVAL '30 days';

  -- Handle case where no listings match criteria
  IF affected_ids IS NULL THEN
    affected_ids := ARRAY[]::uuid[];
    affected_count := 0;
  ELSE
    -- Delete the listings (CASCADE will handle related images, favorites, etc.)
    DELETE FROM listings
    WHERE id = ANY(affected_ids);
  END IF;

  -- Log the operation
  RAISE NOTICE 'Auto-deleted % listings: %', affected_count, affected_ids;

  -- Return results
  RETURN QUERY SELECT affected_count, affected_ids;
END;
$$;

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION auto_inactivate_old_listings() TO service_role;
GRANT EXECUTE ON FUNCTION auto_delete_very_old_listings() TO service_role;

-- Add comments for documentation
COMMENT ON FUNCTION auto_inactivate_old_listings() IS 'Deactivates listings that are 30+ days old based on last_published_at. Called by inactivate-old-listings edge function.';
COMMENT ON FUNCTION auto_delete_very_old_listings() IS 'Permanently deletes listings that have been inactive for 30+ days based on deactivated_at. Called by delete-old-listings edge function.';
