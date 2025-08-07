/*
  # Add views column to listings table

  1. Changes
    - Add `views` column to `listings` table with default value of 0
    - This will track how many times each listing has been viewed

  2. Notes
    - Uses integer type for view count
    - Default value ensures existing listings start with 0 views
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'views'
  ) THEN
    ALTER TABLE listings ADD COLUMN views integer DEFAULT 0;
  END IF;
END $$;