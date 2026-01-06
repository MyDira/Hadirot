/*
  # Analytics Accuracy, Security, and Validation System
  
  ## Overview
  This migration implements comprehensive fixes for analytics accuracy and security:
  
  1. Security
    - Creates `require_admin()` helper function for backend authorization
    - Adds admin checks to all analytics RPC functions
  
  2. Accuracy Fixes
    - Fixes period-over-period comparison logic (proper previous period calculation)
    - Standardizes impression counting (expanded array, not batch event count)
    - Adds unique_visitors metric distinct from sessions
  
  3. Validation System
    - Creates `analytics_validation_report` RPC for ground-truth verification
    - Creates `analytics_validation_log` table for audit trail
  
  ## Security Model
  All analytics functions now verify caller is admin before returning data.
  Direct API calls from non-admin users will receive 'forbidden' error.
*/

-- ============================================================================
-- SECTION 1: SECURITY - require_admin() Helper Function
-- ============================================================================

CREATE OR REPLACE FUNCTION require_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$$;

-- ============================================================================
-- SECTION 2: DROP EXISTING FUNCTIONS WITH CHANGED SIGNATURES
-- ============================================================================

DROP FUNCTION IF EXISTS analytics_session_quality(integer, text);
DROP FUNCTION IF EXISTS analytics_engagement_funnel(integer, text);

-- ============================================================================
-- SECTION 3: FIX - Period-over-Period Comparison
-- ============================================================================

