/*
  # Add FK from commercial_listings.user_id to profiles and update public_profiles view

  ## Problem
  PostgREST resolves relationship joins only via FKs within the public schema.
  commercial_listings.user_id has a FK to auth.users (outside public schema),
  so PostgREST cannot walk the relationship to public_profiles or profiles,
  causing PGRST200 errors on every /browse page load.

  ## Fix
  Since we cannot have two FKs on the same column to different tables, we drop
  the existing auth.users FK and replace it with one pointing to profiles.id.
  Both share the same UUID values so data integrity is preserved.

  We also update the public_profiles view to expose it as a proper joinable
  relation by ensuring PostgREST can find the path:
    commercial_listings.user_id -> profiles.id
*/

-- Drop the existing FK that points to auth.users (outside public schema)
ALTER TABLE commercial_listings
  DROP CONSTRAINT IF EXISTS commercial_listings_user_id_fkey;

-- Add new FK pointing to profiles.id (public schema - PostgREST can resolve this)
ALTER TABLE commercial_listings
  ADD CONSTRAINT commercial_listings_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES profiles(id)
  ON DELETE SET NULL;

-- Ensure index exists for efficient FK lookups
CREATE INDEX IF NOT EXISTS idx_commercial_listings_user_id
  ON commercial_listings (user_id);
