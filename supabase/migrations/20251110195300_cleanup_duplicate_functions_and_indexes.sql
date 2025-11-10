/*
  # Cleanup Duplicate Functions and Indexes
  
  ## Issues Found
  1. Duplicate index: ae_on_listing_id_prop and analytics_events_event_props_listing_id_idx
  2. Multiple versions of functions (with and without search_path)
  
  ## Solution
  - Drop older duplicate index (keeping the newer one with WHERE clause)
  - Drop old function versions without search_path settings
*/

-- Drop the duplicate index without WHERE clause (less efficient)
DROP INDEX IF EXISTS ae_on_listing_id_prop;

-- Drop old function versions that don't have search_path set
DROP FUNCTION IF EXISTS has_feature_access(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS create_short_url(text, uuid) CASCADE;

-- Recreate with proper settings if they were accidentally dropped
CREATE OR REPLACE FUNCTION has_feature_access(
  p_profile_id uuid,
  p_feature_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM feature_entitlements
    WHERE profile_id = p_profile_id
      AND feature_name = p_feature_name
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION create_short_url(
  p_original_url text,
  p_created_by uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_short_code text;
BEGIN
  v_short_code := generate_short_code();
  
  INSERT INTO short_urls (short_code, original_url, created_by)
  VALUES (v_short_code, p_original_url, p_created_by);
  
  RETURN v_short_code;
END;
$$;

-- Add comments
COMMENT ON INDEX analytics_events_event_props_listing_id_idx IS 
'Optimized index with WHERE clause for non-null listing IDs in event_props column';

COMMENT ON INDEX analytics_events_props_listing_id_idx IS 
'Index for legacy props column - needed for historical data queries';