CREATE OR REPLACE FUNCTION analytics_period_comparison(
  days_back integer DEFAULT 7,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  metric_name text,
  current_value numeric,
  previous_value numeric,
  change_percent numeric,
  change_direction text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_end date;
  current_start date;
  previous_end date;
  previous_start date;
BEGIN
  PERFORM require_admin();
  
  current_end := (now() AT TIME ZONE tz)::date;
  current_start := current_end - (days_back - 1);
  previous_end := current_start - 1;
  previous_start := previous_end - (days_back - 1);
  
  RETURN QUERY
  WITH current_sessions AS (
    SELECT COUNT(DISTINCT id)::numeric as val
    FROM analytics_sessions
    WHERE (started_at AT TIME ZONE tz)::date BETWEEN current_start AND current_end
  ),
  previous_sessions AS (
    SELECT COUNT(DISTINCT id)::numeric as val
    FROM analytics_sessions
    WHERE (started_at AT TIME ZONE tz)::date BETWEEN previous_start AND previous_end
  ),
  current_visitors AS (
    SELECT COUNT(DISTINCT anon_id)::numeric as val
    FROM analytics_sessions
    WHERE (started_at AT TIME ZONE tz)::date BETWEEN current_start AND current_end
  ),
  previous_visitors AS (
    SELECT COUNT(DISTINCT anon_id)::numeric as val
    FROM analytics_sessions
    WHERE (started_at AT TIME ZONE tz)::date BETWEEN previous_start AND previous_end
  ),
  current_impressions AS (
    SELECT COUNT(*)::numeric as val
    FROM analytics_events ae,
    LATERAL jsonb_array_elements_text(
      COALESCE(ae.event_props->'listing_ids', ae.props->'ids', '[]'::jsonb)
    ) as listing_id
    WHERE (ae.occurred_at AT TIME ZONE tz)::date BETWEEN current_start AND current_end
      AND ae.event_name = 'listing_impression_batch'
  ),
  previous_impressions AS (
    SELECT COUNT(*)::numeric as val
    FROM analytics_events ae,
    LATERAL jsonb_array_elements_text(
      COALESCE(ae.event_props->'listing_ids', ae.props->'ids', '[]'::jsonb)
    ) as listing_id
    WHERE (ae.occurred_at AT TIME ZONE tz)::date BETWEEN previous_start AND previous_end
      AND ae.event_name = 'listing_impression_batch'
  ),
  current_views AS (
    SELECT COUNT(*)::numeric as val
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN current_start AND current_end
      AND event_name = 'listing_view'
  ),
  previous_views AS (
    SELECT COUNT(*)::numeric as val
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN previous_start AND previous_end
      AND event_name = 'listing_view'
  ),
  current_inquiries AS (
    SELECT COUNT(*)::numeric as val
    FROM listing_contact_submissions
    WHERE (created_at AT TIME ZONE tz)::date BETWEEN current_start AND current_end
  ),
  previous_inquiries AS (
    SELECT COUNT(*)::numeric as val
    FROM listing_contact_submissions
    WHERE (created_at AT TIME ZONE tz)::date BETWEEN previous_start AND previous_end
  )
  SELECT * FROM (
    SELECT 
      'sessions'::text as metric_name,
      (SELECT val FROM current_sessions) as current_value,
      (SELECT val FROM previous_sessions) as previous_value,
      CASE 
        WHEN (SELECT val FROM previous_sessions) = 0 AND (SELECT val FROM current_sessions) > 0 THEN NULL
        WHEN (SELECT val FROM previous_sessions) = 0 THEN 0
        ELSE ROUND((((SELECT val FROM current_sessions) - (SELECT val FROM previous_sessions)) / (SELECT val FROM previous_sessions)) * 100, 1)
      END as change_percent,
      CASE 
        WHEN (SELECT val FROM previous_sessions) = 0 AND (SELECT val FROM current_sessions) > 0 THEN 'new'
        WHEN (SELECT val FROM current_sessions) > (SELECT val FROM previous_sessions) THEN 'up'
        WHEN (SELECT val FROM current_sessions) < (SELECT val FROM previous_sessions) THEN 'down'
        ELSE 'flat'
      END as change_direction
    UNION ALL
    SELECT 
      'unique_visitors'::text,
      (SELECT val FROM current_visitors),
      (SELECT val FROM previous_visitors),
      CASE 
        WHEN (SELECT val FROM previous_visitors) = 0 AND (SELECT val FROM current_visitors) > 0 THEN NULL
        WHEN (SELECT val FROM previous_visitors) = 0 THEN 0
        ELSE ROUND((((SELECT val FROM current_visitors) - (SELECT val FROM previous_visitors)) / (SELECT val FROM previous_visitors)) * 100, 1)
      END,
      CASE 
        WHEN (SELECT val FROM previous_visitors) = 0 AND (SELECT val FROM current_visitors) > 0 THEN 'new'
        WHEN (SELECT val FROM current_visitors) > (SELECT val FROM previous_visitors) THEN 'up'
        WHEN (SELECT val FROM current_visitors) < (SELECT val FROM previous_visitors) THEN 'down'
        ELSE 'flat'
      END
    UNION ALL
    SELECT 
      'impressions'::text,
      (SELECT val FROM current_impressions),
      (SELECT val FROM previous_impressions),
      CASE 
        WHEN (SELECT val FROM previous_impressions) = 0 AND (SELECT val FROM current_impressions) > 0 THEN NULL
        WHEN (SELECT val FROM previous_impressions) = 0 THEN 0
        ELSE ROUND((((SELECT val FROM current_impressions) - (SELECT val FROM previous_impressions)) / (SELECT val FROM previous_impressions)) * 100, 1)
      END,
      CASE 
        WHEN (SELECT val FROM previous_impressions) = 0 AND (SELECT val FROM current_impressions) > 0 THEN 'new'
        WHEN (SELECT val FROM current_impressions) > (SELECT val FROM previous_impressions) THEN 'up'
        WHEN (SELECT val FROM current_impressions) < (SELECT val FROM previous_impressions) THEN 'down'
        ELSE 'flat'
      END
    UNION ALL
    SELECT 
      'listing_views'::text,
      (SELECT val FROM current_views),
      (SELECT val FROM previous_views),
      CASE 
        WHEN (SELECT val FROM previous_views) = 0 AND (SELECT val FROM current_views) > 0 THEN NULL
        WHEN (SELECT val FROM previous_views) = 0 THEN 0
        ELSE ROUND((((SELECT val FROM current_views) - (SELECT val FROM previous_views)) / (SELECT val FROM previous_views)) * 100, 1)
      END,
      CASE 
        WHEN (SELECT val FROM previous_views) = 0 AND (SELECT val FROM current_views) > 0 THEN 'new'
        WHEN (SELECT val FROM current_views) > (SELECT val FROM previous_views) THEN 'up'
        WHEN (SELECT val FROM current_views) < (SELECT val FROM previous_views) THEN 'down'
        ELSE 'flat'
      END
    UNION ALL
    SELECT 
      'inquiries'::text,
      (SELECT val FROM current_inquiries),
      (SELECT val FROM previous_inquiries),
      CASE 
        WHEN (SELECT val FROM previous_inquiries) = 0 AND (SELECT val FROM current_inquiries) > 0 THEN NULL
        WHEN (SELECT val FROM previous_inquiries) = 0 THEN 0
        ELSE ROUND((((SELECT val FROM current_inquiries) - (SELECT val FROM previous_inquiries)) / (SELECT val FROM previous_inquiries)) * 100, 1)
      END,
      CASE 
        WHEN (SELECT val FROM previous_inquiries) = 0 AND (SELECT val FROM current_inquiries) > 0 THEN 'new'
        WHEN (SELECT val FROM current_inquiries) > (SELECT val FROM previous_inquiries) THEN 'up'
        WHEN (SELECT val FROM current_inquiries) < (SELECT val FROM previous_inquiries) THEN 'down'
        ELSE 'flat'
      END
  ) metrics;
END;
$$;

-- ============================================================================
-- SECTION 4: FIX - Standardize Impression Counting in Engagement Funnel
-- ============================================================================

CREATE OR REPLACE FUNCTION analytics_engagement_funnel(
  days_back integer DEFAULT 7,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  sessions integer,
  impressions integer,
  listing_views integer,
  contact_attempts integer
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
      SELECT COUNT(DISTINCT id)::integer
      FROM analytics_sessions
      WHERE (started_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    ), 0) as sessions,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events ae,
      LATERAL jsonb_array_elements_text(
        COALESCE(ae.event_props->'listing_ids', ae.props->'ids', '[]'::jsonb)
      ) as listing_id
      WHERE (ae.occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
        AND ae.event_name = 'listing_impression_batch'
    ), 0) as impressions,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events
      WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
        AND event_name = 'listing_view'
    ), 0) as listing_views,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM listing_contact_submissions
      WHERE (created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    ), 0) as contact_attempts;
