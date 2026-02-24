/*
  # Add metadata column to featured_purchases

  ## Summary
  Adds a jsonb metadata column to the featured_purchases table to support
  tracking the source of a purchase (e.g., 'sms_boost' for purchases originating
  from the SMS upsell flow).

  ## Changes
  - `featured_purchases` table: adds `metadata` (jsonb, nullable, default NULL)

  ## Notes
  - Uses IF NOT EXISTS pattern to be safe on re-run
  - No RLS changes needed — column inherits existing table policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'featured_purchases' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE featured_purchases ADD COLUMN metadata jsonb DEFAULT NULL;
  END IF;
END $$;
