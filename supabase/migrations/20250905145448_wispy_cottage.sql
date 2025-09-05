/*
  # Fix Analytics RPC Type Mismatches

  1. Fixes
    - Normalize all attempt/session keys to TEXT to prevent COALESCE type errors
    - Ensure analytics_summary always returns exactly one row with zeros
    - Fix timezone handling for America/New_York
    - Maintain proper deduplication before aggregation

  2. Functions Updated
    - analytics_summary(days_back integer default 0)
    - analytics_top_listings(days_back integer, limit_count integer)
    - analytics_top_filters(days_back integer, limit_count integer)

  3. Key Changes
    - Cast all IDs to text in COALESCE: coalesce((e.attempt_id)::text, (e.session_id)::text, (e.id)::text)
    - Use RETURNS TABLE for consistent one-row return in summary
    - Maintain SECURITY DEFINER and search_path settings
    - Keep exact parameter names (days_back, limit_count) for PostgREST compatibility
*/

-- Fix analytics_summary to always return one row with proper type casting
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
    -- Normalize all keys to text to prevent type mismatch
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  -- De-duplicate by event row AND key before aggregation
  SELECT DISTINCT id, event_name, key_text, user_id, session_id, d
  FROM events_in_range
),
daily_users AS (
  SELECT 
    d,
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS daily_auth_users,
    COUNT(DISTINCT session_id) AS daily_sessions
  FROM dedup
  GROUP BY d
),
sparkline_data AS (
  SELECT array_agg(COALESCE(daily_auth_users, 0) ORDER BY d) AS dau_array
  FROM (
    SELECT b.start_d + generate_series(0, (b.end_d - b.start_d)) AS d
    FROM bounds b
  ) dates
  LEFT JOIN daily_users du ON dates.d = du.d
),
summary_stats AS (
  SELECT
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS total_dau,
    COUNT(DISTINCT session_id) AS total_visitors,
    -- Simple approximation for returners (users with multiple sessions)
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) - COUNT(DISTINCT session_id) AS returns_estimate,
    COUNT(*) FILTER (WHERE event_name = 'listing_view') AS listing_views,
    COUNT(*) FILTER (WHERE event_name = 'listing_post_start') AS post_starts,
    COUNT(*) FILTER (WHERE event_name = 'listing_post_submit') AS post_submits,
    COUNT(*) FILTER (WHERE event_name = 'listing_post_success') AS post_successes,
    -- Derive abandoned as starts - successes (non-negative)
    GREATEST(
      COUNT(*) FILTER (WHERE event_name = 'listing_post_start') - 
      COUNT(DISTINCT key_text) FILTER (WHERE event_name = 'listing_post_success'),
      0
    ) AS post_abandoned
  FROM dedup
)
SELECT
  (SELECT start_d::text FROM bounds) AS start_date,
  (SELECT end_d::text FROM bounds) AS end_date,
  COALESCE(ss.total_dau, 0)::integer AS dau,
  COALESCE(ss.total_visitors, 0)::integer AS visitors_7d,
  GREATEST(COALESCE(ss.returns_estimate, 0), 0)::integer AS returns_7d,
  0::numeric AS avg_session_minutes, -- Placeholder for session duration tracking
  COALESCE(ss.listing_views, 0)::integer AS listing_views_7d,
  COALESCE(ss.post_starts, 0)::integer AS post_starts_7d,
  COALESCE(ss.post_submits, 0)::integer AS post_submits_7d,
  COALESCE(ss.post_successes, 0)::integer AS post_success_7d,
  COALESCE(ss.post_abandoned, 0)::integer AS post_abandoned_7d,
  COALESCE(sd.dau_array, ARRAY[]::integer[]) AS dau_sparkline
FROM summary_stats ss
CROSS JOIN sparkline_data sd;
$$;

-- Fix analytics_top_listings with proper type casting and deduplication
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
    -- Normalize key to text
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    (e.props->>'listing_id')::text AS listing_id,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
  WHERE e.props->>'listing_id' IS NOT NULL
),
dedup AS (
  -- De-duplicate events before aggregation
  SELECT DISTINCT id, event_name, key_text, listing_id
  FROM events_in_range
),
listing_stats AS (
  SELECT
    listing_id,
    COUNT(DISTINCT id) FILTER (WHERE event_name = 'listing_view') AS view_count,
    COUNT(DISTINCT id) FILTER (WHERE event_name = 'listing_impression_batch') AS impression_count
  FROM dedup
  WHERE listing_id IS NOT NULL
  GROUP BY listing_id
  HAVING COUNT(DISTINCT id) FILTER (WHERE event_name = 'listing_view') > 0
     OR COUNT(DISTINCT id) FILTER (WHERE event_name = 'listing_impression_batch') > 0
)
SELECT
  ls.listing_id::text,
  COALESCE(ls.view_count, 0)::integer AS views,
  COALESCE(ls.impression_count, 0)::integer AS impressions,
  CASE 
    WHEN COALESCE(ls.impression_count, 0) > 0 
    THEN ROUND((COALESCE(ls.view_count, 0) * 100.0 / ls.impression_count), 2)
    ELSE 0::numeric
  END AS ctr
FROM listing_stats ls
ORDER BY ls.view_count DESC, ls.impression_count DESC
LIMIT limit_count;
$$;

-- Fix analytics_top_filters with proper type casting and deduplication
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
    -- Normalize key to text
    coalesce((e.props->>'attempt_id')::text, (e.session_id)::text, (e.id)::text) AS key_text,
    e.props,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
  WHERE e.event_name = 'filter_apply'
    AND e.props IS NOT NULL
),
dedup AS (
  -- De-duplicate events before processing
  SELECT DISTINCT id, event_name, key_text, props
  FROM events_in_range
),
filter_extracts AS (
  SELECT
    key AS filter_key,
    value::text AS filter_value
  FROM dedup d,
  LATERAL jsonb_each_text(
    CASE 
      WHEN d.props ? 'filters' THEN d.props->'filters'
      ELSE d.props
    END
  ) AS kv(key, value)
  WHERE value IS NOT NULL 
    AND value::text != ''
    AND key NOT IN ('schema_version', 'attempt_id')
),
filter_counts AS (
  SELECT
    filter_key,
    filter_value,
    COUNT(*) AS use_count
  FROM filter_extracts
  GROUP BY filter_key, filter_value
),
ranked_filters AS (
  SELECT
    filter_key,
    filter_value,
    use_count,
    ROW_NUMBER() OVER (ORDER BY use_count DESC, filter_key, filter_value) AS filter_rank
  FROM filter_counts
)
SELECT
  rf.filter_key::text,
  rf.filter_value::text,
  rf.use_count::integer AS uses,
  rf.filter_rank::integer AS rank
FROM ranked_filters rf
ORDER BY rf.use_count DESC, rf.filter_key, rf.filter_value
LIMIT limit_count;
$$;