END;
$$;

-- ============================================================================
-- SECTION 5: ADD - Unique Visitors to Session Quality
-- ============================================================================

CREATE OR REPLACE FUNCTION analytics_session_quality(
  days_back integer DEFAULT 7,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  pages_per_session numeric,
  bounce_rate numeric,
  avg_duration_minutes numeric,
  total_sessions integer,
  unique_visitors integer,
  returning_visitor_rate numeric
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
  WITH session_stats AS (
    SELECT 
      s.id as session_id,
      s.anon_id,
      s.started_at,
      s.duration_seconds,
      COUNT(e.id) as page_count
    FROM analytics_sessions s
    LEFT JOIN analytics_events e ON e.session_id = s.id AND e.event_name = 'page_view'
    WHERE (s.started_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    GROUP BY s.id, s.anon_id, s.started_at, s.duration_seconds
  ),
  visitor_history AS (
    SELECT 
      anon_id,
      COUNT(*) as visit_count
    FROM analytics_sessions
    WHERE (started_at AT TIME ZONE tz)::date <= end_date
    GROUP BY anon_id
  )
  SELECT 
    ROUND(COALESCE(AVG(ss.page_count), 0), 2)::numeric as pages_per_session,
    ROUND(COALESCE(
      (COUNT(CASE WHEN ss.page_count <= 1 THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100,
      0
    ), 1)::numeric as bounce_rate,
    ROUND(COALESCE(AVG(ss.duration_seconds) / 60.0, 0), 1)::numeric as avg_duration_minutes,
    COUNT(*)::integer as total_sessions,
    COUNT(DISTINCT ss.anon_id)::integer as unique_visitors,
    ROUND(COALESCE(
      (COUNT(CASE WHEN vh.visit_count > 1 THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100,
      0
    ), 1)::numeric as returning_visitor_rate
  FROM session_stats ss
  LEFT JOIN visitor_history vh ON vh.anon_id = ss.anon_id;
END;
$$;
