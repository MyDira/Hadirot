/*
  # Create Analytics RPC Functions

  1. New Functions
    - `analytics_summary` - Provides 7-day analytics overview
    - `analytics_top_listings` - Returns top listings by views and impressions
    - `analytics_top_filters` - Shows most commonly used filter combinations

  2. Security
    - All functions require admin privileges
    - Functions are marked as SECURITY DEFINER for elevated access
*/

-- Function to get analytics summary
CREATE OR REPLACE FUNCTION analytics_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  dau_count INTEGER;
  visitors_count INTEGER;
  sessions_count INTEGER;
  avg_session_duration NUMERIC;
  listing_views_count INTEGER;
  listing_posts_count INTEGER;
  conversion_rate NUMERIC;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Get DAU (Daily Active Users) for last 7 days
  SELECT COUNT(DISTINCT user_id)
  INTO dau_count
  FROM analytics_events
  WHERE ts >= NOW() - INTERVAL '7 days'
    AND user_id IS NOT NULL;

  -- Get unique visitors (by session_id) for last 7 days
  SELECT COUNT(DISTINCT session_id)
  INTO visitors_count
  FROM analytics_events
  WHERE ts >= NOW() - INTERVAL '7 days';

  -- Get session count for last 7 days
  SELECT COUNT(DISTINCT session_id)
  INTO sessions_count
  FROM analytics_events
  WHERE ts >= NOW() - INTERVAL '7 days'
    AND event_name = 'page_view';

  -- Calculate average session duration (simplified)
  SELECT COALESCE(AVG(duration_minutes), 0)
  INTO avg_session_duration
  FROM (
    SELECT 
      session_id,
      EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 60 as duration_minutes
    FROM analytics_events
    WHERE ts >= NOW() - INTERVAL '7 days'
    GROUP BY session_id
    HAVING COUNT(*) > 1
  ) session_durations;

  -- Get listing views count for last 7 days
  SELECT COUNT(*)
  INTO listing_views_count
  FROM analytics_events
  WHERE ts >= NOW() - INTERVAL '7 days'
    AND event_name = 'listing_view';

  -- Get listing posts count for last 7 days
  SELECT COUNT(*)
  INTO listing_posts_count
  FROM listings
  WHERE created_at >= NOW() - INTERVAL '7 days';

  -- Calculate conversion rate (posts / unique visitors)
  IF visitors_count > 0 THEN
    conversion_rate := ROUND((listing_posts_count::NUMERIC / visitors_count::NUMERIC) * 100, 2);
  ELSE
    conversion_rate := 0;
  END IF;

  -- Build result JSON
  result := json_build_object(
    'dau', dau_count,
    'visitors', visitors_count,
    'sessions', sessions_count,
    'avg_session_duration', avg_session_duration,
    'listing_views', listing_views_count,
    'listing_posts', listing_posts_count,
    'conversion_rate', conversion_rate
  );

  RETURN result;
END;
$$;

-- Function to get top listings by views
CREATE OR REPLACE FUNCTION analytics_top_listings()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Get top listings with view counts and click-through rates
  SELECT json_agg(
    json_build_object(
      'listing_id', listing_data.listing_id,
      'title', listing_data.title,
      'views', listing_data.views,
      'impressions', listing_data.impressions,
      'ctr', listing_data.ctr
    )
  )
  INTO result
  FROM (
    SELECT 
      l.id as listing_id,
      l.title,
      COALESCE(view_counts.views, 0) as views,
      COALESCE(impression_counts.impressions, 0) as impressions,
      CASE 
        WHEN COALESCE(impression_counts.impressions, 0) > 0 
        THEN ROUND((COALESCE(view_counts.views, 0)::NUMERIC / impression_counts.impressions::NUMERIC) * 100, 2)
        ELSE 0 
      END as ctr
    FROM listings l
    LEFT JOIN (
      SELECT 
        (props->>'listing_id')::uuid as listing_id,
        COUNT(*) as views
      FROM analytics_events
      WHERE event_name = 'listing_view'
        AND ts >= NOW() - INTERVAL '7 days'
        AND props->>'listing_id' IS NOT NULL
      GROUP BY props->>'listing_id'
    ) view_counts ON l.id = view_counts.listing_id
    LEFT JOIN (
      SELECT 
        (props->>'listing_id')::uuid as listing_id,
        COUNT(*) as impressions
      FROM analytics_events
      WHERE event_name = 'listing_impression'
        AND ts >= NOW() - INTERVAL '7 days'
        AND props->>'listing_id' IS NOT NULL
      GROUP BY props->>'listing_id'
    ) impression_counts ON l.id = impression_counts.listing_id
    WHERE l.is_active = true
    ORDER BY COALESCE(view_counts.views, 0) DESC
    LIMIT 10
  ) listing_data;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Function to get top filter combinations
CREATE OR REPLACE FUNCTION analytics_top_filters()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Get top filter combinations
  SELECT json_agg(
    json_build_object(
      'filters', filter_data.filters,
      'count', filter_data.usage_count
    )
  )
  INTO result
  FROM (
    SELECT 
      props->>'filters' as filters,
      COUNT(*) as usage_count
    FROM analytics_events
    WHERE event_name = 'search_filters_applied'
      AND ts >= NOW() - INTERVAL '7 days'
      AND props->>'filters' IS NOT NULL
      AND props->>'filters' != '{}'
    GROUP BY props->>'filters'
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) filter_data;

  RETURN COALESCE(result, '[]'::json);
END;
$$;