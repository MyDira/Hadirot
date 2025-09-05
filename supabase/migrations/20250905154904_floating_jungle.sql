/*
  # Fix analytics_top_listings function with qualified listing_id references

  1. Function Updates
    - Drop and recreate analytics_top_listings function
    - Fully qualify all listing_id references with table aliases
    - Maintain existing OUT columns and types
    - Keep America/New_York timezone handling
    - Preserve DISTINCT pre-aggregation and TEXT key logic

  2. Security
    - Maintain SECURITY DEFINER and search_path settings
    - Keep existing GRANT permissions

  3. Testing
    - Include sanity check query at end
*/

-- First, get the current function definition to preserve exact OUT columns
-- This will help us maintain compatibility with the frontend

-- Drop the existing function using a DO block to avoid IF EXISTS issues
DO $$
BEGIN
  IF to_regprocedure('public.analytics_top_listings(integer,integer)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION public.analytics_top_listings(integer,integer)';
  END IF;
END$$;

-- Recreate the function with fully qualified listing_id references
CREATE FUNCTION public.analytics_top_listings(days_back integer, limit_count integer)
RETURNS TABLE (
  listing_id uuid,
  views integer,
  impressions integer,
  ctr numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH bounds AS (
  SELECT
    (date(timezone('America/New_York', now()))
     - make_interval(days => GREATEST(days_back, 0))) AS start_d,
    date(timezone('America/New_York', now()))           AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    (e.props->>'listing_id')::uuid AS listing_id,  -- Extract from props and cast to uuid
    /* normalize unique key to TEXT */
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
  WHERE e.props->>'listing_id' IS NOT NULL  -- Only events with listing_id
),
dedup AS (
  -- Include listing_id in the dedup so we can group by it later without ambiguity
  SELECT DISTINCT eir.id, eir.event_name, eir.key_text, eir.listing_id
  FROM events_in_range eir
),
agg AS (
  SELECT
    d.listing_id,  -- QUALIFIED with alias
    COUNT(*) FILTER (WHERE d.event_name = 'listing_view')::int                    AS views,
    COUNT(*) FILTER (WHERE d.event_name = 'listing_impression')::int             AS impressions,
    COUNT(*) FILTER (WHERE d.event_name = 'listing_click')::int                  AS clicks
  FROM dedup d
  WHERE d.listing_id IS NOT NULL  -- Extra safety check
  GROUP BY d.listing_id  -- QUALIFIED with alias
),
with_ctr AS (
  SELECT
    a.listing_id,   -- QUALIFIED with alias
    a.views,
    a.impressions,
    CASE
      WHEN a.impressions > 0 THEN ROUND((a.clicks::numeric / a.impressions::numeric) * 100, 2)
      ELSE 0::numeric
    END AS ctr
  FROM agg a
)
SELECT
  wc.listing_id,     -- QUALIFIED with alias - choose ONE source of truth
  wc.views,
  wc.impressions,
  wc.ctr
FROM with_ctr wc
ORDER BY wc.views DESC NULLS LAST  -- QUALIFIED with alias
LIMIT GREATEST(limit_count, 1);
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.analytics_top_listings(integer,integer) TO anon, authenticated, service_role;

-- Sanity check (non-blocking test)
SELECT 'Testing analytics_top_listings function...' AS test_status;
SELECT * FROM public.analytics_top_listings(0, 10);