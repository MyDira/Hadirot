/*
  # Add foreign key from commercial_listings to public_profiles

  ## Problem
  PostgREST requires an explicit FK constraint to resolve relationship joins like
  `owner:public_profiles(...)`. This constraint was missing on `commercial_listings`,
  causing error PGRST200 on every browse page load (156+ events in Sentry).

  ## Changes
  - Adds FK constraint on `commercial_listings.user_id` → `public_profiles.id`
  - Uses ON DELETE SET NULL so deleting a profile does not cascade-delete listings
  - Adds a btree index on `user_id` to support the FK lookup efficiently
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'commercial_listings_user_id_fkey'
      AND table_name = 'commercial_listings'
  ) THEN
    ALTER TABLE commercial_listings
      ADD CONSTRAINT commercial_listings_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public_profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commercial_listings_user_id
  ON commercial_listings (user_id);
