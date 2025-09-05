/*
  # Fix Analytics RPCs for Dashboard

  1. Functions Updated
    - `analytics_summary(days_back integer)` - Returns exactly one row with today's metrics
    - `analytics_top_listings(days_back integer, limit_count integer)` - Returns top listings with proper deduplication
    - `analytics_top_filters(days_back integer, limit_count integer)` - Returns top filters with proper deduplication

  2. Key Changes
    - All functions use SECURITY DEFINER with SET search_path=public
    - Proper timezone handling (America/New_York)
    - Zero-safe returns using COALESCE
    - Event deduplication before aggregation
    - Always return at least one row for summary (never blank)

  3. Date Range Logic
    - days_back=0 means "today only"
    - days_back=1 means "yesterday and today" (2 days total)
    - Uses proper date bounds with timezone conversion
*/

-- Drop existing functions to recreate with proper signatures
DROP FUNCTION IF EXISTS analytics_summary(integer);
DROP FUNCTION IF EXISTS analytics_top_listings(integer, integer);
DROP FUNCTION IF EXISTS analytics_top_filters(integer, integer);

-- Analytics Summary Function
CREATE OR REPLACE FUNCTION analytics_summary(days_back integer DEFAULT 0)
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH bounds AS (
    SELECT 
      (date(timezone('America/New_York', now())) - INTERVAL '1 day' * days_back)::date AS start_d,
      date(timezone('America/New_York', now())) AS end_d
  ),
  events_in_range AS (
    SELECT 
      e.id,
      e.event_name,
      e.user_id,
      e.session_id,
      COALESCE(e.props->>'attempt_id', e.session_id, e.id::text) AS attempt_key,
      timezone('America/New_York', e.ts)::date AS event_date,
      timezone('America/New_York', e.ts) AS event_ts
    FROM public.analytics_events e
    CROSS JOIN bounds b
    WHERE timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
  ),
  dedup AS (
    SELECT DISTINCT 
      id, 
      event_name, 
      user_id, 
      session_id, 
      attempt_key, 
      event_date,
      event_ts
    FROM events_in_range
  ),
  daily_users AS (
    SELECT 
      event_date,
      COUNT(DISTINCT COALESCE(user_id, session_id)) AS daily_unique_users
    FROM dedup
    WHERE event_name = 'page_view'
    GROUP BY event_date
  ),
  metrics AS (
    SELECT
      COUNT(DISTINCT COALESCE(d.user_id, d.session_id)) FILTER (WHERE d.event_name = 'page_view') AS unique_visitors,
      COUNT(DISTINCT d.user_id) FILTER (WHERE d.event_name = 'page_view' AND d.user_id IS NOT NULL) AS returning_users,
      COUNT(DISTINCT d.id) FILTER (WHERE d.event_name = 'listing_view') AS listing_views,
      COUNT(DISTINCT d.attempt_key) FILTER (WHERE d.event_name = 'listing_post_start') AS post_starts,
      COUNT(DISTINCT d.attempt_key) FILTER (WHERE d.event_name = 'listing_post_submit') AS post_submits,
      COUNT(DISTINCT d.attempt_key) FILTER (WHERE d.event_name = 'listing_post_success') AS post_successes,
      -- Calculate abandoned as starts minus successes
      GREATEST(0, 
        COUNT(DISTINCT d.attempt_key) FILTER (WHERE d.event_name = 'listing_post_start') -
        COUNT(DISTINCT d.attempt_key) FILTER (WHERE d.event_name = 'listing_post_success')
      ) AS post_abandoned
    FROM dedup d
  ),
  sparkline_data AS (
    SELECT COALESCE(array_agg(daily_unique_users ORDER BY event_date), ARRAY[]::integer[]) AS sparkline
    FROM daily_users
  )
  SELECT 
    b.start_d::text AS start_date,
    b.end_d::text AS end_date,
    COALESCE(m.unique_visitors, 0)::integer AS dau,
    COALESCE(m.unique_visitors, 0)::integer AS visitors_7d,
    COALESCE(m.returning_users, 0)::integer AS returners_7d,
    0::numeric AS avg_session_minutes, -- Placeholder for session duration tracking
    COALESCE(m.listing_views, 0)::integer AS listing_views_7d,
    COALESCE(m.post_starts, 0)::integer AS post_starts_7d,
    COALESCE(m.post_submits, 0)::integer AS post_submits_7d,
    COALESCE(m.post_successes, 0)::integer AS post_success_7d,
    COALESCE(m.post_abandoned, 0)::integer AS post_abandoned_7d,
    COALESCE(s.sparkline, ARRAY[]::integer[]) AS dau_sparkline
  FROM bounds b
  CROSS JOIN metrics m
  CROSS JOIN sparkline_data s;
