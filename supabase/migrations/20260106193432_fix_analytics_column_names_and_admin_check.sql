/*
  # Fix Analytics Functions - Column Names and Admin Check

  ## Overview
  This migration fixes analytics functions that reference non-existent columns
  and one function that still references the dropped is_admin() helper.

  ## Live Database Schema Evidence
  From direct queries to the remote database:
  - analytics_events: has "occurred_at" (NOT "created_at"), "event_props" (NOT "event_properties")
  - listings: has "is_active" (NOT "status"), "user_id" (NOT "owner_id")
  - listing_contact_submissions: has "user_phone" (NOT "phone"), "user_name" (NOT "name")
  - analytics_sessions: has "session_id" as primary key (NOT "id")

  ## Functions Fixed
  1. analytics_contact_submissions_summary - Replace is_admin() with require_admin(), fix column names
  2. analytics_listing_drilldown - Drop duplicate signatures, create single canonical version
  3. analytics_session_quality - Fix ae.created_at -> ae.occurred_at
  4. analytics_kpis_with_sparkline - Fix ae.created_at -> ae.occurred_at
  5. analytics_engagement_funnel - Fix ae.created_at/event_properties -> ae.occurred_at/event_props
  6. analytics_summary - Fix ae.created_at -> ae.occurred_at
  7. analytics_supply_stats - Fix l.status -> l.is_active
  8. analytics_listings_performance - Fix ae.created_at/event_properties, l.status
  9. analytics_zero_inquiry_listings - Fix ae.created_at/event_properties, l.status
  10. analytics_top_filters - Fix ae.created_at/event_properties
  11. analytics_inquiry_quality - Fix lcs.phone -> lcs.user_phone
  12. analytics_abuse_signals - Fix lcs.phone -> lcs.user_phone

  ## Security
  - All functions use require_admin() for admin-only access
  - SECURITY DEFINER maintained for all functions
*/

-- ============================================================================
-- 1. Fix analytics_contact_submissions_summary
--    Issue: Uses dropped is_admin() and wrong column names (name, phone)
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_contact_submissions_summary(integer, text);

