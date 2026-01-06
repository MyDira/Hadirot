/*
  # Fix Analytics Function Type Mismatches

  ## Overview
  This migration fixes three type mismatch issues in analytics functions that cause
  runtime errors when the return types don't match the actual query output.

  ## Fixes Applied

  ### 1. analytics_zero_inquiry_listings - price column
  - **Issue:** Return type declares `price numeric` but query returns `l.price` (integer)
  - **Fix:** Cast `l.price::numeric` in the SELECT statement
  - **Rationale:** Keep return type as `numeric` for semantic correctness and forward compatibility

  ### 2. analytics_kpis_with_sparkline - sparkline_dau column
  - **Issue:** Return type declares `sparkline_dau integer[]` but COUNT(DISTINCT) returns bigint
  - **Fix:** Cast `COUNT(DISTINCT ae.anon_id)::integer` in the CTE

  ### 3. analytics_engagement_funnel - session join
  - **Issue:** Join compares ae.session_id (uuid) to lcs.session_id (text)
  - **Fix:** Cast `ae.session_id::text = lcs.session_id` in the JOIN condition

  ## Security
  - All functions maintain SECURITY DEFINER
  - All functions use require_admin() for admin-only access
*/

-- ============================================================================
-- 1. Fix analytics_zero_inquiry_listings
--    Cast l.price to numeric to match return type
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_zero_inquiry_listings(integer, integer, integer, text);

CREATE OR REPLACE FUNCTION analytics_zero_inquiry_listings(
  days_back integer DEFAULT 14,
  min_views integer DEFAULT 5,
  limit_count integer DEFAULT 20,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id text,
  title text,
  location text,
  neighborhood text,
  bedrooms integer,
  price numeric,
  views bigint,
  days_since_posted integer,
  is_featured boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  start_ts := (now() AT TIME ZONE tz - (days_back || ' days')::interval);
  
  RETURN QUERY
  WITH view_counts AS (
    SELECT
      COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid,
      COUNT(*) AS view_count
    FROM analytics_events ae
    WHERE ae.event_name = 'listing_view'
      AND ae.occurred_at >= start_ts
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
    GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')
  ),
  listings_with_inquiries AS (
    SELECT DISTINCT lcs.listing_id::text AS lid
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts
  ),
  phone_clicks AS (
    SELECT DISTINCT COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_click'
      AND ae.occurred_at >= start_ts
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
  )
  SELECT
    l.id::text,
    l.title,
    l.location,
    l.neighborhood,
    l.bedrooms,
    l.price::numeric,
    COALESCE(vc.view_count, 0)::bigint,
    EXTRACT(DAY FROM (now() - l.created_at))::integer,
    l.is_featured
  FROM listings l
  LEFT JOIN view_counts vc ON vc.lid = l.id::text
  WHERE l.is_active = true
    AND COALESCE(vc.view_count, 0) >= min_views
    AND l.id::text NOT IN (SELECT lid FROM listings_with_inquiries WHERE lid IS NOT NULL)
    AND l.id::text NOT IN (SELECT lid FROM phone_clicks WHERE lid IS NOT NULL)
  ORDER BY COALESCE(vc.view_count, 0) DESC
  LIMIT limit_count;
END;
$$;

-- ============================================================================
-- 2. Fix analytics_kpis_with_sparkline
--    Cast COUNT(DISTINCT) to integer in CTE to match integer[] return type
-- ============================================================================
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
  PERFORM require_admin();

  RETURN QUERY
  WITH daily_users AS (
    SELECT
      (ae.occurred_at AT TIME ZONE tz)::date AS day,
      COUNT(DISTINCT ae.anon_id)::integer AS dau
    FROM analytics_events ae
    WHERE ae.occurred_at >= (now() AT TIME ZONE tz - interval '14 days')
    GROUP BY (ae.occurred_at AT TIME ZONE tz)::date
    ORDER BY day
  )
  SELECT
    (SELECT COUNT(*) FROM analytics_events WHERE event_name = 'listing_view' AND occurred_at >= now() - interval '14 days')::bigint,
    (SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE occurred_at >= now() - interval '14 days')::bigint,
    (SELECT COUNT(*) FROM listing_contact_submissions WHERE created_at >= now() - interval '14 days')::bigint,
    COALESCE((
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (session_end - session_start)) / 60), 1)
      FROM (
        SELECT session_id, MIN(occurred_at) AS session_start, MAX(occurred_at) AS session_end
        FROM analytics_events
        WHERE occurred_at >= now() - interval '14 days'
        GROUP BY session_id
      ) s
    ), 0)::numeric,
    COALESCE(ARRAY_AGG(du.dau ORDER BY du.day), ARRAY[]::integer[])
  FROM daily_users du;
END;
$$;

-- ============================================================================
-- 3. Fix analytics_engagement_funnel
--    Cast ae.session_id to text when joining with lcs.session_id
-- ============================================================================
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
  PERFORM require_admin();

  start_ts := (now() AT TIME ZONE tz - (days_back || ' days')::interval);
  
  SELECT COUNT(DISTINCT session_id) INTO sess_count
  FROM analytics_events WHERE occurred_at >= start_ts;
  
  SELECT COUNT(DISTINCT session_id) INTO view_sess_count
  FROM analytics_events WHERE event_name = 'listing_view' AND occurred_at >= start_ts;
  
  SELECT COUNT(DISTINCT ae.session_id) INTO inq_sess_count
  FROM analytics_events ae
  JOIN listing_contact_submissions lcs ON ae.session_id::text = lcs.session_id
  WHERE ae.occurred_at >= start_ts
  AND lcs.created_at >= start_ts;
  
  SELECT COUNT(*) INTO imp_count
  FROM analytics_events ae,
  LATERAL jsonb_array_elements_text(
    COALESCE(ae.event_props->'listing_ids', ae.props->'listing_ids', '[]'::jsonb)
  ) AS lid
  WHERE ae.event_name = 'listing_impression'
    AND ae.occurred_at >= start_ts;
  
  SELECT COUNT(*) INTO view_count
  FROM analytics_events WHERE event_name = 'listing_view' AND occurred_at >= start_ts;
  
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

-- ============================================================================
-- Grant execute permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION analytics_zero_inquiry_listings(integer, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_kpis_with_sparkline(text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_engagement_funnel(integer, text) TO authenticated;
