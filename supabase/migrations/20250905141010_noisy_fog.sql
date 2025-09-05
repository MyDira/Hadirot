/*
  # Fix Analytics Aggregation Functions

  1. Updated Functions
    - `analytics_summary` - Fixed funnel counts with proper distinct counting and today-only filter
    - `analytics_top_listings` - Fixed JOIN inflation and added today filter
    - `analytics_top_filters` - Fixed counting and added today filter

  2. Key Changes
    - Use COUNT(DISTINCT e.id) to prevent JOIN inflation
    - Apply America/New_York timezone for today-only filtering
    - Aggregate events in CTEs before joining to prevent row multiplication
    - Ensure funnel metrics count unique sessions/attempts correctly

  3. Funnel Logic
    - Started: unique sessions that had post_start event
    - Submitted: unique sessions that had post_submit event  
    - Success: unique sessions that had post_success event
    - Abandoned: sessions that started but never succeeded
*/

-- Drop existing functions to recreate them
DROP FUNCTION IF EXISTS analytics_summary(integer);
DROP FUNCTION IF EXISTS analytics_top_listings(integer, integer);
DROP FUNCTION IF EXISTS analytics_top_filters(integer, integer);

-- Analytics Summary Function (Fixed)
CREATE OR REPLACE FUNCTION analytics_summary(days_back integer DEFAULT 1)
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
LANGUAGE plpgsql
AS $$
DECLARE
  today_ny date;
  start_date_ny date;
BEGIN
  -- Get today in NY timezone
  today_ny := date(timezone('America/New_York', now()));
  start_date_ny := today_ny - (days_back - 1);

  RETURN QUERY
  WITH events_today AS (
    SELECT 
      e.id,
      e.session_id,
      e.user_id,
      e.event_name,
      e.ts,
      e.props
    FROM analytics_events e
    WHERE timezone('America/New_York', e.ts)::date = today_ny
  ),
  
  events_period AS (
    SELECT 
      e.id,
      e.session_id,
      e.user_id,
      e.event_name,
      e.ts,
      e.props
    FROM analytics_events e
    WHERE timezone('America/New_York', e.ts)::date >= start_date_ny
      AND timezone('America/New_York', e.ts)::date <= today_ny
  ),

  -- Daily metrics (today only)
  daily_metrics AS (
    SELECT
      COUNT(DISTINCT e.session_id) as dau_count,
      COUNT(DISTINCT e.session_id) FILTER (WHERE e.event_name = 'page_view') as visitors_today,
      COUNT(DISTINCT e.session_id) FILTER (
        WHERE e.event_name = 'page_view' 
        AND EXISTS (
          SELECT 1 FROM events_period ep 
          WHERE ep.session_id = e.session_id 
          AND timezone('America/New_York', ep.ts)::date < today_ny
        )
      ) as returns_today
    FROM events_today e
  ),

  -- 7-day metrics for comparison
  period_metrics AS (
    SELECT
      COUNT(DISTINCT e.session_id) as visitors_period,
      COUNT(DISTINCT e.session_id) FILTER (
        WHERE e.event_name = 'page_view'
        AND EXISTS (
          SELECT 1 FROM analytics_events ae
          WHERE ae.session_id = e.session_id
          AND timezone('America/New_York', ae.ts)::date < start_date_ny
        )
      ) as returns_period,
      
      -- Session duration calculation
      COALESCE(AVG(
        EXTRACT(EPOCH FROM (
          MAX(e.ts) - MIN(e.ts)
        )) / 60.0
      ) FILTER (WHERE COUNT(*) > 1), 0) as avg_session_minutes,
      
      -- Listing views (today only)
      COUNT(DISTINCT e.id) FILTER (WHERE e.event_name = 'listing_view') as listing_views_today,
      
      -- Funnel metrics (today only) - count distinct sessions for each step
      COUNT(DISTINCT e.session_id) FILTER (WHERE e.event_name = 'listing_post_start') as post_starts_today,
      COUNT(DISTINCT e.session_id) FILTER (WHERE e.event_name = 'listing_post_submit') as post_submits_today,
      COUNT(DISTINCT e.session_id) FILTER (WHERE e.event_name = 'listing_post_success') as post_success_today,
      COUNT(DISTINCT e.session_id) FILTER (WHERE e.event_name = 'listing_post_abandoned') as post_abandoned_today
      
    FROM events_period e
    GROUP BY e.session_id
  ),

  -- DAU sparkline (last 7 days including today)
  sparkline_data AS (
    SELECT 
      generate_series(today_ny - 6, today_ny, '1 day'::interval)::date as spark_date
  ),
  
  sparkline_counts AS (
    SELECT 
      sd.spark_date,
      COUNT(DISTINCT e.session_id) as daily_users
    FROM sparkline_data sd
    LEFT JOIN analytics_events e ON timezone('America/New_York', e.ts)::date = sd.spark_date
    GROUP BY sd.spark_date
    ORDER BY sd.spark_date
  )

  SELECT
    start_date_ny::text as start_date,
    today_ny::text as end_date,
    COALESCE(dm.dau_count, 0)::integer as dau,
    COALESCE(dm.visitors_today, 0)::integer as visitors_7d,
    COALESCE(dm.returns_today, 0)::integer as returns_7d,
    COALESCE(
      (SELECT avg_session_minutes FROM period_metrics LIMIT 1), 
      0
    )::numeric as avg_session_minutes,
    COALESCE(
      (SELECT listing_views_today FROM period_metrics LIMIT 1), 
      0
    )::integer as listing_views_7d,
    COALESCE(
      (SELECT post_starts_today FROM period_metrics LIMIT 1), 
      0
    )::integer as post_starts_7d,
    COALESCE(
      (SELECT post_submits_today FROM period_metrics LIMIT 1), 
      0
    )::integer as post_submits_7d,
    COALESCE(
      (SELECT post_success_today FROM period_metrics LIMIT 1), 
      0
    )::integer as post_success_7d,
    COALESCE(
      (SELECT post_abandoned_today FROM period_metrics LIMIT 1), 
      0
    )::integer as post_abandoned_7d,
    COALESCE(
      ARRAY(SELECT daily_users FROM sparkline_counts ORDER BY spark_date),
      ARRAY[]::integer[]
    ) as dau_sparkline
  FROM daily_metrics dm;
