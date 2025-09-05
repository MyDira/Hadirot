/*
  # Fix Analytics RPC Language Syntax and Type Issues

  1. Inspection
     - Check current function signatures and return types
     - Identify language (SQL vs PL/pgSQL) for each function
     - Capture exact OUT column names and types

  2. Function Fixes
     - Use rename-swap strategy to avoid 42P13 errors
     - Apply proper SQL vs PL/pgSQL syntax (no RETURN QUERY in SQL functions)
     - Normalize all keys to TEXT to fix COALESCE type errors
     - Maintain NY timezone filtering and DISTINCT pre-aggregation

  3. Security
     - All functions use SECURITY DEFINER with SET search_path=public
     - Proper grants for anon, authenticated, service_role

  4. Validation
     - Test all functions return expected data types
     - Ensure one-row return for analytics_summary
     - Verify no type errors in key handling
*/

-- Step 1: Introspect current signatures and OUT columns
DO $$
BEGIN
  RAISE NOTICE 'Current function signatures:';
END $$;

-- Current signatures
SELECT proname, oid::regprocedure AS signature
FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN ('analytics_summary','analytics_top_listings','analytics_top_filters');

-- Full definitions (commented out to avoid output spam in migration)
-- SELECT pg_get_functiondef('public.analytics_summary(integer)'::regprocedure);
-- SELECT pg_get_functiondef('public.analytics_top_listings(integer,integer)'::regprocedure);
-- SELECT pg_get_functiondef('public.analytics_top_filters(integer,integer)'::regprocedure);

-- OUT columns (names/types) if RETURNS TABLE
SELECT p.proname, a.attname AS out_col,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS out_type
FROM pg_proc p
JOIN pg_type t ON t.oid=p.prorettype AND t.typtype='c'
JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0
WHERE p.pronamespace='public'::regnamespace
  AND p.proname IN ('analytics_summary','analytics_top_listings','analytics_top_filters')
ORDER BY p.proname, a.attnum;

-- Step 2: Rename existing functions to avoid conflicts
ALTER FUNCTION IF EXISTS public.analytics_summary(integer) RENAME TO analytics_summary_legacy_20250105;
ALTER FUNCTION IF EXISTS public.analytics_top_listings(integer,integer) RENAME TO analytics_top_listings_legacy_20250105;
ALTER FUNCTION IF EXISTS public.analytics_top_filters(integer,integer) RENAME TO analytics_top_filters_legacy_20250105;

-- Step 3: Create new analytics_summary with proper SQL syntax (no RETURN QUERY)
CREATE OR REPLACE FUNCTION public.analytics_summary(days_back integer DEFAULT 0)
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
    (date(timezone('America/New_York', now())) - make_interval(days => GREATEST(days_back,0))) AS start_d,
    date(timezone('America/New_York', now())) AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    e.user_id,
    e.session_id,
    -- Normalize funnel key to TEXT to avoid COALESCE type errors
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  -- De-duplicate before any aggregations to avoid JOIN inflation
  SELECT DISTINCT id, event_name, user_id, session_id, key_text, d
  FROM events_in_range
),
daily_users AS (
  SELECT d, COUNT(DISTINCT user_id) as daily_count
  FROM dedup
  WHERE user_id IS NOT NULL
  GROUP BY d
  ORDER BY d
)
SELECT
  (SELECT start_d FROM bounds)::text AS start_date,
  (SELECT end_d FROM bounds)::text AS end_date,
  COALESCE((SELECT COUNT(DISTINCT user_id) FROM dedup WHERE user_id IS NOT NULL), 0)::int AS dau,
  COALESCE((SELECT COUNT(DISTINCT session_id) FROM dedup), 0)::int AS visitors_7d,
  COALESCE((SELECT COUNT(DISTINCT session_id) FROM dedup WHERE user_id IS NOT NULL), 0)::int AS returns_7d,
  0::numeric AS avg_session_minutes, -- Placeholder - requires session duration tracking
  COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_view'), 0)::int AS listing_views_7d,
  COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_post_start'), 0)::int AS post_starts_7d,
  COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_post_submit'), 0)::int AS post_submits_7d,
  COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_post_success'), 0)::int AS post_success_7d,
  GREATEST(
    COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_post_start'), 0) -
    COALESCE((SELECT COUNT(DISTINCT key_text) FROM dedup WHERE event_name = 'listing_post_success'), 0),
    0
  )::int AS post_abandoned_7d,
  COALESCE((SELECT array_agg(daily_count ORDER BY d) FROM daily_users), ARRAY[]::integer[]) AS dau_sparkline;
$$;

