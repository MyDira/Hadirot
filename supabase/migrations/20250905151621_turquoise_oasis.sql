/*
  # Fix Analytics RPC SQL Syntax and Type Issues

  1. Language Compliance
    - Use proper SQL language syntax (single SELECT, no RETURN QUERY)
    - Fix COALESCE type mismatches by casting all components to TEXT
    - Preserve exact function signatures and return types

  2. Maintained Features
    - America/New_York timezone filtering for today-only data
    - DISTINCT pre-aggregation to avoid JOIN inflation
    - One-row guarantee for analytics_summary
    - Safe abandoned calculation (non-negative)

  3. Type Safety
    - Normalize all funnel keys to TEXT consistently
    - Use key_text for all DISTINCT operations and JOINs
*/

-- Introspect current signatures (for reference)
-- SELECT proname, oid::regprocedure AS signature
-- FROM pg_proc
-- WHERE pronamespace='public'::regnamespace
--   AND proname IN ('analytics_summary','analytics_top_listings','analytics_top_filters');

-- Drop and recreate analytics_summary to avoid 42P13 errors
DO $$
BEGIN
  -- Drop analytics_summary if it exists
  IF to_regprocedure('public.analytics_summary(integer)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION public.analytics_summary(integer)';
  END IF;
END$$;

-- Recreate analytics_summary with proper SQL syntax and type safety
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
    (date(timezone('America/New_York', now()))
     - make_interval(days => GREATEST(days_back,0))) AS start_d,
    date(timezone('America/New_York', now()))         AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    e.session_id,
    e.user_id,
    /* 🧯 Normalize key to TEXT to avoid COALESCE type mismatch */
    coalesce((e.props->>'attempt_id')::text,
             (e.session_id)::text,
             (e.id)::text)                              AS key_text,
    timezone('America/New_York', e.ts)::date           AS d,
    timezone('America/New_York', e.ts)                 AS ts_ny
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date
       BETWEEN b.start_d AND b.end_d
),
dedup AS (
  /* de-dup by row + logical key BEFORE any joins */
  SELECT DISTINCT id, event_name, key_text, session_id, user_id, d, ts_ny
  FROM events_in_range
),
daily_users AS (
  SELECT d, COUNT(DISTINCT session_id) as daily_count
  FROM dedup
  WHERE event_name = 'page_view'
  GROUP BY d
  ORDER BY d
),
sparkline_data AS (
  SELECT array_agg(daily_count ORDER BY d) as dau_array
  FROM daily_users
)
SELECT
  (SELECT start_d::text FROM bounds)                                                                   AS start_date,
  (SELECT end_d::text FROM bounds)                                                                     AS end_date,
  COALESCE((SELECT COUNT(DISTINCT session_id) FROM dedup WHERE event_name = 'page_view'), 0)::int     AS dau,
  COALESCE((SELECT COUNT(DISTINCT session_id) FROM dedup WHERE event_name = 'page_view'), 0)::int     AS visitors_7d,
  COALESCE((SELECT COUNT(DISTINCT user_id) FROM dedup WHERE event_name = 'page_view' AND user_id IS NOT NULL), 0)::int AS returns_7d,
  COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (MAX(ts_ny) - MIN(ts_ny)))/60) FROM dedup WHERE event_name = 'page_view' GROUP BY session_id), 0)::numeric AS avg_session_minutes,
  COUNT(*) FILTER (WHERE event_name = 'listing_view')::int                                            AS listing_views_7d,
  COUNT(*) FILTER (WHERE event_name = 'listing_post_start')::int                                      AS post_starts_7d,
  COUNT(*) FILTER (WHERE event_name = 'listing_post_submit')::int                                     AS post_submits_7d,
  COUNT(*) FILTER (WHERE event_name = 'listing_post_success')::int                                    AS post_success_7d,
  GREATEST(
    (COUNT(*) FILTER (WHERE event_name = 'listing_post_start')
     - COUNT(DISTINCT key_text) FILTER (WHERE event_name = 'listing_post_success')
    ), 0
  )::int                                                                                              AS post_abandoned_7d,
  COALESCE((SELECT dau_array FROM sparkline_data), ARRAY[]::integer[])                                AS dau_sparkline
