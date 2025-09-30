/*
  # Fix Analytics RPC Functions for UUID Compatibility

  1. Database Functions
    - Update analytics_kpis to handle UUID session_id/anon_id properly
    - Update analytics_summary to handle UUID session_id/anon_id properly
    - Update analytics_top_listings to handle UUID listing_id properly
    - Update analytics_top_filters to handle UUID session_id properly

  2. Fixes
    - Ensure all UUID columns are properly cast and handled
    - Fix any type mismatches that prevent data aggregation
    - Maintain backward compatibility with existing data
*/

-- Drop and recreate analytics_kpis function with proper UUID handling
DROP FUNCTION IF EXISTS analytics_kpis(integer, text);
CREATE OR REPLACE FUNCTION analytics_kpis(days_back integer DEFAULT 0, tz text DEFAULT 'UTC')
RETURNS TABLE (
  daily_active integer,
  unique_visitors integer,
  avg_session_minutes integer,
  listing_views integer
) 
LANGUAGE plpgsql
AS $$
DECLARE
  target_date date;
BEGIN
  target_date := (now() AT TIME ZONE tz)::date - days_back * interval '1 day';
  
  RETURN QUERY
  SELECT 
    COALESCE((
      SELECT COUNT(DISTINCT s.anon_id)::integer
      FROM analytics_sessions s
      WHERE s.started_at::date = target_date
    ), 0) as daily_active,
    
    COALESCE((
      SELECT COUNT(DISTINCT s.anon_id)::integer
      FROM analytics_sessions s
      WHERE s.started_at::date = target_date
        AND s.user_id IS NULL
    ), 0) as unique_visitors,
    
    COALESCE((
      SELECT ROUND(AVG(s.duration_seconds / 60.0))::integer
      FROM analytics_sessions s
      WHERE s.started_at::date = target_date
        AND s.duration_seconds IS NOT NULL
        AND s.duration_seconds > 0
    ), 0) as avg_session_minutes,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events e
      WHERE e.occurred_at::date = target_date
        AND e.event_name = 'listing_view'
    ), 0) as listing_views;
END;
$$;

-- Drop and recreate analytics_summary function with proper UUID handling
DROP FUNCTION IF EXISTS analytics_summary(integer);
DROP FUNCTION IF EXISTS analytics_summary(integer, text);
CREATE OR REPLACE FUNCTION analytics_summary(days_back integer DEFAULT 0, tz text DEFAULT 'UTC')
RETURNS TABLE (
  post_starts integer,
  post_submits integer,
  post_successes integer,
  post_abandoned integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  target_date date;
BEGIN
  target_date := (now() AT TIME ZONE tz)::date - days_back * interval '1 day';
  
  RETURN QUERY
  SELECT 
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events e
      WHERE e.occurred_at::date = target_date
        AND e.event_name = 'post_started'
    ), 0) as post_starts,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events e
      WHERE e.occurred_at::date = target_date
        AND e.event_name = 'post_submitted'
    ), 0) as post_submits,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events e
      WHERE e.occurred_at::date = target_date
        AND e.event_name = 'post_success'
    ), 0) as post_successes,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events e
      WHERE e.occurred_at::date = target_date
        AND e.event_name = 'post_abandoned'
    ), 0) as post_abandoned;
END;
$$;

-- Drop and recreate analytics_top_listings function with proper UUID handling
DROP FUNCTION IF EXISTS analytics_top_listings(integer, integer);
CREATE OR REPLACE FUNCTION analytics_top_listings(days_back integer DEFAULT 0, limit_count integer DEFAULT 10)
RETURNS TABLE (
  listing_id text,
  views integer,
  impressions integer,
  ctr numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  target_date date;
BEGIN
  target_date := (now() AT TIME ZONE 'UTC')::date - days_back * interval '1 day';
  
  RETURN QUERY
  SELECT 
    COALESCE((e.event_props->>'listing_id')::text, '') as listing_id,
    COUNT(CASE WHEN e.event_name = 'listing_view' THEN 1 END)::integer as views,
    COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END)::integer as impressions,
    CASE 
      WHEN COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END) > 0 
      THEN ROUND(
        (COUNT(CASE WHEN e.event_name = 'listing_view' THEN 1 END)::numeric / 
         COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END)::numeric) * 100, 
        2
      )
      ELSE 0
    END as ctr
  FROM analytics_events e
  WHERE e.occurred_at::date = target_date
    AND e.event_name IN ('listing_view', 'listing_impression_batch')
    AND (e.event_props->>'listing_id') IS NOT NULL
    AND (e.event_props->>'listing_id') != ''
  GROUP BY (e.event_props->>'listing_id')
  HAVING COUNT(*) > 0
  ORDER BY views DESC, impressions DESC
  LIMIT limit_count;
END;
$$;

-- Drop and recreate analytics_top_filters function with proper UUID handling
DROP FUNCTION IF EXISTS analytics_top_filters(integer, integer);
CREATE OR REPLACE FUNCTION analytics_top_filters(days_back integer DEFAULT 0, limit_count integer DEFAULT 10)
RETURNS TABLE (
  filter_key text,
  filter_value text,
  uses integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  target_date date;
BEGIN
  target_date := (now() AT TIME ZONE 'UTC')::date - days_back * interval '1 day';
  
  RETURN QUERY
  SELECT 
    filter_data.key::text as filter_key,
    filter_data.value::text as filter_value,
    COUNT(*)::integer as uses
  FROM analytics_events e,
       jsonb_each_text(COALESCE(e.event_props->'filters', '{}'::jsonb)) as filter_data(key, value)
  WHERE e.occurred_at::date = target_date
    AND e.event_name = 'filter_apply'
    AND jsonb_typeof(e.event_props->'filters') = 'object'
    AND filter_data.value IS NOT NULL
    AND filter_data.value != ''
  GROUP BY filter_data.key, filter_data.value
  HAVING COUNT(*) > 0
  ORDER BY uses DESC
  LIMIT limit_count;
END;
$$;