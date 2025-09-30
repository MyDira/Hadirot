/*
  # Complete Analytics System Fix and Enhancement

  ## Overview
  This migration fixes the analytics dashboard and adds missing functionality to bridge
  the gap between internal needs and what Bolt analytics will provide.

  ## Changes Made

  ### 1. New RPC Functions
  - `analytics_kpis_with_sparkline`: Returns KPIs plus last 7 days of DAU data for sparkline
  - `analytics_agency_metrics`: Track agency page performance
  - `analytics_page_impressions`: Count total page views by page

  ### 2. Fixed Return Types
  - Ensure all functions return proper data types matching frontend expectations
  - Add timezone support for accurate date-based queries

  ### 3. Additional Metrics
  - Agency page views, filter usage, and shares
  - Page-level impression tracking
  - Historical trend data for sparklines

  ## Security
  - All functions use SECURITY DEFINER with search_path = public
  - Maintains existing RLS policies on analytics tables
  - Admin-only access via frontend auth checks
*/

-- Create function to get KPIs with sparkline data (last 7 days)
CREATE OR REPLACE FUNCTION analytics_kpis_with_sparkline(tz text DEFAULT 'America/New_York')
RETURNS TABLE (
  daily_active integer,
  unique_visitors integer,
  avg_session_minutes integer,
  listing_views integer,
  sparkline_dau integer[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_date date;
  sparkline_data integer[];
BEGIN
  target_date := (now() AT TIME ZONE tz)::date;
  
  -- Build sparkline array for last 7 days (oldest to newest)
  SELECT array_agg(daily_count ORDER BY day_date) INTO sparkline_data
  FROM (
    SELECT 
      d.day_date,
      COALESCE(COUNT(DISTINCT s.anon_id), 0)::integer as daily_count
    FROM (
      SELECT generate_series(
        target_date - interval '6 days',
        target_date,
        interval '1 day'
      )::date as day_date
    ) d
    LEFT JOIN analytics_sessions s ON s.started_at::date = d.day_date
    GROUP BY d.day_date
    ORDER BY d.day_date
  ) daily_counts;
  
  -- Get today's metrics
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
    ), 0) as listing_views,
    
    COALESCE(sparkline_data, ARRAY[]::integer[]) as sparkline_dau;
END;
$$;

-- Create function to get agency-specific metrics
CREATE OR REPLACE FUNCTION analytics_agency_metrics(
  days_back integer DEFAULT 0,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  agency_page_views integer,
  agency_filter_applies integer,
  agency_shares integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        AND e.event_name = 'agency_page_view'
    ), 0) as agency_page_views,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events e
      WHERE e.occurred_at::date = target_date
        AND e.event_name = 'agency_filter_apply'
    ), 0) as agency_filter_applies,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events e
      WHERE e.occurred_at::date = target_date
        AND e.event_name = 'agency_share'
    ), 0) as agency_shares;
END;
$$;

-- Create function to get page impression counts
CREATE OR REPLACE FUNCTION analytics_page_impressions(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  page_path text,
  view_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_date date;
BEGIN
  target_date := (now() AT TIME ZONE tz)::date - days_back * interval '1 day';
  
  RETURN QUERY
  SELECT 
    COALESCE((e.event_props->>'path')::text, 'unknown') as page_path,
    COUNT(*)::integer as view_count
  FROM analytics_events e
  WHERE e.occurred_at::date = target_date
    AND e.event_name = 'page_view'
    AND (e.event_props->>'path') IS NOT NULL
  GROUP BY (e.event_props->>'path')
  HAVING COUNT(*) > 0
  ORDER BY view_count DESC
  LIMIT limit_count;
END;
$$;

-- Drop and recreate analytics_top_listings with timezone parameter
DROP FUNCTION IF EXISTS analytics_top_listings(integer, integer);
DROP FUNCTION IF EXISTS analytics_top_listings(integer, integer, text);

CREATE OR REPLACE FUNCTION analytics_top_listings(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
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
DECLARE
  target_date date;
BEGIN
  target_date := (now() AT TIME ZONE tz)::date - days_back * interval '1 day';
  
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

-- Drop and recreate analytics_top_filters with timezone parameter
DROP FUNCTION IF EXISTS analytics_top_filters(integer, integer);
DROP FUNCTION IF EXISTS analytics_top_filters(integer, integer, text);

CREATE OR REPLACE FUNCTION analytics_top_filters(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  filter_key text,
  filter_value text,
  uses integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_date date;
BEGIN
  target_date := (now() AT TIME ZONE tz)::date - days_back * interval '1 day';
  
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