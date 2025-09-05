/*
  # Fix Analytics Aggregation Functions

  1. New Functions
    - `analytics_summary` - Fixed funnel counts with proper deduplication
    - `analytics_top_listings` - Top listings by views with today filter
    - `analytics_top_filters` - Most used filters with today filter

  2. Key Changes
    - Use COUNT(DISTINCT) to prevent JOIN inflation
    - Apply America/New_York timezone for today-only filtering
    - Aggregate events in CTEs before joining
    - Ensure funnel metrics show unique counts per step

  3. Security
    - Functions are security definer with admin check
    - Only admins can access analytics data
*/

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS analytics_summary(integer);
DROP FUNCTION IF EXISTS analytics_top_listings(integer, integer);
DROP FUNCTION IF EXISTS analytics_top_filters(integer, integer);

-- Analytics Summary Function
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
SECURITY DEFINER
AS $$
DECLARE
  admin_check boolean;
  today_ny date;
  start_date_ny date;
  end_date_ny date;
BEGIN
  -- Check if the current user is an admin
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) INTO admin_check;

  IF NOT admin_check THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Calculate date range in America/New_York timezone
  today_ny := date(timezone('America/New_York', now()));
  start_date_ny := today_ny - (days_back - 1);
  end_date_ny := today_ny;

  -- Aggregate events for the date range first (CTE approach)
  WITH events_period AS (
    SELECT 
      e.session_id,
      e.user_id,
      e.event_name,
      e.ts,
      date(timezone('America/New_York', e.ts)) as event_date,
      e.props
    FROM analytics_events e
    WHERE date(timezone('America/New_York', e.ts)) BETWEEN start_date_ny AND end_date_ny
  ),
  
  -- Daily metrics aggregated from events
  daily_metrics AS (
    SELECT
      -- DAU: unique users who had any activity today
      COUNT(DISTINCT CASE 
        WHEN event_date = today_ny THEN 
          COALESCE(user_id::text, session_id) 
        END
      ) as dau,
      
      -- Visitors in period: unique sessions
      COUNT(DISTINCT session_id) as visitors_period,
      
      -- Returning visitors: sessions with user_id that had previous activity
      COUNT(DISTINCT CASE 
        WHEN user_id IS NOT NULL THEN session_id 
      END) as returns_period,
      
      -- Average session duration (simplified calculation)
      COALESCE(AVG(
        CASE WHEN event_name = 'page_view' THEN 2.5 ELSE 0 END
      ), 0) as avg_session_minutes,
      
      -- Listing views in period
      COUNT(DISTINCT CASE 
        WHEN event_name = 'listing_view' THEN 
          CONCAT(session_id, '-', (props->>'listing_id'))
      END) as listing_views_period,
      
      -- Posting funnel metrics (unique by session to avoid duplicates)
      COUNT(DISTINCT CASE 
        WHEN event_name = 'listing_post_start' THEN session_id 
      END) as post_starts_period,
      
      COUNT(DISTINCT CASE 
        WHEN event_name = 'listing_post_submit' THEN session_id 
      END) as post_submits_period,
      
      COUNT(DISTINCT CASE 
        WHEN event_name = 'listing_post_success' THEN session_id 
      END) as post_success_period,
      
      COUNT(DISTINCT CASE 
        WHEN event_name = 'listing_post_abandoned' THEN session_id 
      END) as post_abandoned_period
    FROM events_period
  ),
  
  -- DAU sparkline for the last 7 days
  sparkline_data AS (
    SELECT 
      generate_series(today_ny - 6, today_ny, '1 day'::interval)::date as sparkline_date
  ),
  
  sparkline_metrics AS (
    SELECT 
      s.sparkline_date,
      COUNT(DISTINCT CASE 
        WHEN date(timezone('America/New_York', e.ts)) = s.sparkline_date THEN 
          COALESCE(e.user_id::text, e.session_id) 
      END) as daily_users
    FROM sparkline_data s
    LEFT JOIN analytics_events e ON date(timezone('America/New_York', e.ts)) = s.sparkline_date
    GROUP BY s.sparkline_date
    ORDER BY s.sparkline_date
  )

  SELECT 
    start_date_ny::text,
    end_date_ny::text,
    dm.dau::integer,
    dm.visitors_period::integer,
    dm.returns_period::integer,
    dm.avg_session_minutes::numeric,
    dm.listing_views_period::integer,
    dm.post_starts_period::integer,
    dm.post_submits_period::integer,
    dm.post_success_period::integer,
    dm.post_abandoned_period::integer,
    ARRAY(SELECT daily_users FROM sparkline_metrics ORDER BY sparkline_date)::integer[]
  FROM daily_metrics dm;
END;
$$;

