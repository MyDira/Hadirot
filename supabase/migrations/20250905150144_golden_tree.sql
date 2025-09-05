/*
  # Inspect and Fix Analytics RPC Type Mismatches

  1. Inspection Queries
     - Check current function signatures and return types
     - Identify exact OUT column names and types
     - Check for dependencies that would prevent DROP operations

  2. Type Safety Fixes
     - Normalize all keys to TEXT type using proper casting
     - Fix COALESCE type mismatches in attempt_id/session_id/id
     - Maintain existing return column names and types

  3. Preserved Features
     - America/New_York timezone filtering for today-only data
     - Pre-aggregation with DISTINCT to avoid JOIN inflation
     - One-row return guarantee for analytics_summary
     - Safe abandoned calculation (non-negative)
*/

-- Step 0: Inspect current signatures (informational only)
-- Uncomment these to run in SQL editor for inspection:

-- Show current function definitions
-- SELECT proname, oid::regprocedure AS signature
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND proname IN ('analytics_summary','analytics_top_listings','analytics_top_filters');

-- Get full SQL body
-- SELECT pg_get_functiondef('public.analytics_summary(integer)'::regprocedure);
-- SELECT pg_get_functiondef('public.analytics_top_listings(integer,integer)'::regprocedure);
-- SELECT pg_get_functiondef('public.analytics_top_filters(integer,integer)'::regprocedure);

-- Show OUT columns (if RETURNS TABLE/OUT params are used)
-- SELECT 
--   p.proname,
--   a.attname AS out_col,
--   pg_catalog.format_type(a.atttypid, a.atttypmod) AS out_type
-- FROM pg_proc p
-- JOIN pg_type t ON t.oid = p.prorettype AND t.typtype = 'c'
-- JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0
-- WHERE p.pronamespace = 'public'::regnamespace
--   AND p.proname IN ('analytics_summary','analytics_top_listings','analytics_top_filters')
-- ORDER BY p.proname, a.attnum;

-- Check dependencies (avoid DROP if anything depends on it)
-- SELECT
--   dependent.relkind,
--   dependent.relname AS dependent_object,
--   src.proname AS depends_on_function
-- FROM pg_depend d
-- JOIN pg_proc src ON d.refobjid = src.oid
-- LEFT JOIN pg_class dependent ON d.objid = dependent.oid
-- WHERE src.proname IN ('analytics_summary','analytics_top_listings','analytics_top_filters')
-- ORDER BY src.proname;

-- Step 1: Fix analytics_summary with type-safe key handling
CREATE OR REPLACE FUNCTION public.analytics_summary(days_back integer DEFAULT 0)
RETURNS TABLE (
  start_date text,
  end_date text,
  dau integer,
  visitors_7d integer,
  returners_7d integer,
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
    -- Normalize all keys to TEXT to prevent COALESCE type errors
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  -- De-duplicate before any aggregation to prevent JOIN inflation
  SELECT DISTINCT id, event_name, user_id, session_id, key_text, d
  FROM events_in_range
),
daily_users AS (
  SELECT d, COUNT(DISTINCT user_id) as daily_active_users
  FROM dedup
  WHERE user_id IS NOT NULL
  GROUP BY d
),
sparkline_data AS (
  SELECT array_agg(COALESCE(daily_active_users, 0) ORDER BY d) as dau_array
  FROM (
    SELECT generate_series(
      (SELECT start_d FROM bounds),
      (SELECT end_d FROM bounds),
      '1 day'::interval
    )::date as d
  ) dates
  LEFT JOIN daily_users USING (d)
)
RETURN QUERY
SELECT
  (SELECT start_d::text FROM bounds) AS start_date,
  (SELECT end_d::text FROM bounds) AS end_date,
  COALESCE((SELECT COUNT(DISTINCT user_id) FROM dedup WHERE user_id IS NOT NULL), 0)::integer AS dau,
  COALESCE((SELECT COUNT(DISTINCT user_id) FROM dedup WHERE user_id IS NOT NULL), 0)::integer AS visitors_7d,
  COALESCE((SELECT COUNT(DISTINCT user_id) FROM dedup WHERE user_id IS NOT NULL AND event_name = 'page_view'), 0)::integer AS returners_7d,
  0::numeric AS avg_session_minutes, -- Placeholder for session duration tracking
  COALESCE((SELECT COUNT(DISTINCT id) FROM dedup WHERE event_name = 'listing_view'), 0)::integer AS listing_views_7d,
  COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_post_start'), 0)::integer AS post_starts_7d,
  COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_post_submit'), 0)::integer AS post_submits_7d,
  COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_post_success'), 0)::integer AS post_success_7d,
  GREATEST(
    COALESCE((SELECT COUNT(*) FROM dedup WHERE event_name = 'listing_post_start'), 0) -
    COALESCE((SELECT COUNT(DISTINCT key_text) FROM dedup WHERE event_name = 'listing_post_success'), 0),
    0
  )::integer AS post_abandoned_7d,
  COALESCE((SELECT dau_array FROM sparkline_data), ARRAY[]::integer[]) AS dau_sparkline;
