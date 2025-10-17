/*
  # Add deactivated_at column and automatic timestamp trigger

  1. Schema Changes
    - Add `deactivated_at` column to `listings` table
      - Type: timestamptz (nullable)
      - Tracks when a listing was deactivated (manual or automatic)
      - Used to calculate 30-day deletion window
      - Used to determine email template (automatic vs manual)

    - Add composite index for efficient email queries
    - Backfill existing inactive listings with timestamps

  2. Trigger Function
    - `set_listing_deactivated_timestamp()` - automatically manages deactivated_at
    - Sets deactivated_at = NOW() when is_active changes from true to false
    - Clears deactivated_at (sets to NULL) when is_active changes from false to true
    - Ensures consistent timestamp management for all deactivations

  3. Purpose
    - Enables 30-day deletion window based on deactivation date
    - Provides timestamp for email idempotency checks
    - Allows detection of automatic vs manual deactivations
    - Supports renewal cycles with new email notifications

  4. Lifecycle Preservation
    - Auto-inactivation: 30 days after last_published_at
    - Auto-deletion: 30 days after deactivated_at
    - Total lifecycle: 60 days from publish to deletion (UNCHANGED)
*/

-- Add deactivated_at column to listings table
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS deactivated_at timestamptz DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN listings.deactivated_at IS 'Timestamp when listing was deactivated (manual or automatic). Used for deletion window and email notifications.';

-- Update the existing deactivation email index to be more efficient
DROP INDEX IF EXISTS listings_deactivation_email_idx;
CREATE INDEX IF NOT EXISTS listings_deactivation_email_idx
ON listings (is_active, deactivated_at, last_deactivation_email_sent_at)
WHERE is_active = false AND deactivated_at IS NOT NULL;

-- Backfill existing inactive listings with timestamps
-- Use updated_at as best approximation for when they were deactivated
UPDATE listings
SET deactivated_at = updated_at
WHERE is_active = false
  AND deactivated_at IS NULL;

-- Create trigger function to automatically manage deactivated_at timestamp
CREATE OR REPLACE FUNCTION set_listing_deactivated_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If listing is being deactivated (active -> inactive)
  IF OLD.is_active = true AND NEW.is_active = false THEN
    NEW.deactivated_at = NOW();
    RAISE NOTICE 'Listing % deactivated at %', NEW.id, NEW.deactivated_at;
  END IF;

  -- If listing is being reactivated (inactive -> active)
  IF OLD.is_active = false AND NEW.is_active = true THEN
    NEW.deactivated_at = NULL;
    RAISE NOTICE 'Listing % reactivated, cleared deactivated_at', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger that fires before updates to listings table
DROP TRIGGER IF EXISTS listing_deactivation_timestamp_trigger ON listings;
CREATE TRIGGER listing_deactivation_timestamp_trigger
  BEFORE UPDATE ON listings
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION set_listing_deactivated_timestamp();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION set_listing_deactivated_timestamp() TO authenticated;
GRANT EXECUTE ON FUNCTION set_listing_deactivated_timestamp() TO service_role;
