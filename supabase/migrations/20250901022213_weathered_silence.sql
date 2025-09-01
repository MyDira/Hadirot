/*
  # Create Analytics Functions

  1. New Functions
    - `analytics_summary` - Returns 7-day analytics overview with DAU, visitors, sessions, and posting funnel
    - `analytics_top_listings` - Returns top listings by views and impressions with CTR
    - `analytics_top_filters` - Returns most commonly used filter combinations

  2. Security
    - All functions require admin privileges
    - Functions use SECURITY DEFINER for elevated access to analytics_events table

  3. Notes
    - Fixed nested aggregate function issues by using CTEs and subqueries
    - All aggregations are properly separated to avoid PostgreSQL errors
*/

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS analytics_summary(integer);
DROP FUNCTION IF EXISTS analytics_top_listings(integer, integer);
DROP FUNCTION IF EXISTS analytics_top_filters(integer, integer);

-- Analytics summary function
CREATE OR REPLACE FUNCTION analytics_summary(days_back integer DEFAULT 7)
RETURNS TABLE (
  start_date date,
  end_date date,
  dau bigint,
  visitors_7d bigint,
  returns_7d bigint,
  avg_session_minutes numeric,
  listing_views_7d bigint,
  post_starts_7d bigint,
  post_submits_7d bigint,
  post_success_7d bigint,
  post_abandoned_7d bigint,
  dau_sparkline bigint[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_check boolean;
  date_start date;
  date_end date;
BEGIN
  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) INTO admin_check;
  
  IF NOT admin_check THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Set date range
  date_end := CURRENT_DATE;
  date_start := date_end - (days_back - 1);

  -- Return analytics data using simple aggregations
  RETURN QUERY
  WITH date_range AS (
    SELECT date_start as start_dt, date_end as end_dt
  ),
  daily_users AS (
    SELECT 
      DATE(ts) as event_date,
      COUNT(DISTINCT session_id) as daily_sessions
    FROM analytics_events 
    WHERE DATE(ts) >= date_start AND DATE(ts) <= date_end
    GROUP BY DATE(ts)
  ),
  session_data AS (
    SELECT 
      session_id,
      MIN(ts) as session_start,
      MAX(ts) as session_end
    FROM analytics_events 
    WHERE DATE(ts) >= date_start AND DATE(ts) <= date_end
    GROUP BY session_id
  ),
  session_durations AS (
    SELECT 
      session_id,
      EXTRACT(EPOCH FROM (session_end - session_start)) / 60.0 as duration_minutes
    FROM session_data
  ),
  event_counts AS (
    SELECT 
      COUNT(*) FILTER (WHERE event_name = 'listing_view') as listing_views,
      COUNT(*) FILTER (WHERE event_name = 'post_start') as post_starts,
      COUNT(*) FILTER (WHERE event_name = 'post_submit') as post_submits,
      COUNT(*) FILTER (WHERE event_name = 'post_success') as post_success,
      COUNT(*) FILTER (WHERE event_name = 'post_abandon') as post_abandoned
    FROM analytics_events 
    WHERE DATE(ts) >= date_start AND DATE(ts) <= date_end
  ),
  visitor_counts AS (
    SELECT 
      COUNT(DISTINCT session_id) as total_visitors,
      COUNT(DISTINCT session_id) FILTER (
        WHERE session_id IN (
          SELECT session_id 
          FROM analytics_events 
          WHERE DATE(ts) < date_start
        )
      ) as returning_visitors
    FROM analytics_events 
    WHERE DATE(ts) >= date_start AND DATE(ts) <= date_end
  ),
  sparkline_data AS (
    SELECT ARRAY(
      SELECT COALESCE(daily_sessions, 0)
      FROM generate_series(date_start, date_end, '1 day'::interval) as d(day)
      LEFT JOIN daily_users ON daily_users.event_date = DATE(d.day)
      ORDER BY d.day
    ) as dau_array
  )
  SELECT 
    dr.start_dt::date,
    dr.end_dt::date,
    COALESCE((SELECT MAX(daily_sessions) FROM daily_users), 0),
    vc.total_visitors,
    vc.returning_visitors,
    COALESCE((SELECT AVG(duration_minutes) FROM session_durations), 0),
    ec.listing_views,
    ec.post_starts,
    ec.post_submits,
    ec.post_success,
    ec.post_abandoned,
    sd.dau_array
  FROM date_range dr
  CROSS JOIN event_counts ec
  CROSS JOIN visitor_counts vc
  CROSS JOIN sparkline_data sd;
END;
$$;

-- Top listings by views function
CREATE OR REPLACE FUNCTION analytics_top_listings(days_back integer DEFAULT 7, limit_count integer DEFAULT 10)
RETURNS TABLE (
  listing_id text,
  views bigint,
  impressions bigint,
  ctr numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_check boolean;
BEGIN
  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) INTO admin_check;
  
  IF NOT admin_check THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  WITH listing_stats AS (
    SELECT 
      (props->>'listing_id')::text as lid,
      COUNT(*) FILTER (WHERE event_name = 'listing_view') as view_count,
      COUNT(*) FILTER (WHERE event_name = 'listing_impression') as impression_count
    FROM analytics_events 
    WHERE DATE(ts) >= CURRENT_DATE - (days_back - 1)
      AND props->>'listing_id' IS NOT NULL
    GROUP BY props->>'listing_id'
  )
  SELECT 
    ls.lid,
    ls.view_count,
    ls.impression_count,
    CASE 
      WHEN ls.impression_count > 0 
      THEN ROUND((ls.view_count::numeric / ls.impression_count::numeric) * 100, 1)
      ELSE 0
    END as click_through_rate
  FROM listing_stats ls
  WHERE ls.view_count > 0 OR ls.impression_count > 0
  ORDER BY ls.view_count DESC
  LIMIT limit_count;
END;
$$;

-- Top filters function
CREATE OR REPLACE FUNCTION analytics_top_filters(days_back integer DEFAULT 7, limit_count integer DEFAULT 10)
RETURNS TABLE (
  filter_key text,
  filter_value text,
  uses bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_check boolean;
BEGIN
  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) INTO admin_check;
  
  IF NOT admin_check THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    key as filter_key,
    value as filter_value,
    COUNT(*) as usage_count
  FROM analytics_events,
  LATERAL jsonb_each_text(props) as filters(key, value)
  WHERE DATE(ts) >= CURRENT_DATE - (days_back - 1)
    AND event_name = 'search_filter'
    AND key NOT IN ('listing_id', 'session_id', 'user_id')
  GROUP BY key, value
  ORDER BY usage_count DESC
  LIMIT limit_count;
END;
$$;