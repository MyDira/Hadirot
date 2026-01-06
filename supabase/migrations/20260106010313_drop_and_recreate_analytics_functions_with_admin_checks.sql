/*
  # Drop and Recreate Analytics Functions with Admin Checks
  
  ## Overview
  This migration drops existing analytics functions with changed signatures
  and recreates them with require_admin() checks.
*/

-- Drop all functions we need to recreate with changed signatures
DROP FUNCTION IF EXISTS analytics_summary(integer, text);
DROP FUNCTION IF EXISTS analytics_kpis_with_sparkline(text);

-- 1.12 analytics_kpis_with_sparkline
CREATE OR REPLACE FUNCTION analytics_kpis_with_sparkline(
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  daily_active integer,
  unique_visitors integer,
  avg_session_duration numeric,
  listing_views integer,
  sparkline_dau integer[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_date date;
BEGIN
  PERFORM require_admin();
  
  target_date := (now() AT TIME ZONE tz)::date;
  
  RETURN QUERY
  WITH daily_sessions AS (
    SELECT 
      (started_at AT TIME ZONE tz)::date as day_date,
      COUNT(DISTINCT id)::integer as session_count
    FROM analytics_sessions
    WHERE (started_at AT TIME ZONE tz)::date >= target_date - 6
      AND (started_at AT TIME ZONE tz)::date <= target_date
    GROUP BY (started_at AT TIME ZONE tz)::date
  ),
  date_series AS (
    SELECT generate_series(target_date - 6, target_date, '1 day'::interval)::date as day_date
  ),
  sparkline AS (
    SELECT ARRAY_AGG(COALESCE(ds.session_count, 0) ORDER BY ser.day_date) as arr
    FROM date_series ser
    LEFT JOIN daily_sessions ds ON ds.day_date = ser.day_date
  )
  SELECT 
    COALESCE((
      SELECT COUNT(DISTINCT id)::integer
      FROM analytics_sessions
      WHERE (started_at AT TIME ZONE tz)::date = target_date
    ), 0) as daily_active,
    COALESCE((
      SELECT COUNT(DISTINCT anon_id)::integer
      FROM analytics_sessions
      WHERE (started_at AT TIME ZONE tz)::date = target_date
    ), 0) as unique_visitors,
    COALESCE((
      SELECT ROUND(AVG(duration_seconds) / 60.0, 1)
      FROM analytics_sessions
      WHERE (started_at AT TIME ZONE tz)::date = target_date
        AND duration_seconds > 0
    ), 0)::numeric as avg_session_duration,
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events
      WHERE (occurred_at AT TIME ZONE tz)::date = target_date
        AND event_name = 'listing_view'
    ), 0) as listing_views,
    (SELECT arr FROM sparkline) as sparkline_dau;
END;
$$;

-- 1.13 analytics_summary
CREATE OR REPLACE FUNCTION analytics_summary(
  days_back integer DEFAULT 7,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  post_starts integer,
  post_submits integer,
  post_successes integer,
  post_abandoned integer,
  post_errors integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  PERFORM require_admin();
  
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  RETURN QUERY
  SELECT 
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events
      WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
        AND event_name = 'post_started'
    ), 0) as post_starts,
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events
      WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
        AND event_name = 'post_submitted'
    ), 0) as post_submits,
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events
      WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
        AND event_name = 'post_success'
    ), 0) as post_successes,
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events
      WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
        AND event_name = 'post_abandoned'
    ), 0) as post_abandoned,
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events
      WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
        AND event_name = 'post_error'
    ), 0) as post_errors;
END;
$$;
