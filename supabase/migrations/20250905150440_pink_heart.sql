/*
  # Fix Analytics RPC Type Mismatches via Rename-Swap

  1. Inspection
     - Query current function signatures and OUT columns
     - Identify exact return types the frontend expects

  2. Rename-Swap Strategy
     - Rename existing functions to _legacy variants
     - Create new functions with canonical names and same OUT columns
     - Apply all type safety fixes in new function bodies

  3. Core Fixes Applied
     - Cast all COALESCE components to TEXT: key_text
     - Use America/New_York timezone for today-only filtering
     - Pre-aggregate with DISTINCT to avoid JOIN inflation
     - Ensure one-row return for analytics_summary
     - Safe abandoned calculation (non-negative)

  4. Security
     - All functions use SECURITY DEFINER with SET search_path=public
     - Grant execute permissions to anon, authenticated, service_role
*/

-- Step 1: Inspect current signatures (for reference)
-- This will show us what we're working with
SELECT proname, oid::regprocedure AS signature
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('analytics_summary','analytics_top_listings','analytics_top_filters');

-- Step 2: Rename existing functions to avoid 42P13 errors
ALTER FUNCTION public.analytics_summary(integer) RENAME TO analytics_summary_legacy_20250105;
ALTER FUNCTION public.analytics_top_listings(integer, integer) RENAME TO analytics_top_listings_legacy_20250105;
ALTER FUNCTION public.analytics_top_filters(integer, integer) RENAME TO analytics_top_filters_legacy_20250105;

