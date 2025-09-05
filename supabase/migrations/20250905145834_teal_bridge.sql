/*
  # Inspect and Fix Analytics RPC Type Mismatches

  1. Inspection Queries
    - Check current function signatures and return types
    - Identify exact column names and types expected by frontend
    - Check for any dependencies that would prevent changes

  2. Type Fixes
    - Normalize all keys to TEXT to prevent COALESCE type errors
    - Cast attempt_id, session_id, and id to text consistently
    - Preserve existing return column names and types

  3. Maintain Existing Features
    - Keep America/New_York timezone filtering
    - Preserve pre-aggregation with DISTINCT
    - Ensure one-row return for analytics_summary
    - Keep exact parameter names: days_back, limit_count
*/

-- Step 0: Inspect current signatures (run these manually first to see current state)
-- SELECT proname, oid::regprocedure AS signature
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND proname IN ('analytics_summary','analytics_top_listings','analytics_top_filters');

-- Step 1: Fix analytics_summary with type-safe key handling
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
    timezone('America/New_York', e.ts)::date AS d,
    timezone('America/New_York', e.ts) AS ts_ny
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  -- De-duplicate events before aggregation
  SELECT DISTINCT id, event_name, user_id, session_id, key_text, d, ts_ny
  FROM events_in_range
),
daily_users AS (
  SELECT 
    d,
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS daily_users
  FROM dedup
  WHERE event_name = 'page_view'
  GROUP BY d
)
RETURN QUERY
SELECT
  (SELECT start_d::text FROM bounds) AS start_date,
  (SELECT end_d::text FROM bounds) AS end_date,
  
  -- DAU: distinct users who had any event today
  COALESCE((
    SELECT COUNT(DISTINCT user_id)::int
    FROM dedup
    WHERE user_id IS NOT NULL
      AND d = (SELECT end_d FROM bounds)
  ), 0) AS dau,
  
  -- Visitors: distinct users over the period
  COALESCE((
    SELECT COUNT(DISTINCT user_id)::int
    FROM dedup
    WHERE user_id IS NOT NULL
  ), 0) AS visitors_7d,
  
  -- Returners: users who appeared on multiple days
  COALESCE((
    SELECT COUNT(DISTINCT user_id)::int
    FROM (
      SELECT user_id
      FROM dedup
      WHERE user_id IS NOT NULL
      GROUP BY user_id
      HAVING COUNT(DISTINCT d) > 1
    ) returners
  ), 0) AS returns_7d,
  
  -- Average session minutes (placeholder - requires session duration tracking)
  0::numeric AS avg_session_minutes,
  
  -- Listing views
  COALESCE((
    SELECT COUNT(DISTINCT id)::int
    FROM dedup
    WHERE event_name = 'listing_view'
  ), 0) AS listing_views_7d,
  
  -- Posting funnel with safe key handling
  COALESCE((
    SELECT COUNT(*)::int
    FROM dedup
    WHERE event_name = 'listing_post_start'
  ), 0) AS post_starts_7d,
  
  COALESCE((
    SELECT COUNT(*)::int
    FROM dedup
    WHERE event_name = 'listing_post_submit'
  ), 0) AS post_submits_7d,
  
  COALESCE((
    SELECT COUNT(*)::int
    FROM dedup
    WHERE event_name = 'listing_post_success'
  ), 0) AS post_success_7d,
  
  -- Derived abandoned: starts - successes (by unique key, non-negative)
  GREATEST(
    COALESCE((
      SELECT COUNT(*)::int
      FROM dedup
      WHERE event_name = 'listing_post_start'
    ), 0) - COALESCE((
      SELECT COUNT(DISTINCT key_text)::int
      FROM dedup
      WHERE event_name = 'listing_post_success'
    ), 0),
    0
  ) AS post_abandoned_7d,
  
  -- DAU sparkline: array of daily user counts
  COALESCE((
    SELECT array_agg(daily_users ORDER BY d)
    FROM daily_users
  ), ARRAY[]::integer[]) AS dau_sparkline;
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
    e.props,
    -- Normalize keys to TEXT
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  -- De-duplicate before aggregation
  SELECT DISTINCT id, event_name, props, key_text, d
  FROM events_in_range
),
listing_metrics AS (
  SELECT
    (props->>'listing_id')::text AS listing_id,
    COUNT(DISTINCT id) FILTER (WHERE event_name = 'listing_view') AS views,
    COUNT(DISTINCT id) FILTER (WHERE event_name = 'listing_impression_batch') AS impressions
  FROM dedup
  WHERE (props->>'listing_id') IS NOT NULL
    AND event_name IN ('listing_view', 'listing_impression_batch')
  GROUP BY (props->>'listing_id')::text
)
RETURN QUERY
SELECT
  lm.listing_id,
  COALESCE(lm.views, 0)::integer AS views,
  COALESCE(lm.impressions, 0)::integer AS impressions,
  CASE 
    WHEN COALESCE(lm.impressions, 0) > 0 
    THEN ROUND((COALESCE(lm.views, 0)::numeric * 100.0 / lm.impressions), 2)
    ELSE 0::numeric
  END AS ctr
FROM listing_metrics lm
WHERE COALESCE(lm.views, 0) > 0 OR COALESCE(lm.impressions, 0) > 0
ORDER BY lm.views DESC, lm.impressions DESC
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
    e.props,
    -- Normalize keys to TEXT
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  -- De-duplicate before aggregation
  SELECT DISTINCT id, event_name, props, key_text, d
  FROM events_in_range
),
filter_usage AS (
  SELECT
    filter_key,
    filter_value,
    COUNT(DISTINCT dedup.id) AS uses
  FROM dedup
  CROSS JOIN LATERAL (
    SELECT 
      key AS filter_key,
      value::text AS filter_value
    FROM jsonb_each_text(
      CASE 
        WHEN dedup.props ? 'filters' THEN dedup.props->'filters'
        ELSE dedup.props
      END
    )
    WHERE key NOT IN ('schema_version', 'attempt_id')
      AND value IS NOT NULL
      AND value::text != ''
  ) filters
  WHERE dedup.event_name = 'filter_apply'
  GROUP BY filter_key, filter_value
)
RETURN QUERY
SELECT
  fu.filter_key,
  fu.filter_value,
  fu.uses::integer,
  ROW_NUMBER() OVER (ORDER BY fu.uses DESC)::integer AS rank
FROM filter_usage fu
WHERE fu.uses > 0
ORDER BY fu.uses DESC
LIMIT limit_count;
$$;