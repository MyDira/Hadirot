/*
  # Make Analytics Functions Graceful for Non-Admins
  
  1. Problem
    - Analytics functions with require_admin() throw exceptions
    - This breaks the frontend which expects data (not errors)
    
  2. Solution
    - Update functions to check is_admin() and return empty results for non-admins
    - This is still secure (non-admins get no data) but doesn't break the UI
*/

-- Drop and recreate analytics_session_quality with graceful admin check
DROP FUNCTION IF EXISTS analytics_session_quality(integer, text);

CREATE OR REPLACE FUNCTION analytics_session_quality(
  days_back integer DEFAULT 14,
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
  start_ts timestamptz;
BEGIN
  IF NOT is_admin() THEN
    RETURN;
  END IF;
  
  start_ts := (now() AT TIME ZONE tz - (days_back || ' days')::interval);

  RETURN QUERY
  WITH sessions AS (
    SELECT
      ae.session_id,
      ae.anon_id,
      COUNT(*) AS page_count,
      MIN(ae.created_at) AS session_start,
      MAX(ae.created_at) AS session_end
    FROM analytics_events ae
    WHERE ae.created_at >= start_ts
    GROUP BY ae.session_id, ae.anon_id
  ),
  session_metrics AS (
    SELECT
      s.session_id,
      s.anon_id,
      s.page_count,
      EXTRACT(EPOCH FROM (s.session_end - s.session_start)) / 60.0 AS duration_minutes,
      CASE WHEN s.page_count = 1 THEN 1 ELSE 0 END AS is_bounce
    FROM sessions s
  ),
  returning_visitors AS (
    SELECT DISTINCT ae.anon_id
    FROM analytics_events ae
    WHERE ae.created_at < start_ts
  )
  SELECT
    COALESCE(ROUND(AVG(sm.page_count), 1), 0)::numeric,
    COALESCE(ROUND(AVG(sm.is_bounce) * 100, 1), 0)::numeric,
    COALESCE(ROUND(AVG(sm.duration_minutes), 1), 0)::numeric,
    COUNT(DISTINCT sm.session_id)::integer,
    COUNT(DISTINCT sm.anon_id)::integer,
    COALESCE(
      ROUND(
        COUNT(DISTINCT CASE WHEN rv.anon_id IS NOT NULL THEN sm.anon_id END)::numeric / 
        NULLIF(COUNT(DISTINCT sm.anon_id), 0) * 100,
        1
      ),
      0
    )::numeric
  FROM session_metrics sm
  LEFT JOIN returning_visitors rv ON sm.anon_id = rv.anon_id;
END;
$$;

-- Drop and recreate analytics_kpis_with_sparkline with graceful admin check
DROP FUNCTION IF EXISTS analytics_kpis_with_sparkline(text);

CREATE OR REPLACE FUNCTION analytics_kpis_with_sparkline(
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  total_views bigint,
  total_sessions bigint,
  total_inquiries bigint,
  avg_session_duration numeric,
  sparkline_dau integer[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::numeric, ARRAY[]::integer[];
    RETURN;
  END IF;

  RETURN QUERY
  WITH daily_users AS (
    SELECT
      (ae.created_at AT TIME ZONE tz)::date AS day,
      COUNT(DISTINCT ae.anon_id) AS dau
    FROM analytics_events ae
    WHERE ae.created_at >= (now() AT TIME ZONE tz - interval '14 days')
    GROUP BY (ae.created_at AT TIME ZONE tz)::date
    ORDER BY day
  )
  SELECT
    (SELECT COUNT(*) FROM analytics_events WHERE event_name = 'listing_view' AND created_at >= now() - interval '14 days')::bigint,
    (SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE created_at >= now() - interval '14 days')::bigint,
    (SELECT COUNT(*) FROM listing_contact_submissions WHERE created_at >= now() - interval '14 days')::bigint,
    COALESCE((
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (session_end - session_start)) / 60), 1)
      FROM (
        SELECT session_id, MIN(created_at) AS session_start, MAX(created_at) AS session_end
        FROM analytics_events
        WHERE created_at >= now() - interval '14 days'
        GROUP BY session_id
      ) s
    ), 0)::numeric,
    COALESCE(ARRAY_AGG(du.dau ORDER BY du.day), ARRAY[]::integer[])
  FROM daily_users du;
END;
$$;

-- Drop and recreate analytics_engagement_funnel with graceful admin check
DROP FUNCTION IF EXISTS analytics_engagement_funnel(integer, text);