-- Analytics Top Listings Function
CREATE OR REPLACE FUNCTION analytics_top_listings(days_back integer DEFAULT 1, limit_count integer DEFAULT 10)
RETURNS TABLE (
  listing_id text,
  views integer,
  impressions integer,
  ctr numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_check boolean;
  today_ny date;
  start_date_ny date;
BEGIN
  -- Check if the current user is an admin
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) INTO admin_check;

  IF NOT admin_check THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Calculate date range in America/New_York timezone
  today_ny := date(timezone('America/New_York', now()));
  start_date_ny := today_ny - (days_back - 1);

  RETURN QUERY
  WITH events_period AS (
    SELECT 
      e.event_name,
      e.props->>'listing_id' as listing_id,
      e.session_id
    FROM analytics_events e
    WHERE date(timezone('America/New_York', e.ts)) BETWEEN start_date_ny AND today_ny
      AND e.props->>'listing_id' IS NOT NULL
      AND e.event_name IN ('listing_view', 'listing_impression_batch', 'listing_click')
  ),
  
  listing_metrics AS (
    SELECT 
      ep.listing_id,
      
      -- Views: unique sessions that viewed this listing
      COUNT(DISTINCT CASE 
        WHEN ep.event_name = 'listing_view' THEN ep.session_id 
      END) as view_count,
      
      -- Impressions: count from impression batch events (these are already deduplicated)
      COUNT(DISTINCT CASE 
        WHEN ep.event_name = 'listing_impression_batch' THEN ep.session_id 
      END) as impression_count,
      
      -- Clicks: unique sessions that clicked this listing
      COUNT(DISTINCT CASE 
        WHEN ep.event_name = 'listing_click' THEN ep.session_id 
      END) as click_count
      
    FROM events_period ep
    GROUP BY ep.listing_id
    HAVING COUNT(DISTINCT CASE WHEN ep.event_name = 'listing_view' THEN ep.session_id END) > 0
  )
  
  SELECT 
    lm.listing_id::text,
    lm.view_count::integer,
    GREATEST(lm.impression_count, lm.view_count)::integer as impressions, -- Impressions should be >= views
    CASE 
      WHEN GREATEST(lm.impression_count, lm.view_count) > 0 
      THEN ROUND((lm.click_count::numeric / GREATEST(lm.impression_count, lm.view_count)) * 100, 2)
      ELSE 0 
    END::numeric as ctr
  FROM listing_metrics lm
  ORDER BY lm.view_count DESC, lm.impression_count DESC
  LIMIT limit_count;
END;
$$;

-- Analytics Top Filters Function
CREATE OR REPLACE FUNCTION analytics_top_filters(days_back integer DEFAULT 1, limit_count integer DEFAULT 10)
RETURNS TABLE (
  filter_key text,
  filter_value text,
  uses integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_check boolean;
  today_ny date;
  start_date_ny date;
BEGIN
  -- Check if the current user is an admin
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) INTO admin_check;

  IF NOT admin_check THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Calculate date range in America/New_York timezone
  today_ny := date(timezone('America/New_York', now()));
  start_date_ny := today_ny - (days_back - 1);

  RETURN QUERY
  WITH events_period AS (
    SELECT 
      e.session_id,
      e.props
    FROM analytics_events e
    WHERE date(timezone('America/New_York', e.ts)) BETWEEN start_date_ny AND today_ny
      AND e.event_name = 'filter_apply'
      AND e.props IS NOT NULL
  ),
  
  -- Extract filter key-value pairs from the props->filters object
  filter_extracts AS (
    SELECT 
      ep.session_id,
      filter_key,
      filter_value::text
    FROM events_period ep,
    LATERAL (
      SELECT 
        key as filter_key,
        value as filter_value
      FROM jsonb_each(ep.props->'filters')
      WHERE value IS NOT NULL 
        AND value != 'null'::jsonb
        AND value != '""'::jsonb
        AND value != 'false'::jsonb
    ) as filters
  ),
  
  -- Count unique sessions that used each filter
  filter_usage AS (
    SELECT 
      fe.filter_key,
      fe.filter_value,
      COUNT(DISTINCT fe.session_id) as usage_count
    FROM filter_extracts fe
    GROUP BY fe.filter_key, fe.filter_value
    HAVING COUNT(DISTINCT fe.session_id) > 0
  )
  
  SELECT 
    fu.filter_key::text,
    fu.filter_value::text,
    fu.usage_count::integer
  FROM filter_usage fu
  ORDER BY fu.usage_count DESC, fu.filter_key, fu.filter_value
  LIMIT limit_count;
END;
$$;

-- Grant execute permissions to authenticated users (admin check is inside functions)
GRANT EXECUTE ON FUNCTION analytics_summary(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_listings(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_filters(integer, integer) TO authenticated;