$$;

-- Step 2: Fix analytics_top_listings with type-safe key handling
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
    (date(timezone('America/New_York', now())) - make_interval(days => GREATEST(days_back, 0))) AS start_d,
    date(timezone('America/New_York', now())) AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    -- Normalize keys to TEXT to prevent type errors
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    e.props,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  -- De-duplicate before aggregation
  SELECT DISTINCT id, event_name, key_text, props
  FROM events_in_range
),
listing_metrics AS (
  SELECT
    (props->>'listing_id')::text AS listing_id,
    COUNT(DISTINCT id) FILTER (WHERE event_name = 'listing_view') AS views,
    COUNT(DISTINCT id) FILTER (WHERE event_name = 'listing_impression_batch') AS impressions
  FROM dedup
  WHERE props->>'listing_id' IS NOT NULL
    AND event_name IN ('listing_view', 'listing_impression_batch')
  GROUP BY (props->>'listing_id')::text
)
SELECT
  lm.listing_id::text,
  COALESCE(lm.views, 0)::integer AS views,
  COALESCE(lm.impressions, 0)::integer AS impressions,
  CASE 
    WHEN COALESCE(lm.impressions, 0) > 0 
    THEN ROUND((COALESCE(lm.views, 0)::numeric / lm.impressions::numeric) * 100, 2)
    ELSE 0::numeric
  END AS ctr
FROM listing_metrics lm
WHERE COALESCE(lm.views, 0) > 0 OR COALESCE(lm.impressions, 0) > 0
ORDER BY lm.views DESC NULLS LAST
LIMIT limit_count;
$$;

-- Step 3: Fix analytics_top_filters with type-safe key handling
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
    (date(timezone('America/New_York', now())) - make_interval(days => GREATEST(days_back, 0))) AS start_d,
    date(timezone('America/New_York', now())) AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    -- Normalize keys to TEXT to prevent type errors
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    e.props,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  -- De-duplicate before aggregation
  SELECT DISTINCT id, event_name, key_text, props
  FROM events_in_range
),
filter_usage AS (
  SELECT
    filter_data.key AS filter_key,
    filter_data.value AS filter_value,
    COUNT(DISTINCT dedup.id) AS uses
  FROM dedup
  CROSS JOIN LATERAL (
    SELECT key, value
    FROM jsonb_each_text(
      CASE 
        WHEN dedup.props ? 'filters' THEN dedup.props->'filters'
        ELSE dedup.props
      END
    )
    WHERE key IN ('bedrooms', 'beds', 'price_min', 'price_max', 'neighborhood', 'role', 'property_type', 'parking_included', 'no_fee_only')
      AND value IS NOT NULL
      AND value != ''
  ) AS filter_data(key, value)
  WHERE dedup.event_name = 'filter_apply'
  GROUP BY filter_data.key, filter_data.value
),
ranked_filters AS (
  SELECT
    filter_key,
    filter_value,
    uses,
    ROW_NUMBER() OVER (ORDER BY uses DESC, filter_key, filter_value) AS rank
  FROM filter_usage
)
SELECT
  rf.filter_key::text,
  rf.filter_value::text,
  rf.uses::integer,
  rf.rank::integer
FROM ranked_filters rf
ORDER BY rf.uses DESC, rf.filter_key, rf.filter_value
LIMIT limit_count;
$$;