CREATE OR REPLACE FUNCTION analytics_contact_submissions_summary(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  total_submissions bigint,
  submissions_with_consent bigint,
  unique_listings bigint,
  consent_rate numeric
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
  start_date := end_date - (days_back - 1);
  
  RETURN QUERY
  WITH submissions_in_range AS (
    SELECT
      lcs.id,
      lcs.listing_id,
      lcs.user_name,
      lcs.user_phone,
      lcs.consent_to_followup,
      lcs.created_at
    FROM listing_contact_submissions lcs
    WHERE (lcs.created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
  )
  SELECT
    COUNT(*)::bigint AS total_submissions,
    COUNT(*) FILTER (WHERE consent_to_followup = true)::bigint AS submissions_with_consent,
    COUNT(DISTINCT listing_id)::bigint AS unique_listings,
    CASE 
      WHEN COUNT(*) > 0 
      THEN ROUND((COUNT(*) FILTER (WHERE consent_to_followup = true)::numeric / COUNT(*)::numeric) * 100, 1)
      ELSE 0 
    END AS consent_rate
  FROM submissions_in_range;
END;
$$;

-- ============================================================================
-- 2. Fix analytics_listing_drilldown
--    Issue: Multiple versions with conflicting signatures
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_listing_drilldown(uuid);
DROP FUNCTION IF EXISTS analytics_listing_drilldown(uuid, integer);
DROP FUNCTION IF EXISTS analytics_listing_drilldown(uuid, integer, text);
DROP FUNCTION IF EXISTS analytics_listing_drilldown(uuid, text, integer);

CREATE OR REPLACE FUNCTION analytics_listing_drilldown(
  p_listing_id uuid,
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id uuid,
  title text,
  location text,
  neighborhood text,
  bedrooms integer,
  price integer,
  is_featured boolean,
  created_at timestamptz,
  views integer,
  impressions integer,
  ctr numeric,
  phone_clicks integer,
  inquiry_count integer,
  hours_to_first_inquiry numeric,
  views_by_day jsonb,
  inquiries jsonb
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
  WITH daily_views AS (
    SELECT
      (ae.occurred_at AT TIME ZONE tz)::date as day_date,
      COUNT(*)::integer as view_count
    FROM analytics_events ae
    WHERE (ae.occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND ae.event_name = 'listing_view'
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id'))::uuid = p_listing_id
    GROUP BY (ae.occurred_at AT TIME ZONE tz)::date
  ),
  date_series AS (
    SELECT generate_series(start_date, end_date, '1 day'::interval)::date as day_date
  ),
  views_filled AS (
    SELECT
      ds.day_date,
      COALESCE(dv.view_count, 0) as view_count
    FROM date_series ds
    LEFT JOIN daily_views dv ON dv.day_date = ds.day_date
    ORDER BY ds.day_date
  ),
  total_views AS (
    SELECT COUNT(*)::integer as count
    FROM analytics_events ae
    WHERE (ae.occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND ae.event_name = 'listing_view'
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id'))::uuid = p_listing_id
  ),
  total_impressions AS (
    SELECT COUNT(*)::integer as count
    FROM analytics_events ae
    WHERE (ae.occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND ae.event_name = 'listing_impression_batch'
      AND COALESCE(ae.event_props->'listing_ids', ae.props->'listing_ids') ? p_listing_id::text
  ),
  total_phone_clicks AS (
    SELECT COUNT(*)::integer as count
    FROM analytics_events ae
    WHERE (ae.occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND ae.event_name = 'phone_click'
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id'))::uuid = p_listing_id
  ),
  inquiry_details AS (
    SELECT
      lcs.id as inquiry_id,
      lcs.user_name as inquiry_user_name,
      lcs.user_phone as inquiry_user_phone,
      lcs.created_at as inquiry_created_at
    FROM listing_contact_submissions lcs
    WHERE lcs.listing_id = p_listing_id
    ORDER BY lcs.created_at DESC
    LIMIT 50
  ),
  first_inquiry AS (
    SELECT MIN(lcs.created_at) as first_inq
    FROM listing_contact_submissions lcs
    WHERE lcs.listing_id = p_listing_id
  )
  SELECT
    l.id as listing_id,
    l.title,
    l.location,
    l.neighborhood,
    l.bedrooms,
    l.price::integer,
    l.is_featured,
    l.created_at,
    (SELECT count FROM total_views) as views,
    (SELECT count FROM total_impressions) as impressions,
    CASE
      WHEN (SELECT count FROM total_impressions) > 0
      THEN ROUND(((SELECT count FROM total_views)::numeric / (SELECT count FROM total_impressions)) * 100, 2)
      ELSE 0
    END as ctr,
    (SELECT count FROM total_phone_clicks) as phone_clicks,
    (SELECT COUNT(*)::integer FROM inquiry_details) as inquiry_count,
    CASE
      WHEN (SELECT first_inq FROM first_inquiry) IS NOT NULL
      THEN ROUND(EXTRACT(EPOCH FROM ((SELECT first_inq FROM first_inquiry) - l.created_at)) / 3600, 1)
      ELSE NULL
    END as hours_to_first_inquiry,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('date', day_date, 'views', view_count) ORDER BY day_date) FROM views_filled),
      '[]'::jsonb
    ) as views_by_day,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', inquiry_id, 'name', inquiry_user_name, 'phone', inquiry_user_phone, 'created_at', inquiry_created_at) ORDER BY inquiry_created_at DESC) FROM inquiry_details),
      '[]'::jsonb
    ) as inquiries
  FROM listings l
  WHERE l.id = p_listing_id;
END;
$$;

-- ============================================================================
-- 3. Fix analytics_session_quality
--    Issue: Uses ae.created_at instead of ae.occurred_at
-- ============================================================================
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
  PERFORM require_admin();
  
  start_ts := (now() AT TIME ZONE tz - (days_back || ' days')::interval);

  RETURN QUERY
  WITH sessions AS (
    SELECT
      ae.session_id,
      ae.anon_id,
      COUNT(*) AS page_count,
      MIN(ae.occurred_at) AS session_start,
      MAX(ae.occurred_at) AS session_end
    FROM analytics_events ae
    WHERE ae.occurred_at >= start_ts
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
    WHERE ae.occurred_at < start_ts
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

-- ============================================================================
-- 4. Fix analytics_kpis_with_sparkline
--    Issue: Uses ae.created_at instead of ae.occurred_at
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
      COUNT(DISTINCT ae.anon_id) AS dau
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
-- 5. Fix analytics_engagement_funnel
--    Issue: Uses ae.created_at and ae.event_properties
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
  JOIN listing_contact_submissions lcs ON ae.session_id = lcs.session_id
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
-- 6. Fix analytics_summary
--    Issue: Uses ae.created_at instead of ae.occurred_at
-- ============================================================================
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
  PERFORM require_admin();

  start_ts := (now() AT TIME ZONE tz - (days_back || ' days')::interval);
  
  RETURN QUERY
  SELECT
    (SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE occurred_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events WHERE event_name = 'page_view' AND occurred_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events WHERE event_name = 'listing_view' AND occurred_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM listing_contact_submissions WHERE created_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events WHERE event_name IN ('post_started', 'post_listing_start') AND occurred_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events WHERE event_name IN ('post_submitted', 'post_listing_submit') AND occurred_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events WHERE event_name IN ('post_success', 'post_listing_success') AND occurred_at >= start_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events WHERE event_name IN ('post_abandoned', 'post_listing_abandoned') AND occurred_at >= start_ts)::bigint;
END;
$$;

-- ============================================================================
-- 7. Fix analytics_supply_stats
--    Issue: Uses l.status instead of l.is_active
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_supply_stats(integer, text);

CREATE OR REPLACE FUNCTION analytics_supply_stats(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  active_count bigint,
  inactive_count bigint,
  new_last_7_days bigint,
  new_last_30_days bigint,
  by_neighborhood jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM require_admin();

  RETURN QUERY
  WITH neighborhood_counts AS (
    SELECT
      l.neighborhood,
      COUNT(*) AS count
    FROM listings l
    WHERE l.is_active = true
    GROUP BY l.neighborhood
    ORDER BY count DESC
    LIMIT 10
  )
  SELECT
    (SELECT COUNT(*) FROM listings WHERE is_active = true)::bigint,
    (SELECT COUNT(*) FROM listings WHERE is_active = false)::bigint,
    (SELECT COUNT(*) FROM listings WHERE created_at >= now() - interval '7 days')::bigint,
    (SELECT COUNT(*) FROM listings WHERE created_at >= now() - interval '30 days')::bigint,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('neighborhood', neighborhood, 'count', count))
       FROM neighborhood_counts),
      '[]'::jsonb
    );
END;
$$;

-- ============================================================================
-- 8. Fix analytics_listings_performance
--    Issue: Uses ae.created_at, ae.event_properties, l.status
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_listings_performance(integer, integer, text);

CREATE OR REPLACE FUNCTION analytics_listings_performance(
  days_back integer DEFAULT 14,
  limit_count integer DEFAULT 20,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id uuid,
  title text,
  location text,
  views bigint,
  inquiries bigint,
  conversion_rate numeric
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
    GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')
  ),
  inquiry_counts AS (
    SELECT
      lcs.listing_id::text AS lid,
      COUNT(*) AS inq_count
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts
    GROUP BY lcs.listing_id
  )
  SELECT
    l.id,
    l.title,
    l.location,
    COALESCE(vc.view_count, 0)::bigint,
    COALESCE(ic.inq_count, 0)::bigint,
    CASE WHEN COALESCE(vc.view_count, 0) > 0 
      THEN ROUND((COALESCE(ic.inq_count, 0)::numeric / vc.view_count::numeric) * 100, 1)
      ELSE 0 
    END
  FROM listings l
  LEFT JOIN view_counts vc ON vc.lid = l.id::text
  LEFT JOIN inquiry_counts ic ON ic.lid = l.id::text
  WHERE l.is_active = true
  ORDER BY COALESCE(vc.view_count, 0) DESC
  LIMIT limit_count;
END;
$$;

-- ============================================================================
-- 9. Fix analytics_zero_inquiry_listings
--    Issue: Uses ae.created_at, ae.event_properties, l.status
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
    l.price,
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
-- 10. Fix analytics_top_filters
--     Issue: Uses ae.created_at and ae.event_properties
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_top_filters(integer, integer, text);

CREATE OR REPLACE FUNCTION analytics_top_filters(
  days_back integer DEFAULT 14,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  filter_key text,
  filter_value text,
  uses bigint
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
  WITH filter_events AS (
    SELECT ae.event_props, ae.props
    FROM analytics_events ae
    WHERE ae.event_name = 'filter_apply'
      AND ae.occurred_at >= start_ts
  ),
  extracted_filters AS (
    SELECT key, value
    FROM filter_events,
    LATERAL jsonb_each_text(COALESCE(event_props->'filters', props->'filters', '{}'::jsonb))
    WHERE value IS NOT NULL AND value != '' AND value != 'null'
  )
  SELECT
    key,
    value,
    COUNT(*)::bigint AS use_count
  FROM extracted_filters
  GROUP BY key, value
  ORDER BY use_count DESC
  LIMIT limit_count;
END;
$$;

-- ============================================================================
-- 11. Fix analytics_inquiry_quality
--     Issue: Uses lcs.phone instead of lcs.user_phone
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_inquiry_quality(integer, text);

CREATE OR REPLACE FUNCTION analytics_inquiry_quality(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  total_inquiries bigint,
  unique_inquirers bigint,
  avg_per_listing numeric,
  repeat_inquirer_rate numeric
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
  start_date := end_date - (days_back - 1);
  
  RETURN QUERY
  WITH inquiries AS (
    SELECT lcs.id, lcs.listing_id, lcs.user_phone
    FROM listing_contact_submissions lcs
    WHERE (lcs.created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
  ),
  repeat_inquirers AS (
    SELECT user_phone FROM inquiries GROUP BY user_phone HAVING COUNT(*) > 1
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(DISTINCT user_phone)::bigint,
    ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT listing_id), 0), 1),
    ROUND(
      COUNT(DISTINCT CASE WHEN user_phone IN (SELECT user_phone FROM repeat_inquirers) THEN user_phone END)::numeric /
      NULLIF(COUNT(DISTINCT user_phone), 0) * 100,
      1
    )
  FROM inquiries;
END;
$$;

-- ============================================================================
-- 12. Fix analytics_abuse_signals
--     Issue: Uses lcs.phone instead of lcs.user_phone
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_abuse_signals(integer, integer, integer, text);

CREATE OR REPLACE FUNCTION analytics_abuse_signals(
  days_back integer DEFAULT 14,
  mild_threshold integer DEFAULT 6,
  extreme_threshold integer DEFAULT 15,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  phone text,
  inquiry_count bigint,
  unique_listings bigint,
  severity text
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
  SELECT
    lcs.user_phone,
    COUNT(*)::bigint,
    COUNT(DISTINCT lcs.listing_id)::bigint,
    CASE
      WHEN COUNT(*) >= extreme_threshold THEN 'extreme'
      WHEN COUNT(*) >= mild_threshold THEN 'mild'
      ELSE 'normal'
    END
  FROM listing_contact_submissions lcs
  WHERE lcs.created_at >= start_ts
  GROUP BY lcs.user_phone
  HAVING COUNT(*) >= mild_threshold
  ORDER BY COUNT(*) DESC
  LIMIT 20;
END;
$$;

-- ============================================================================
-- Grant execute permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION analytics_contact_submissions_summary(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_listing_drilldown(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_session_quality(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_kpis_with_sparkline(text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_engagement_funnel(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_summary(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_supply_stats(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_listings_performance(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_zero_inquiry_listings(integer, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_filters(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_quality(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_abuse_signals(integer, integer, integer, text) TO authenticated;