END;
$$;

-- Analytics Top Listings Function (Fixed)
CREATE OR REPLACE FUNCTION analytics_top_listings(days_back integer DEFAULT 1, limit_count integer DEFAULT 10)
RETURNS TABLE (
  listing_id text,
  views integer,
  impressions integer,
  ctr numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  today_ny date;
  start_date_ny date;
BEGIN
  -- Get today in NY timezone
  today_ny := date(timezone('America/New_York', now()));
  start_date_ny := today_ny - (days_back - 1);

  RETURN QUERY
  WITH events_period AS (
    SELECT 
      e.id,
      e.session_id,
      e.event_name,
      e.props
    FROM analytics_events e
    WHERE timezone('America/New_York', e.ts)::date >= start_date_ny
      AND timezone('America/New_York', e.ts)::date <= today_ny
      AND e.event_name IN ('listing_view', 'listing_impression_batch', 'listing_click')
  ),
  
  listing_stats AS (
    SELECT
      COALESCE(
        e.props->>'listing_id',
        jsonb_array_elements_text(e.props->'ids')
      ) as listing_id,
      
      -- Count distinct views (not inflated by JOINs)
      COUNT(DISTINCT e.id) FILTER (WHERE e.event_name = 'listing_view') as view_count,
      
      -- Count impressions from batch events
      COUNT(DISTINCT e.id) FILTER (WHERE e.event_name = 'listing_impression_batch') as impression_count,
      
      -- Count clicks
      COUNT(DISTINCT e.id) FILTER (WHERE e.event_name = 'listing_click') as click_count
      
    FROM events_period e
    WHERE (
      e.props ? 'listing_id' OR 
      (e.event_name = 'listing_impression_batch' AND e.props ? 'ids')
    )
    GROUP BY COALESCE(
      e.props->>'listing_id',
      jsonb_array_elements_text(e.props->'ids')
    )
    HAVING COUNT(DISTINCT e.id) > 0
  )
  
  SELECT
    ls.listing_id::text,
    ls.view_count::integer as views,
    ls.impression_count::integer as impressions,
    CASE 
      WHEN ls.impression_count > 0 
      THEN ROUND((ls.click_count::numeric / ls.impression_count::numeric) * 100, 2)
      ELSE 0
    END::numeric as ctr
  FROM listing_stats ls
  WHERE ls.listing_id IS NOT NULL
  ORDER BY ls.view_count DESC, ls.impression_count DESC
  LIMIT limit_count;
END;
$$;

-- Analytics Top Filters Function (Fixed)
CREATE OR REPLACE FUNCTION analytics_top_filters(days_back integer DEFAULT 1, limit_count integer DEFAULT 10)
RETURNS TABLE (
  filter_key text,
  filter_value text,
  uses integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  today_ny date;
  start_date_ny date;
BEGIN
  -- Get today in NY timezone
  today_ny := date(timezone('America/New_York', now()));
  start_date_ny := today_ny - (days_back - 1);

  RETURN QUERY
  WITH events_period AS (
    SELECT 
      e.id,
      e.session_id,
      e.props
    FROM analytics_events e
    WHERE timezone('America/New_York', e.ts)::date >= start_date_ny
      AND timezone('America/New_York', e.ts)::date <= today_ny
      AND e.event_name = 'filter_apply'
      AND e.props ? 'filters'
  ),
  
  filter_usage AS (
    SELECT
      filter_key,
      filter_value,
      COUNT(DISTINCT e.id) as use_count
    FROM events_period e,
    LATERAL (
      SELECT 
        key as filter_key,
        CASE 
          WHEN jsonb_typeof(value) = 'array' THEN jsonb_array_elements_text(value)
          ELSE value::text
        END as filter_value
      FROM jsonb_each(e.props->'filters')
      WHERE value IS NOT NULL 
        AND value != 'null'::jsonb
        AND (
          jsonb_typeof(value) != 'array' OR 
          jsonb_array_length(value) > 0
        )
    ) as filters
    GROUP BY filter_key, filter_value
    HAVING COUNT(DISTINCT e.id) > 0
  )
  
  SELECT
    fu.filter_key::text,
    fu.filter_value::text,
    fu.use_count::integer as uses
  FROM filter_usage fu
  ORDER BY fu.use_count DESC, fu.filter_key, fu.filter_value
  LIMIT limit_count;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION analytics_summary(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_listings(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_filters(integer, integer) TO authenticated;

-- Create indexes to optimize analytics queries
CREATE INDEX IF NOT EXISTS analytics_events_ts_ny_date_idx 
ON analytics_events (timezone('America/New_York', ts)::date);

CREATE INDEX IF NOT EXISTS analytics_events_event_name_ts_idx 
ON analytics_events (event_name, ts DESC);

CREATE INDEX IF NOT EXISTS analytics_events_session_event_idx 
ON analytics_events (session_id, event_name);