CREATE OR REPLACE FUNCTION analytics_engagement_funnel(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  total_sessions bigint,
  sessions_with_view bigint,
  sessions_with_inquiry bigint,
  view_rate numeric,
  inquiry_rate numeric,
  total_impressions bigint,
  total_views bigint,
  ctr numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  sess_count bigint;
  view_sess_count bigint;
  inq_sess_count bigint;
  imp_count bigint;
  view_count bigint;
BEGIN
  IF NOT is_admin() THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::numeric, 0::numeric, 0::bigint, 0::bigint, 0::numeric;
    RETURN;
  END IF;

  start_ts := (now() AT TIME ZONE tz - (days_back || ' days')::interval);
  
  SELECT COUNT(DISTINCT session_id) INTO sess_count
  FROM analytics_events WHERE created_at >= start_ts;
  
  SELECT COUNT(DISTINCT session_id) INTO view_sess_count
  FROM analytics_events WHERE event_name = 'listing_view' AND created_at >= start_ts;
  
  SELECT COUNT(DISTINCT ae.session_id) INTO inq_sess_count
  FROM analytics_events ae
  JOIN listing_contact_submissions lcs ON ae.session_id IS NOT NULL
  WHERE ae.created_at >= start_ts
  AND lcs.created_at >= start_ts;
  
  SELECT COUNT(*) INTO imp_count
  FROM analytics_events ae,
  LATERAL jsonb_array_elements_text(
    COALESCE(ae.event_properties->'listing_ids', ae.properties->'listing_ids', '[]'::jsonb)
  ) AS listing_id
  WHERE ae.event_name = 'listing_impression'
    AND ae.created_at >= start_ts;
  
  SELECT COUNT(*) INTO view_count
  FROM analytics_events WHERE event_name = 'listing_view' AND created_at >= start_ts;
  
  RETURN QUERY SELECT
    sess_count,
    view_sess_count,
    inq_sess_count,
    CASE WHEN sess_count > 0 THEN ROUND((view_sess_count::numeric / sess_count::numeric) * 100, 1) ELSE 0 END,
    CASE WHEN sess_count > 0 THEN ROUND((inq_sess_count::numeric / sess_count::numeric) * 100, 1) ELSE 0 END,
    imp_count,
    view_count,
    CASE WHEN imp_count > 0 THEN ROUND((view_count::numeric / imp_count::numeric) * 100, 1) ELSE 0 END;
END;
$$;

-- Drop and recreate analytics_summary with graceful admin check  
DROP FUNCTION IF EXISTS analytics_summary(integer, text);

CREATE OR REPLACE FUNCTION analytics_summary(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  total_sessions bigint,
  total_page_views bigint,
  total_listing_views bigint,
  total_inquiries bigint,
  post_starts bigint,
  post_submits bigint,
  post_successes bigint,
  post_abandoned bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
BEGIN
  IF NOT is_admin() THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    RETURN;
  END IF;

  start_ts := (now() AT TIME ZONE tz - (days_back || ' days')::interval);
  
  RETURN QUERY
  SELECT
    (SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE created_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events WHERE event_name = 'page_view' AND created_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events WHERE event_name = 'listing_view' AND created_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM listing_contact_submissions WHERE created_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events WHERE event_name IN ('post_started', 'post_listing_start') AND created_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events WHERE event_name IN ('post_submitted', 'post_listing_submit') AND created_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events WHERE event_name IN ('post_success', 'post_listing_success') AND created_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events WHERE event_name IN ('post_abandoned', 'post_listing_abandoned') AND created_at >= start_ts)::bigint;
END;
$$;

-- Drop and recreate analytics_contact_submissions_summary with graceful admin check
DROP FUNCTION IF EXISTS analytics_contact_submissions_summary(integer, text);

CREATE OR REPLACE FUNCTION analytics_contact_submissions_summary(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  total_submissions bigint,
  unique_listings bigint,
  unique_submitters bigint,
  submissions_by_day jsonb,
  top_listings jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  IF NOT is_admin() THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, '[]'::jsonb, '[]'::jsonb;
    RETURN;
  END IF;

  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1);
  
  RETURN QUERY
  WITH submissions_in_range AS (
    SELECT
      lcs.id,
      lcs.listing_id,
      lcs.name,
      lcs.phone,
      lcs.created_at,
      (lcs.created_at AT TIME ZONE tz)::date AS submission_date
    FROM listing_contact_submissions lcs
    WHERE (lcs.created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
  ),
  daily_counts AS (
    SELECT
      submission_date,
      COUNT(*) AS count
    FROM submissions_in_range
    GROUP BY submission_date
    ORDER BY submission_date
  ),
  top_listing_counts AS (
    SELECT
      s.listing_id,
      l.title,
      l.location,
      COUNT(*) AS submission_count
    FROM submissions_in_range s
    LEFT JOIN listings l ON l.id = s.listing_id
    GROUP BY s.listing_id, l.title, l.location
    ORDER BY submission_count DESC
    LIMIT 10
  )
  SELECT
    (SELECT COUNT(*) FROM submissions_in_range)::bigint,
    (SELECT COUNT(DISTINCT listing_id) FROM submissions_in_range)::bigint,
    (SELECT COUNT(DISTINCT phone) FROM submissions_in_range)::bigint,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('date', submission_date, 'count', count) ORDER BY submission_date)
       FROM daily_counts),
      '[]'::jsonb
    ),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'listing_id', listing_id,
        'title', title,
        'location', location,
        'count', submission_count
      ))
       FROM top_listing_counts),
      '[]'::jsonb
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION analytics_session_quality(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_kpis_with_sparkline(text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_engagement_funnel(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_summary(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_contact_submissions_summary(integer, text) TO authenticated;
