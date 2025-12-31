/*
  # Fix Analytics Hub RPC Functions - Session Column References

  ## Problem
  The Analytics Hub functions deployed on Dec 31, 2024 reference non-existent columns:
  - References `s.id` but analytics_sessions table uses `session_id` as primary key
  - Join logic uses wrong column names

  ## Solution
  Replace all Analytics Hub functions with corrected versions that use proper column names:
  - Change `s.id` → `s.session_id`
  - Change join `e.session_id = s.id` → `e.session_id = s.session_id`

  ## Data Schema (Confirmed)
  analytics_events columns:
  - ts, occurred_at (both exist, both populated)
  - props (empty), event_props (populated)
  - user_agent (empty), ua (populated)
  - ip (empty), ip_hash (populated)
  - session_id (UUID)

  analytics_sessions columns:
  - session_id (UUID, PRIMARY KEY)
  - anon_id, user_id, started_at, last_seen_at, ended_at, duration_seconds

  ## Note
  This is a code-only fix. No schema changes. No data migration.
*/

-- 1. Session Quality Metrics (FIXED: s.id → s.session_id)
CREATE OR REPLACE FUNCTION analytics_session_quality(
  days_back integer DEFAULT 7,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  pages_per_session numeric,
  bounce_rate numeric,
  avg_duration_minutes numeric,
  total_sessions integer,
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
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';

  RETURN QUERY
  WITH session_stats AS (
    SELECT
      s.session_id,
      s.anon_id,
      s.started_at,
      s.duration_seconds,
      COUNT(e.id) as page_count
    FROM analytics_sessions s
    LEFT JOIN analytics_events e ON e.session_id = s.session_id AND e.event_name = 'page_view'
    WHERE (s.started_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    GROUP BY s.session_id, s.anon_id, s.started_at, s.duration_seconds
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
    ROUND(COALESCE(
      (COUNT(CASE WHEN vh.visit_count > 1 THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100,
      0
    ), 1)::numeric as returning_visitor_rate
  FROM session_stats ss
  LEFT JOIN visitor_history vh ON vh.anon_id = ss.anon_id;
END;
$$;

-- 2. Engagement Funnel (already correct - no session table references needing fixes)
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
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';

  RETURN QUERY
  SELECT
    COALESCE((
      SELECT COUNT(DISTINCT session_id)::integer
      FROM analytics_sessions
      WHERE (started_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    ), 0) as sessions,

    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events
      WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
        AND event_name = 'listing_impression_batch'
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