FROM dedup, sparkline_data;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_summary(integer) TO anon, authenticated, service_role;

-- Fix analytics_top_listings with proper type safety
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
    (date(timezone('America/New_York', now()))
     - make_interval(days => GREATEST(days_back,0))) AS start_d,
    date(timezone('America/New_York', now()))         AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    /* 🧯 Normalize key to TEXT to avoid COALESCE type mismatch */
    coalesce((e.props->>'attempt_id')::text,
             (e.session_id)::text,
             (e.id)::text)                              AS key_text,
    e.props->>'listing_id'                             AS listing_id,
    timezone('America/New_York', e.ts)::date           AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date
       BETWEEN b.start_d AND b.end_d
  WHERE e.event_name IN ('listing_view', 'listing_impression_batch')
    AND e.props->>'listing_id' IS NOT NULL
),
dedup AS (
  /* de-dup by row + logical key BEFORE aggregation */
  SELECT DISTINCT id, event_name, key_text, listing_id
  FROM events_in_range
),
listing_stats AS (
  SELECT
    listing_id,
    COUNT(*) FILTER (WHERE event_name = 'listing_view')::int             AS views,
    COUNT(*) FILTER (WHERE event_name = 'listing_impression_batch')::int AS impressions
  FROM dedup
  GROUP BY listing_id
)
SELECT
  ls.listing_id::text,
  COALESCE(ls.views, 0)::int                                             AS views,
  COALESCE(ls.impressions, 0)::int                                       AS impressions,
  CASE 
    WHEN COALESCE(ls.impressions, 0) > 0 
    THEN ROUND((COALESCE(ls.views, 0)::numeric / ls.impressions * 100), 2)
    ELSE 0::numeric
  END                                                                    AS ctr
FROM listing_stats ls
ORDER BY ls.views DESC, ls.impressions DESC
LIMIT GREATEST(limit_count, 0);
$$;

-- Fix analytics_top_filters with proper type safety
CREATE OR REPLACE FUNCTION public.analytics_top_filters(days_back integer, limit_count integer)
RETURNS TABLE (
  filter_key text,
  filter_value text,
  uses integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH bounds AS (
  SELECT
    (date(timezone('America/New_York', now()))
     - make_interval(days => GREATEST(days_back,0))) AS start_d,
    date(timezone('America/New_York', now()))         AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    /* 🧯 Normalize key to TEXT to avoid COALESCE type mismatch */
    coalesce((e.props->>'attempt_id')::text,
             (e.session_id)::text,
             (e.id)::text)                              AS key_text,
    e.props,
    timezone('America/New_York', e.ts)::date           AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date
       BETWEEN b.start_d AND b.end_d
  WHERE e.event_name = 'filter_apply'
    AND e.props IS NOT NULL
),
dedup AS (
  /* de-dup by row + logical key BEFORE processing filters */
  SELECT DISTINCT id, event_name, key_text, props
  FROM events_in_range
),
filter_extracts AS (
  SELECT
    key AS filter_key,
    value::text AS filter_value
  FROM dedup d,
  LATERAL jsonb_each_text(d.props->'filters') AS kv(key, value)
  WHERE d.props->'filters' IS NOT NULL
),
filter_stats AS (
  SELECT
    filter_key,
    filter_value,
    COUNT(*)::int AS uses
  FROM filter_extracts
  GROUP BY filter_key, filter_value
)
SELECT
  fs.filter_key::text,
  fs.filter_value::text,
  fs.uses::int
FROM filter_stats fs
ORDER BY fs.uses DESC, fs.filter_key, fs.filter_value
LIMIT GREATEST(limit_count, 0);
$$;

-- Validation queries
SELECT 'analytics_summary validation:' AS test;
SELECT * FROM public.analytics_summary(0);

SELECT 'analytics_top_listings validation:' AS test;
SELECT * FROM public.analytics_top_listings(0, 10);

SELECT 'analytics_top_filters validation:' AS test;
SELECT * FROM public.analytics_top_filters(0, 10);