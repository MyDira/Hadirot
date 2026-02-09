/*
  # Add Sponsored Boost System Columns

  1. Modified Tables
    - `listings`
      - `featured_started_at` (timestamptz, nullable) - tracks when the boost began, used for rotation ordering
      - `featured_plan` (text, nullable) - stores plan type ('7day', '14day', '30day'), informational only
    - `admin_settings`
      - `max_featured_boost_positions` (integer, default 4) - controls injection points per search page

  2. Backfill
    - Sets `featured_started_at` for currently active featured listings using `featured_expires_at - interval`

  3. Important Notes
    - No tables created or dropped
    - No existing columns modified or removed
    - Safe IF NOT EXISTS guards on all alterations
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'featured_started_at'
  ) THEN
    ALTER TABLE listings ADD COLUMN featured_started_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'featured_plan'
  ) THEN
    ALTER TABLE listings ADD COLUMN featured_plan text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_settings' AND column_name = 'max_featured_boost_positions'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN max_featured_boost_positions integer DEFAULT 4;
  END IF;
END $$;

UPDATE listings
SET featured_started_at = featured_expires_at - interval '7 days'
WHERE is_featured = true
  AND featured_expires_at IS NOT NULL
  AND featured_started_at IS NULL;
