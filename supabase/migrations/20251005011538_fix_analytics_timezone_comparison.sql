/*
  # Fix Analytics Timezone Comparison Bug
  
  ## Problem Identified
  All analytics RPC functions were comparing dates incorrectly:
  - They convert `now()` to target timezone to get target_date
  - But they compare using `occurred_at::date` which uses UTC timezone
  - This causes a mismatch when events occur after midnight UTC but before midnight in the target timezone
  
  ## Example of the Bug
  - Current time: 2025-10-05 01:14 UTC (9:14 PM on Oct 4 in NY)
  - Target date: 2025-10-04 (calculated from NY timezone)
  - Event occurred_at: 2025-10-05 00:58 UTC (8:58 PM on Oct 4 in NY)
  - Bug: occurred_at::date = 2025-10-05 (UTC) ≠ 2025-10-04 (target)
  - Fix: (occurred_at AT TIME ZONE tz)::date = 2025-10-04 = 2025-10-04 ✓
  
  ## Solution
  Change all date comparisons from:
    `WHERE occurred_at::date = target_date`
  To:
    `WHERE (occurred_at AT TIME ZONE tz)::date = target_date`
  
  ## Functions Fixed
  1. analytics_kpis_with_sparkline
  2. analytics_summary
  3. analytics_agency_metrics
  4. analytics_page_impressions
  5. analytics_top_listings
  6. analytics_top_filters
  7. analytics_top_listings_detailed
*/

-- Fix analytics_kpis_with_sparkline
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
    LEFT JOIN analytics_sessions s ON (s.started_at AT TIME ZONE tz)::date = d.day_date
    GROUP BY d.day_date
    ORDER BY d.day_date
  ) daily_counts;
  
  -- Get today's metrics
  RETURN QUERY
  SELECT 
    COALESCE((
      SELECT COUNT(DISTINCT s.anon_id)::integer
      FROM analytics_sessions s
      WHERE (s.started_at AT TIME ZONE tz)::date = target_date
    ), 0) as daily_active,
    
    COALESCE((
      SELECT COUNT(DISTINCT s.anon_id)::integer
      FROM analytics_sessions s
      WHERE (s.started_at AT TIME ZONE tz)::date = target_date
        AND s.user_id IS NULL
    ), 0) as unique_visitors,
    
    COALESCE((
      SELECT ROUND(AVG(s.duration_seconds / 60.0))::integer
      FROM analytics_sessions s
      WHERE (s.started_at AT TIME ZONE tz)::date = target_date
        AND s.duration_seconds IS NOT NULL
        AND s.duration_seconds > 0
    ), 0) as avg_session_minutes,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events e
      WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
        AND e.event_name = 'listing_view'
    ), 0) as listing_views,
    
    COALESCE(sparkline_data, ARRAY[]::integer[]) as sparkline_dau;
END;
$$;

-- Fix analytics_summary
CREATE OR REPLACE FUNCTION analytics_summary(
  days_back integer DEFAULT 0,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  post_starts integer,
  post_submits integer,
  post_successes integer,
  post_abandoned integer
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
      WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
        AND e.event_name = 'post_started'
    ), 0) as post_starts,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events e
      WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
        AND e.event_name = 'post_submitted'
    ), 0) as post_submits,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events e
      WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
        AND e.event_name = 'post_success'
    ), 0) as post_successes,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events e
      WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
        AND e.event_name = 'post_abandoned'
    ), 0) as post_abandoned;
END;
$$;

-- Fix analytics_agency_metrics
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
      WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
        AND e.event_name = 'agency_page_view'
    ), 0) as agency_page_views,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events e
      WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
        AND e.event_name = 'agency_filter_apply'
    ), 0) as agency_filter_applies,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events e
      WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
        AND e.event_name = 'agency_share'
    ), 0) as agency_shares;
END;
$$;

-- Fix analytics_page_impressions
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
  WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
    AND e.event_name = 'page_view'
    AND (e.event_props->>'path') IS NOT NULL
  GROUP BY (e.event_props->>'path')
  HAVING COUNT(*) > 0
  ORDER BY view_count DESC
  LIMIT limit_count;
END;
$$;

-- Fix analytics_top_listings
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
  WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
    AND e.event_name IN ('listing_view', 'listing_impression_batch')
    AND (e.event_props->>'listing_id') IS NOT NULL
    AND (e.event_props->>'listing_id') != ''
  GROUP BY (e.event_props->>'listing_id')
  HAVING COUNT(*) > 0
  ORDER BY views DESC, impressions DESC
  LIMIT limit_count;
END;
$$;

-- Fix analytics_top_filters
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
  WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
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

-- Fix analytics_top_listings_detailed
CREATE OR REPLACE FUNCTION analytics_top_listings_detailed(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id uuid,
  property_location text,
  bedrooms integer,
  monthly_rent text,
  posted_by text,
  views integer,
  impressions integer,
  ctr numeric,
  is_featured boolean
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
  WITH listing_stats AS (
    SELECT
      (e.event_props->>'listing_id')::uuid as lid,
      COUNT(CASE WHEN e.event_name = 'listing_view' THEN 1 END)::integer as view_count,
      COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END)::integer as impression_count,
      CASE
        WHEN COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END) > 0
        THEN ROUND(
          (COUNT(CASE WHEN e.event_name = 'listing_view' THEN 1 END)::numeric /
           COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END)::numeric) * 100,
          2
        )
        ELSE 0
      END as click_through_rate
    FROM analytics_events e
    WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
      AND e.event_name IN ('listing_view', 'listing_impression_batch')
      AND (e.event_props->>'listing_id') IS NOT NULL
      AND (e.event_props->>'listing_id') != ''
    GROUP BY (e.event_props->>'listing_id')
    HAVING COUNT(*) > 0
  )
  SELECT
    l.id,
    COALESCE(
      CASE
        WHEN l.neighborhood IS NOT NULL AND l.neighborhood != ''
        THEN l.neighborhood || ' - ' || l.location
        ELSE l.location
      END,
      'Unknown Location'
    ) as property_location,
    l.bedrooms,
    CASE
      WHEN l.call_for_price = true THEN 'Call for Price'
      WHEN l.price IS NULL THEN 'Not specified'
      ELSE '$' || l.price::text || '/mo'
    END as monthly_rent,
    COALESCE(p.full_name, 'Unknown') as posted_by,
    ls.view_count,
    ls.impression_count,
    ls.click_through_rate,
    COALESCE(l.is_featured, false) as is_featured
  FROM listing_stats ls
  INNER JOIN listings l ON l.id = ls.lid
  LEFT JOIN profiles p ON p.id = l.user_id
  WHERE l.is_active = true
  ORDER BY ls.view_count DESC, ls.impression_count DESC
  LIMIT limit_count;
END;
$$;