END;
$$;

-- Analytics Top Listings Function
CREATE OR REPLACE FUNCTION analytics_top_listings(days_back integer, limit_count integer)
RETURNS TABLE (
  listing_id text,
  views integer,
  impressions integer,
  ctr numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH bounds AS (
    SELECT 
      (date(timezone('America/New_York', now())) - INTERVAL '1 day' * days_back)::date AS start_d,
      date(timezone('America/New_York', now())) AS end_d
  ),
  events_in_range AS (
    SELECT 
      e.id,
      e.event_name,
      e.props->>'listing_id' AS listing_id,
      timezone('America/New_York', e.ts)::date AS event_date
    FROM public.analytics_events e
    CROSS JOIN bounds b
    WHERE timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
      AND e.event_name IN ('listing_view', 'listing_impression_batch')
      AND e.props->>'listing_id' IS NOT NULL
  ),
  dedup AS (
    SELECT DISTINCT id, event_name, listing_id
    FROM events_in_range
  ),
  listing_metrics AS (
    SELECT 
      d.listing_id,
      COUNT(DISTINCT d.id) FILTER (WHERE d.event_name = 'listing_view') AS view_count,
      COUNT(DISTINCT d.id) FILTER (WHERE d.event_name = 'listing_impression_batch') AS impression_count
    FROM dedup d
    GROUP BY d.listing_id
    HAVING COUNT(DISTINCT d.id) > 0
  )
  SELECT 
    lm.listing_id::text,
    COALESCE(lm.view_count, 0)::integer AS views,
    COALESCE(lm.impression_count, 0)::integer AS impressions,
    CASE 
      WHEN COALESCE(lm.impression_count, 0) > 0 
      THEN ROUND((COALESCE(lm.view_count, 0) * 100.0 / lm.impression_count), 2)
      ELSE 0::numeric
    END AS ctr
  FROM listing_metrics lm
  ORDER BY lm.view_count DESC, lm.impression_count DESC
  LIMIT limit_count;
END;
$$;

-- Analytics Top Filters Function
CREATE OR REPLACE FUNCTION analytics_top_filters(days_back integer, limit_count integer)
RETURNS TABLE (
  filter_key text,
  filter_value text,
  uses integer,
  rank integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH bounds AS (
    SELECT 
      (date(timezone('America/New_York', now())) - INTERVAL '1 day' * days_back)::date AS start_d,
      date(timezone('America/New_York', now())) AS end_d
  ),
  events_in_range AS (
    SELECT 
      e.id,
      e.event_name,
      e.props,
      timezone('America/New_York', e.ts)::date AS event_date
    FROM public.analytics_events e
    CROSS JOIN bounds b
    WHERE timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
      AND e.event_name = 'filter_apply'
      AND e.props IS NOT NULL
  ),
  dedup AS (
    SELECT DISTINCT id, event_name, props
    FROM events_in_range
  ),
  filter_extracts AS (
    SELECT 
      d.id,
      key AS filter_key,
      value::text AS filter_value
    FROM dedup d
    CROSS JOIN LATERAL jsonb_each(COALESCE(d.props->'filters', '{}'::jsonb)) AS kv(key, value)
    WHERE value IS NOT NULL 
      AND value::text != 'null'
      AND value::text != ''
  ),
  filter_counts AS (
    SELECT 
      fe.filter_key,
      fe.filter_value,
      COUNT(DISTINCT fe.id) AS use_count
    FROM filter_extracts fe
    GROUP BY fe.filter_key, fe.filter_value
    HAVING COUNT(DISTINCT fe.id) > 0
  )
  SELECT 
    fc.filter_key::text,
    fc.filter_value::text,
    fc.use_count::integer AS uses,
    ROW_NUMBER() OVER (ORDER BY fc.use_count DESC, fc.filter_key, fc.filter_value)::integer AS rank
  FROM filter_counts fc
  ORDER BY fc.use_count DESC, fc.filter_key, fc.filter_value
  LIMIT limit_count;
END;
$$;