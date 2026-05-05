/*
  # Add get_distinct_agency_names function

  ## Summary
  Creates a SECURITY DEFINER function that returns distinct agency names from the
  profiles table matching a search string. This bypasses RLS so it can be called
  by both unauthenticated users (signup form) and authenticated users (settings tab)
  for agency name autocomplete.

  ## New Functions
  - `get_distinct_agency_names(search_text text)` - returns up to 8 distinct agency
    names from profiles.agency that case-insensitively contain the search string

  ## Security Notes
  - SECURITY DEFINER is intentional: only exposes agency names (not PII), needed
    because profiles RLS has no cross-user read policy
  - Grants EXECUTE to anon (signup) and authenticated (settings) roles
  - Empty or null search returns empty array
*/

CREATE OR REPLACE FUNCTION public.get_distinct_agency_names(search_text text)
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT agency
      FROM profiles
      WHERE agency IS NOT NULL
        AND agency != ''
        AND agency ILIKE '%' || search_text || '%'
      ORDER BY agency
      LIMIT 8
    ),
    '{}'::text[]
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_distinct_agency_names(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_distinct_agency_names(text) TO authenticated;