-- Step 3: Create new analytics_summary with standard dashboard columns
CREATE FUNCTION public.analytics_summary(days_back integer DEFAULT 0)
RETURNS TABLE (
  start_date text,
  end_date text,
  dau integer,
  visitors_7d integer,
  returns_7d integer,
  avg_session_minutes numeric,
  listing_views_7d integer,
  post_starts_7d integer,
  post_submits_7d integer,
  post_success_7d integer,
  post_abandoned_7d integer,
  dau_sparkline integer[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH bounds AS (
  SELECT
    (date(timezone('America/New_York', now())) - make_interval(days => GREATEST(days_back, 0))) AS start_d,
    date(timezone('America/New_York', now())) AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    e.user_id,
    e.session_id,
    -- Normalize unique key to TEXT to avoid COALESCE type errors
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  SELECT DISTINCT id, event_name, key_text, user_id, session_id, d
  FROM events_in_range
),
daily_users AS (
  SELECT d, COUNT(DISTINCT user_id) as daily_users
  FROM dedup
  WHERE user_id IS NOT NULL
  GROUP BY d
)
RETURN QUERY
SELECT
  (SELECT start_d FROM bounds)::text AS start_date,
  (SELECT end_d FROM bounds)::text AS end_date,
  COALESCE((SELECT COUNT(DISTINCT user_id) FROM dedup WHERE user_id IS NOT NULL), 0)::int AS dau,
  COALESCE((SELECT COUNT(DISTINCT session_id) FROM dedup), 0)::int AS visitors_7d,
  COALESCE((SELECT COUNT(DISTINCT session_id) FROM dedup WHERE user_id IS NOT NULL), 0)::int AS returns_7d,
  0::numeric AS avg_session_minutes, -- Placeholder for session duration calculation
  COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_view'), 0)::int AS listing_views_7d,
  COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_post_start'), 0)::int AS post_starts_7d,
  COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_post_submit'), 0)::int AS post_submits_7d,
  COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_post_success'), 0)::int AS post_success_7d,
  GREATEST(
    COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_post_start'), 0) -
    COALESCE((SELECT COUNT(DISTINCT key_text) FROM dedup WHERE event_name = 'listing_post_success'), 0),
    0
  )::int AS post_abandoned_7d,
  COALESCE(
    (SELECT array_agg(daily_users ORDER BY d) FROM daily_users),
    ARRAY[]::integer[]
  ) AS dau_sparkline;
$$;

-- Step 4: Create new analytics_top_listings
CREATE FUNCTION public.analytics_top_listings(days_back integer, limit_count integer)
RETURNS TABLE (
  listing_id text,
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
    (date(timezone('America/New_York', now())) - make_interval(days => GREATEST(days_back, 0))) AS start_d,
    date(timezone('America/New_York', now())) AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    e.props,
    -- Normalize unique key to TEXT to avoid COALESCE type errors
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  SELECT DISTINCT id, event_name, props, key_text
  FROM events_in_range
),
listing_metrics AS (
  SELECT
    (props->>'listing_id')::text AS listing_id,
    COUNT(DISTINCT dedup.id) FILTER (WHERE event_name = 'listing_view') AS views,
    COUNT(DISTINCT dedup.id) FILTER (WHERE event_name = 'listing_impression_batch') AS impressions
  FROM dedup
  WHERE props->>'listing_id' IS NOT NULL
    AND event_name IN ('listing_view', 'listing_impression_batch')
  GROUP BY (props->>'listing_id')::text
)
RETURN QUERY
SELECT
  lm.listing_id,
  COALESCE(lm.views, 0)::int AS views,
  COALESCE(lm.impressions, 0)::int AS impressions,
  CASE 
    WHEN COALESCE(lm.impressions, 0) > 0 
    THEN ROUND((COALESCE(lm.views, 0) * 100.0 / lm.impressions), 2)
    ELSE 0::numeric
  END AS ctr
FROM listing_metrics lm
WHERE COALESCE(lm.views, 0) > 0 OR COALESCE(lm.impressions, 0) > 0
ORDER BY lm.views DESC, lm.impressions DESC
LIMIT limit_count;
$$;

-- Step 5: Create new analytics_top_filters
CREATE FUNCTION public.analytics_top_filters(days_back integer, limit_count integer)
RETURNS TABLE (
  filter_key text,
  filter_value text,
  uses integer,
  rank integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH bounds AS (
  SELECT
    (date(timezone('America/New_York', now())) - make_interval(days => GREATEST(days_back, 0))) AS start_d,
    date(timezone('America/New_York', now())) AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    e.props,
    -- Normalize unique key to TEXT to avoid COALESCE type errors
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  SELECT DISTINCT id, event_name, props, key_text
  FROM events_in_range
),
filter_usage AS (
  SELECT
    filter_key,
    filter_value,
    COUNT(DISTINCT dedup.id) AS uses,
    ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT dedup.id) DESC) AS rank
  FROM dedup,
  LATERAL (
    SELECT key::text AS filter_key, value::text AS filter_value
    FROM jsonb_each_text(COALESCE(props->'filters', '{}'::jsonb))
    WHERE key IS NOT NULL AND value IS NOT NULL AND value != ''
  ) AS filters
  WHERE event_name = 'filter_apply'
  GROUP BY filter_key, filter_value
)
RETURN QUERY
SELECT
  fu.filter_key,
  fu.filter_value,
  fu.uses::int AS uses,
  fu.rank::int AS rank
FROM filter_usage fu
ORDER BY fu.uses DESC, fu.filter_key, fu.filter_value
LIMIT limit_count;
$$;

-- Step 6: Grant execute permissions for PostgREST
GRANT EXECUTE ON FUNCTION public.analytics_summary(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_top_listings(integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_top_filters(integer, integer) TO anon, authenticated, service_role;

-- Step 7: Validation queries (should all succeed without errors)
-- These will be executed as part of the migration to verify the fixes work
DO $$
DECLARE
  summary_result RECORD;
  listings_count INTEGER;
  filters_count INTEGER;
BEGIN
  -- Test analytics_summary - should return exactly one row
  SELECT * INTO summary_result FROM public.analytics_summary(0);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'analytics_summary(0) returned no rows - should always return one row';
  END IF;
  
  -- Test analytics_top_listings - should not error (empty results OK)
  SELECT COUNT(*) INTO listings_count FROM public.analytics_top_listings(0, 10);
  RAISE NOTICE 'analytics_top_listings(0, 10) returned % rows', listings_count;
  
  -- Test analytics_top_filters - should not error (empty results OK)
  SELECT COUNT(*) INTO filters_count FROM public.analytics_top_filters(0, 10);
  RAISE NOTICE 'analytics_top_filters(0, 10) returned % rows', filters_count;
  
  RAISE NOTICE 'All analytics functions validated successfully';
END $$;