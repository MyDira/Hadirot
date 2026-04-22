/*
  # Add get_user_listing_counts RPC function

  ## Purpose
  Replaces an N+1 query pattern in the admin featured tab where listing counts
  were fetched per-user inside a Promise.all loop (2 queries × N users).
  This function returns all user listing counts in a single round-trip.

  ## New Function
  - `get_user_listing_counts()` — returns one row per user_id with:
    - `listing_count`: total number of listings for that user
    - `featured_count`: active featured listings (is_featured=true AND featured_expires_at > now())

  ## Security
  - SECURITY DEFINER: runs with owner privileges to bypass RLS on listings,
    ensuring counts are always complete regardless of calling context.
    Matches the pattern of get_user_permissions() in 20260417010000_add_get_user_permissions_rpc.sql.
  - SET search_path: prevents search_path hijacking attacks.
  - GRANT TO authenticated only: this is admin-facing data, not needed by anon callers.
  - STABLE: function reads data only, allowing planner optimizations.
*/

CREATE OR REPLACE FUNCTION public.get_user_listing_counts()
RETURNS TABLE(
  user_id uuid,
  listing_count bigint,
  featured_count bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    l.user_id,
    COUNT(*) AS listing_count,
    COUNT(*) FILTER (
      WHERE l.is_featured = true
        AND l.featured_expires_at > now()
    ) AS featured_count
  FROM public.listings l
  GROUP BY l.user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_listing_counts() TO authenticated;
