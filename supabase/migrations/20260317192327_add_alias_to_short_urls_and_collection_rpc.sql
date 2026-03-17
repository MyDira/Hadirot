/*
  # Add alias column to short_urls and create collection short URL RPC

  ## Summary
  Fixes two bugs in the WhatsApp digest short URL system:
  1. Collection/browse links were recreated on every digest run (no dedup)
  2. The alias column provides a stable, human-readable key for collection links

  ## Changes

  ### Modified Tables
  - `short_urls`: adds `alias` column (varchar 100, nullable)
    - A partial unique index enforces uniqueness only for non-null aliases
    - Listing links leave alias NULL (no uniqueness restriction on NULLs)
    - Only one row may exist per non-null alias value

  ### New Indexes
  - `short_urls_alias_unique_idx`: partial unique index on alias WHERE alias IS NOT NULL

  ### New Functions
  - `get_or_create_collection_short_url(p_alias, p_original_url, p_source)`:
    - Checks for an existing row with the given alias
    - Returns its short_code if found (idempotent - same code forever for same alias)
    - Creates a new permanent (expires_at = NULL) short URL if not found

  ## Security
  - Function uses SECURITY DEFINER with fixed search_path
  - EXECUTE granted to authenticated and service_role
*/

-- Add alias column (nullable, no default)
ALTER TABLE short_urls
  ADD COLUMN IF NOT EXISTS alias VARCHAR(100) DEFAULT NULL;

-- Partial unique index: enforce uniqueness only for non-null aliases
-- This allows unlimited NULL alias values (listing short URLs) while
-- preventing duplicate collection aliases
CREATE UNIQUE INDEX IF NOT EXISTS short_urls_alias_unique_idx
  ON short_urls (alias)
  WHERE alias IS NOT NULL;

-- RPC: get existing collection short URL by alias, or create a new permanent one
CREATE OR REPLACE FUNCTION get_or_create_collection_short_url(
  p_alias        text,
  p_original_url text,
  p_source       text DEFAULT 'digest_collection'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_existing_code text;
  v_short_code    text;
BEGIN
  -- Return existing short_code for this alias if one already exists
  SELECT short_code INTO v_existing_code
  FROM short_urls
  WHERE alias = p_alias
  LIMIT 1;

  IF v_existing_code IS NOT NULL THEN
    RETURN v_existing_code;
  END IF;

  -- Generate a new unique short code
  v_short_code := generate_short_code();

  -- Insert permanently (expires_at = NULL) with the stable alias
  INSERT INTO short_urls (short_code, original_url, listing_id, source, alias, expires_at)
  VALUES (v_short_code, p_original_url, NULL, p_source, p_alias, NULL);

  RETURN v_short_code;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_collection_short_url(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_collection_short_url(text, text, text) TO service_role;
