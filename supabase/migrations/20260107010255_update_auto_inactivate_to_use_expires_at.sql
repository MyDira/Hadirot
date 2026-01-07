/*
  # Update Auto-Inactivate Function to Use expires_at

  ## Overview
  This migration updates the auto_inactivate_old_listings() function to use the
  explicit expires_at field instead of computing expiration from last_published_at.
  This enables support for different lifecycle durations for rentals vs sales listings.

  ## Changes
    - Modified auto_inactivate_old_listings() to check expires_at < NOW()
    - Simplified logic since expiration is now explicitly tracked
    - Works uniformly for both rental and sale listings

  ## Behavior
    - Listings with expires_at < NOW() are deactivated
    - Sets deactivated_at timestamp for tracking
    - Handles null expires_at gracefully (falls back to last_published_at + 30 days)
    - Returns count and IDs of affected listings

  ## Notes
    - Rental listings: 30-day default lifecycle
    - Sales listings: Varies by status (14 days for available/pending, 42 for in_contract, 30 for sold)
    - All expiration logic is now in the application layer via expires_at field
*/

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
      (expires_at IS NOT NULL AND expires_at < NOW())
      OR
      (expires_at IS NULL AND last_published_at IS NOT NULL AND last_published_at < NOW() - INTERVAL '30 days')
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

COMMENT ON FUNCTION auto_inactivate_old_listings() IS 'Deactivates listings past their expires_at date. Falls back to last_published_at + 30 days if expires_at is null. Called by inactivate-old-listings edge function.';
