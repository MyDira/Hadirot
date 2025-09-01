/*
  # Analytics Dashboard RPCs

  1. New Functions
    - `is_admin()` - Helper function to check if current user is admin
    - `analytics_summary(days_back)` - Returns summary statistics for dashboard KPIs
    - `analytics_top_listings(days_back, limit_count)` - Returns top listings by views and impressions
    - `analytics_top_filters(days_back, limit_count)` - Returns most used filters

  2. Security
    - All functions use SECURITY DEFINER with restricted search_path
    - Admin-only access enforced via auth.uid() and profiles.is_admin check
    - Functions raise 'forbidden' exception for non-admin users

  3. Performance
    - Optimized queries using existing indexes on ts, event_name, session_id
    - Proper date filtering with interval arithmetic
    - Result sets capped with limit_count parameter
*/

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$;

-- Analytics summary function
CREATE OR REPLACE FUNCTION analytics_summary(days_back INT DEFAULT 7)
RETURNS TABLE (
  start_date DATE,
  end_date DATE,
  dau BIGINT,
  visitors_7d BIGINT,
  returns_7d BIGINT,
  avg_session_minutes NUMERIC,
  listing_views_7d BIGINT,
  post_starts_7d BIGINT,
  post_submits_7d BIGINT,
  post_success_7d BIGINT,
  post_abandoned_7d BIGINT,
  dau_sparkline INT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts TIMESTAMPTZ;
  end_ts TIMESTAMPTZ;
  sparkline_data INT[];
  i INT;
  day_date DATE;
  day_count INT;
BEGIN
  -- Check admin access
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Calculate date range
  end_ts := NOW();
  start_ts := end_ts - (days_back || ' days')::INTERVAL;
  
  -- Build sparkline data (always 7 elements, fill missing days with 0)
  sparkline_data := ARRAY[]::INT[];
  FOR i IN 0..6 LOOP
    day_date := (end_ts - (i || ' days')::INTERVAL)::DATE;
    
    SELECT COUNT(DISTINCT session_id)::INT
    INTO day_count
    FROM analytics_events
    WHERE ts::DATE = day_date
      AND event_name = 'page_view';
    
    sparkline_data := ARRAY[COALESCE(day_count, 0)] || sparkline_data;
  END LOOP;

  RETURN QUERY
  SELECT
    start_ts::DATE as start_date,
    end_ts::DATE as end_date,
    
    -- DAU (today)
    COALESCE((
      SELECT COUNT(DISTINCT session_id)
      FROM analytics_events
      WHERE ts::DATE = CURRENT_DATE
        AND event_name = 'page_view'
    ), 0) as dau,
    
    -- Unique visitors (7d)
    COALESCE((
      SELECT COUNT(DISTINCT session_id)
      FROM analytics_events
      WHERE ts >= start_ts
        AND event_name = 'page_view'
    ), 0) as visitors_7d,
    
    -- Return visitors (7d) - sessions with more than 1 page view
    COALESCE((
      SELECT COUNT(DISTINCT session_id)
      FROM analytics_events
      WHERE ts >= start_ts
        AND event_name = 'page_view'
      GROUP BY session_id
      HAVING COUNT(*) > 1
    ), 0) as returns_7d,
    
    -- Average session length in minutes
    COALESCE((
      SELECT AVG(EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 60)
      FROM analytics_events
      WHERE ts >= start_ts
      GROUP BY session_id
      HAVING COUNT(*) > 1
    ), 0) as avg_session_minutes,
    
    -- Listing views (7d)
    COALESCE((
      SELECT COUNT(*)
      FROM analytics_events
      WHERE ts >= start_ts
        AND event_name = 'listing_view'
    ), 0) as listing_views_7d,
    
    -- Post funnel metrics (7d)
    COALESCE((
      SELECT COUNT(*)
      FROM analytics_events
      WHERE ts >= start_ts
        AND event_name = 'listing_post_start'
    ), 0) as post_starts_7d,
    
    COALESCE((
      SELECT COUNT(*)
      FROM analytics_events
      WHERE ts >= start_ts
        AND event_name = 'listing_post_submit'
    ), 0) as post_submits_7d,
    
    COALESCE((
      SELECT COUNT(*)
      FROM analytics_events
      WHERE ts >= start_ts
        AND event_name = 'listing_post_submit_success'
    ), 0) as post_success_7d,
    
    COALESCE((
      SELECT COUNT(*)
      FROM analytics_events
      WHERE ts >= start_ts
        AND event_name = 'listing_post_abandoned'
    ), 0) as post_abandoned_7d,
    
    -- DAU sparkline
    sparkline_data as dau_sparkline;
END;
$$;

-- Top listings function
CREATE OR REPLACE FUNCTION analytics_top_listings(days_back INT DEFAULT 7, limit_count INT DEFAULT 10)
RETURNS TABLE (
  listing_id TEXT,
  views BIGINT,
  impressions BIGINT,
  ctr NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts TIMESTAMPTZ;
BEGIN
  -- Check admin access
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  start_ts := NOW() - (days_back || ' days')::INTERVAL;

  RETURN QUERY
  WITH listing_views AS (
    SELECT 
      (props->>'listing_id')::TEXT as listing_id,
      COUNT(*) as view_count
    FROM analytics_events
    WHERE ts >= start_ts
      AND event_name = 'listing_view'
      AND props->>'listing_id' IS NOT NULL
    GROUP BY props->>'listing_id'
  ),
  listing_impressions AS (
    SELECT 
      jsonb_array_elements_text(props->'ids') as listing_id,
      COUNT(*) as impression_count
    FROM analytics_events
    WHERE ts >= start_ts
      AND event_name = 'listing_impression_batch'
      AND props->'ids' IS NOT NULL
    GROUP BY jsonb_array_elements_text(props->'ids')
  ),
  combined_stats AS (
    SELECT 
      COALESCE(v.listing_id, i.listing_id) as listing_id,
      COALESCE(v.view_count, 0) as views,
      COALESCE(i.impression_count, 0) as impressions,
      CASE 
        WHEN COALESCE(i.impression_count, 0) > 0 
        THEN ROUND((COALESCE(v.view_count, 0)::NUMERIC / i.impression_count::NUMERIC) * 100, 2)
        ELSE 0
      END as ctr
    FROM listing_views v
    FULL OUTER JOIN listing_impressions i ON v.listing_id = i.listing_id
    WHERE COALESCE(v.listing_id, i.listing_id) IS NOT NULL
  )
  SELECT 
    c.listing_id,
    c.views,
    c.impressions,
    c.ctr
  FROM combined_stats c
  ORDER BY c.views DESC, c.impressions DESC
  LIMIT limit_count;
END;
$$;

-- Top filters function
CREATE OR REPLACE FUNCTION analytics_top_filters(days_back INT DEFAULT 7, limit_count INT DEFAULT 10)
RETURNS TABLE (
  filter_key TEXT,
  filter_value TEXT,
  uses BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts TIMESTAMPTZ;
BEGIN
  -- Check admin access
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  start_ts := NOW() - (days_back || ' days')::INTERVAL;

  RETURN QUERY
  WITH filter_usage AS (
    SELECT 
      key as filter_key,
      value::TEXT as filter_value,
      COUNT(*) as use_count
    FROM analytics_events,
    LATERAL jsonb_each(props->'filters') as f(key, value)
    WHERE ts >= start_ts
      AND event_name = 'filter_apply'
      AND props->'filters' IS NOT NULL
      AND jsonb_typeof(props->'filters') = 'object'
    GROUP BY key, value::TEXT
  )
  SELECT 
    f.filter_key,
    f.filter_value,
    f.use_count
  FROM filter_usage f
  ORDER BY f.use_count DESC
  LIMIT limit_count;
END;
$$;