-- Step 4: Create new analytics_top_listings with proper SQL syntax
CREATE OR REPLACE FUNCTION public.analytics_top_listings(days_back integer, limit_count integer)
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
    (date(timezone('America/New_York', now())) - make_interval(days => GREATEST(days_back,0))) AS start_d,
    date(timezone('America/New_York', now())) AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    e.props,
    -- Normalize key to TEXT
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  -- De-duplicate before aggregations
  SELECT DISTINCT id, event_name, props, key_text
  FROM events_in_range
),
listing_metrics AS (
  SELECT
    (props->>'listing_id')::text AS listing_id,
    COUNT(DISTINCT id) FILTER (WHERE event_name = 'listing_view') AS view_count,
    COUNT(DISTINCT id) FILTER (WHERE event_name = 'listing_impression_batch') AS impression_count
  FROM dedup
  WHERE props->>'listing_id' IS NOT NULL
    AND event_name IN ('listing_view', 'listing_impression_batch')
  GROUP BY (props->>'listing_id')::text
  HAVING COUNT(DISTINCT id) > 0
)
SELECT
  lm.listing_id,
  COALESCE(lm.view_count, 0)::int AS views,
  COALESCE(lm.impression_count, 0)::int AS impressions,
  CASE 
    WHEN COALESCE(lm.impression_count, 0) > 0 
    THEN ROUND((COALESCE(lm.view_count, 0)::numeric * 100.0 / lm.impression_count), 2)
    ELSE 0::numeric
  END AS ctr
FROM listing_metrics lm
ORDER BY lm.view_count DESC, lm.impression_count DESC
LIMIT COALESCE(limit_count, 10);
$$;

-- Step 5: Create new analytics_top_filters with proper SQL syntax
CREATE OR REPLACE FUNCTION public.analytics_top_filters(days_back integer, limit_count integer)
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
    (date(timezone('America/New_York', now())) - make_interval(days => GREATEST(days_back,0))) AS start_d,
    date(timezone('America/New_York', now())) AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    e.props,
    -- Normalize key to TEXT
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  -- De-duplicate before aggregations
  SELECT DISTINCT id, event_name, props, key_text
  FROM events_in_range
),
filter_usage AS (
  SELECT
    filter_data.key AS filter_key,
    filter_data.value AS filter_value,
    COUNT(DISTINCT dedup.id) AS use_count
  FROM dedup
  CROSS JOIN LATERAL (
    SELECT key, value
    FROM jsonb_each_text(
      CASE 
        WHEN dedup.props ? 'filters' THEN dedup.props->'filters'
        ELSE dedup.props
      END
    )
    WHERE key IN ('bedrooms', 'beds', 'property_type', 'neighborhood', 'price_min', 'price_max', 'parking_included', 'no_fee_only', 'role', 'poster_type')
      AND value IS NOT NULL
      AND value != ''
  ) AS filter_data(key, value)
  WHERE dedup.event_name = 'filter_apply'
  GROUP BY filter_data.key, filter_data.value
  HAVING COUNT(DISTINCT dedup.id) > 0
)
SELECT
  fu.filter_key,
  fu.filter_value,
  fu.use_count::int AS uses,
  ROW_NUMBER() OVER (ORDER BY fu.use_count DESC, fu.filter_key, fu.filter_value)::int AS rank
FROM filter_usage fu
ORDER BY fu.use_count DESC, fu.filter_key, fu.filter_value
LIMIT COALESCE(limit_count, 10);
$$;

-- Step 6: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.analytics_summary(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_top_listings(integer,integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_top_filters(integer,integer) TO anon, authenticated, service_role;

-- Step 7: Validation queries
DO $$
BEGIN
  RAISE NOTICE 'Validating analytics functions...';
END $$;

-- Test analytics_summary - should return exactly one row with integers
SELECT 'analytics_summary validation' AS test,
       start_date, end_date, dau, visitors_7d, returns_7d, 
       avg_session_minutes, listing_views_7d, post_starts_7d, 
       post_submits_7d, post_success_7d, post_abandoned_7d,
       array_length(dau_sparkline, 1) AS sparkline_length
FROM public.analytics_summary(0);

-- Test analytics_top_listings - should work even if empty
SELECT 'analytics_top_listings validation' AS test, COUNT(*) AS result_count
FROM public.analytics_top_listings(0, 10);

-- Test analytics_top_filters - should work even if empty  
SELECT 'analytics_top_filters validation' AS test, COUNT(*) AS result_count
FROM public.analytics_top_filters(0, 10);

DO $$
BEGIN
  RAISE NOTICE 'Analytics RPC fixes completed successfully!';
END $$;