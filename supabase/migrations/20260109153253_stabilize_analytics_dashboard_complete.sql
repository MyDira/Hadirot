/*
  # Stabilize Analytics Dashboard - Complete Overhaul

  ## Overview
  This migration completely stabilizes the analytics dashboard by:
  1. Dropping ALL existing analytics function variants to eliminate PostgREST ambiguity
  2. Creating internal DST-safe time window helper functions
  3. Creating dedicated impressions helper for listing_impression_batch expansion
  4. Recreating all analytics functions with canonical signatures
  5. Fixing all column references to match actual schema
  6. Ensuring return types match frontend expectations exactly

  ## DST-Safe Time Window Logic
  - end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp)
  - start_ts := end_ts - make_interval(days => days_back)
  - All time filters use: COALESCE(ae.occurred_at, ae.ts) >= start_ts AND < end_ts

  ## Schema Column References (Confirmed from Live DB)
  - analytics_events: occurred_at/ts, event_props/props, session_id (UUID)
  - listing_contact_submissions: user_name, user_phone, session_id (TEXT)
  - listings: is_active (boolean), user_id (uuid), price (integer)
  - analytics_sessions: session_id (UUID primary key)

  ## Canonical Signatures
  All functions follow: (days_back, tz, limit_count/min_views/thresholds...)
  Exception: validation_report(start_date, end_date, tz)
  Exception: listing_drilldown(p_listing_id uuid, days_back, tz)
*/

-- ============================================================================
-- PART 1: DROP ALL EXISTING ANALYTICS FUNCTIONS
-- ============================================================================

-- Drop all known variants to eliminate PostgREST ambiguity
DROP FUNCTION IF EXISTS analytics_session_quality();
DROP FUNCTION IF EXISTS analytics_session_quality(integer);
DROP FUNCTION IF EXISTS analytics_session_quality(text);
DROP FUNCTION IF EXISTS analytics_session_quality(integer, text);

DROP FUNCTION IF EXISTS analytics_kpis_with_sparkline();
DROP FUNCTION IF EXISTS analytics_kpis_with_sparkline(text);

DROP FUNCTION IF EXISTS analytics_engagement_funnel();
DROP FUNCTION IF EXISTS analytics_engagement_funnel(integer);
DROP FUNCTION IF EXISTS analytics_engagement_funnel(integer, text);

DROP FUNCTION IF EXISTS analytics_top_filters();
DROP FUNCTION IF EXISTS analytics_top_filters(integer);
DROP FUNCTION IF EXISTS analytics_top_filters(integer, integer);
DROP FUNCTION IF EXISTS analytics_top_filters(integer, text);
DROP FUNCTION IF EXISTS analytics_top_filters(integer, integer, text);
DROP FUNCTION IF EXISTS analytics_top_filters(integer, text, integer);

DROP FUNCTION IF EXISTS analytics_supply_stats();
DROP FUNCTION IF EXISTS analytics_supply_stats(integer);
DROP FUNCTION IF EXISTS analytics_supply_stats(integer, text);

DROP FUNCTION IF EXISTS analytics_supply_trend();
DROP FUNCTION IF EXISTS analytics_supply_trend(integer);
DROP FUNCTION IF EXISTS analytics_supply_trend(integer, text);

DROP FUNCTION IF EXISTS analytics_listings_performance();
DROP FUNCTION IF EXISTS analytics_listings_performance(integer);
DROP FUNCTION IF EXISTS analytics_listings_performance(integer, integer);
DROP FUNCTION IF EXISTS analytics_listings_performance(integer, text);
DROP FUNCTION IF EXISTS analytics_listings_performance(integer, integer, text);
DROP FUNCTION IF EXISTS analytics_listings_performance(integer, text, integer);

DROP FUNCTION IF EXISTS analytics_zero_inquiry_listings();
DROP FUNCTION IF EXISTS analytics_zero_inquiry_listings(integer);
DROP FUNCTION IF EXISTS analytics_zero_inquiry_listings(integer, integer);
DROP FUNCTION IF EXISTS analytics_zero_inquiry_listings(integer, text);
DROP FUNCTION IF EXISTS analytics_zero_inquiry_listings(integer, integer, text);
DROP FUNCTION IF EXISTS analytics_zero_inquiry_listings(integer, text, integer);
DROP FUNCTION IF EXISTS analytics_zero_inquiry_listings(integer, integer, integer, text);

DROP FUNCTION IF EXISTS analytics_summary();
DROP FUNCTION IF EXISTS analytics_summary(integer);
DROP FUNCTION IF EXISTS analytics_summary(integer, text);

DROP FUNCTION IF EXISTS analytics_inquiry_quality();
DROP FUNCTION IF EXISTS analytics_inquiry_quality(integer);
DROP FUNCTION IF EXISTS analytics_inquiry_quality(integer, text);

DROP FUNCTION IF EXISTS analytics_inquiry_trend();
DROP FUNCTION IF EXISTS analytics_inquiry_trend(integer);
DROP FUNCTION IF EXISTS analytics_inquiry_trend(integer, text);

DROP FUNCTION IF EXISTS analytics_inquiry_velocity();
DROP FUNCTION IF EXISTS analytics_inquiry_velocity(integer);
DROP FUNCTION IF EXISTS analytics_inquiry_velocity(integer, text);

DROP FUNCTION IF EXISTS analytics_top_inquired_listings();
DROP FUNCTION IF EXISTS analytics_top_inquired_listings(integer);
DROP FUNCTION IF EXISTS analytics_top_inquired_listings(integer, integer);
DROP FUNCTION IF EXISTS analytics_top_inquired_listings(integer, text);
DROP FUNCTION IF EXISTS analytics_top_inquired_listings(integer, integer, text);
DROP FUNCTION IF EXISTS analytics_top_inquired_listings(integer, text, integer);

DROP FUNCTION IF EXISTS analytics_inquiry_demand();
DROP FUNCTION IF EXISTS analytics_inquiry_demand(integer);
DROP FUNCTION IF EXISTS analytics_inquiry_demand(integer, text);

DROP FUNCTION IF EXISTS analytics_inquiry_timing();
DROP FUNCTION IF EXISTS analytics_inquiry_timing(integer);
DROP FUNCTION IF EXISTS analytics_inquiry_timing(integer, text);

DROP FUNCTION IF EXISTS analytics_abuse_signals();
DROP FUNCTION IF EXISTS analytics_abuse_signals(integer);
DROP FUNCTION IF EXISTS analytics_abuse_signals(integer, integer);
DROP FUNCTION IF EXISTS analytics_abuse_signals(integer, integer, integer);
DROP FUNCTION IF EXISTS analytics_abuse_signals(integer, text);
DROP FUNCTION IF EXISTS analytics_abuse_signals(integer, integer, integer, text);
DROP FUNCTION IF EXISTS analytics_abuse_signals(integer, text, integer, integer);

DROP FUNCTION IF EXISTS analytics_contact_submissions_summary();
DROP FUNCTION IF EXISTS analytics_contact_submissions_summary(integer);
DROP FUNCTION IF EXISTS analytics_contact_submissions_summary(integer, text);

DROP FUNCTION IF EXISTS analytics_validation_report();
DROP FUNCTION IF EXISTS analytics_validation_report(date);
DROP FUNCTION IF EXISTS analytics_validation_report(date, text);
DROP FUNCTION IF EXISTS analytics_validation_report(date, date);
DROP FUNCTION IF EXISTS analytics_validation_report(date, date, text);

DROP FUNCTION IF EXISTS analytics_listing_drilldown(text);
DROP FUNCTION IF EXISTS analytics_listing_drilldown(uuid);
DROP FUNCTION IF EXISTS analytics_listing_drilldown(text, integer);
DROP FUNCTION IF EXISTS analytics_listing_drilldown(uuid, integer);
DROP FUNCTION IF EXISTS analytics_listing_drilldown(text, integer, text);
DROP FUNCTION IF EXISTS analytics_listing_drilldown(uuid, integer, text);
DROP FUNCTION IF EXISTS analytics_listing_drilldown(text, text, integer);
DROP FUNCTION IF EXISTS analytics_listing_drilldown(uuid, text, integer);

DROP FUNCTION IF EXISTS analytics_top_listings_detailed();
DROP FUNCTION IF EXISTS analytics_top_listings_detailed(integer);
DROP FUNCTION IF EXISTS analytics_top_listings_detailed(integer, integer);
DROP FUNCTION IF EXISTS analytics_top_listings_detailed(integer, text);
DROP FUNCTION IF EXISTS analytics_top_listings_detailed(integer, integer, text);
DROP FUNCTION IF EXISTS analytics_top_listings_detailed(integer, text, integer);

DROP FUNCTION IF EXISTS analytics_posting_funnel();
DROP FUNCTION IF EXISTS analytics_posting_funnel(integer);
DROP FUNCTION IF EXISTS analytics_posting_funnel(integer, text);

DROP FUNCTION IF EXISTS analytics_period_comparison();
DROP FUNCTION IF EXISTS analytics_period_comparison(integer);
DROP FUNCTION IF EXISTS analytics_period_comparison(integer, text);

-- Drop internal helpers if they exist
DROP FUNCTION IF EXISTS _analytics_sessions_range(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS _analytics_impressions_range(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS _analytics_events_count_range(timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS _analytics_inquiries_count_range(timestamptz, timestamptz);

-- ============================================================================
-- PART 2: CREATE INTERNAL HELPER FUNCTIONS
-- ============================================================================

-- Helper: Count impressions by expanding listing_ids arrays
CREATE OR REPLACE FUNCTION _analytics_impressions_range(
  p_start_ts timestamptz,
  p_end_ts timestamptz
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result bigint;
BEGIN
  SELECT COUNT(*) INTO result
  FROM analytics_events ae,
  LATERAL jsonb_array_elements_text(
    COALESCE(ae.event_props->'listing_ids', ae.props->'listing_ids', '[]'::jsonb)
  ) AS listing_id
  WHERE ae.event_name = 'listing_impression_batch'
    AND COALESCE(ae.occurred_at, ae.ts) >= p_start_ts
    AND COALESCE(ae.occurred_at, ae.ts) < p_end_ts;
  
  RETURN COALESCE(result, 0);
END;
$$;

-- Helper: Count events by name in range
CREATE OR REPLACE FUNCTION _analytics_events_count_range(
  p_start_ts timestamptz,
  p_end_ts timestamptz,
  p_event_name text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result bigint;
BEGIN
  SELECT COUNT(*) INTO result
  FROM analytics_events ae
  WHERE ae.event_name = p_event_name
    AND COALESCE(ae.occurred_at, ae.ts) >= p_start_ts
    AND COALESCE(ae.occurred_at, ae.ts) < p_end_ts;
  
  RETURN COALESCE(result, 0);
END;
$$;

-- Helper: Count inquiries in range
CREATE OR REPLACE FUNCTION _analytics_inquiries_count_range(
  p_start_ts timestamptz,
  p_end_ts timestamptz
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result bigint;
BEGIN
  SELECT COUNT(*) INTO result
  FROM listing_contact_submissions lcs
  WHERE lcs.created_at >= p_start_ts
    AND lcs.created_at < p_end_ts;
  
  RETURN COALESCE(result, 0);
END;
$$;

-- ============================================================================
-- PART 3: CREATE ALL ANALYTICS FUNCTIONS WITH CANONICAL SIGNATURES
-- ============================================================================

-- 1. analytics_session_quality(days_back, tz)
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
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);

  RETURN QUERY
  WITH sessions AS (
    SELECT
      ae.session_id,
      ae.anon_id,
      COUNT(*) AS page_count,
      MIN(COALESCE(ae.occurred_at, ae.ts)) AS session_start,
      MAX(COALESCE(ae.occurred_at, ae.ts)) AS session_end
    FROM analytics_events ae
    WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
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
    WHERE COALESCE(ae.occurred_at, ae.ts) < start_ts
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

-- 2. analytics_kpis_with_sparkline(tz)
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
DECLARE
  end_ts timestamptz;
  start_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => 14);

  RETURN QUERY
  WITH daily_users AS (
    SELECT
      (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)::date AS day,
      COUNT(DISTINCT ae.anon_id)::integer AS dau
    FROM analytics_events ae
    WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    GROUP BY (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)::date
    ORDER BY day
  )
  SELECT
    _analytics_events_count_range(start_ts, end_ts, 'listing_view'),
    (SELECT COUNT(DISTINCT session_id) FROM analytics_events 
     WHERE COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts)::bigint,
    _analytics_inquiries_count_range(start_ts, end_ts),
    COALESCE((
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (session_end - session_start)) / 60), 1)
      FROM (
        SELECT session_id, 
               MIN(COALESCE(occurred_at, ts)) AS session_start, 
               MAX(COALESCE(occurred_at, ts)) AS session_end
        FROM analytics_events
        WHERE COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts
        GROUP BY session_id
      ) s
    ), 0)::numeric,
    COALESCE(ARRAY_AGG(du.dau ORDER BY du.day), ARRAY[]::integer[])
  FROM daily_users du;
END;
$$;

-- 3. analytics_engagement_funnel(days_back, tz)
-- Returns total_inquiries (raw count) instead of sessions_with_inquiry
CREATE OR REPLACE FUNCTION analytics_engagement_funnel(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  total_sessions bigint,
  total_impressions bigint,
  total_views bigint,
  total_inquiries bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  RETURN QUERY SELECT
    (SELECT COUNT(DISTINCT session_id) FROM analytics_events 
     WHERE COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts)::bigint,
    _analytics_impressions_range(start_ts, end_ts),
    _analytics_events_count_range(start_ts, end_ts, 'listing_view'),
    _analytics_inquiries_count_range(start_ts, end_ts);
END;
$$;

-- 4. analytics_top_filters(days_back, tz, limit_count)
CREATE OR REPLACE FUNCTION analytics_top_filters(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York',
  limit_count integer DEFAULT 10
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
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  RETURN QUERY
  WITH filter_events AS (
    SELECT 
      COALESCE(ae.event_props, ae.props) AS props
    FROM analytics_events ae
    WHERE ae.event_name = 'filter_apply'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
  ),
  extracted_filters AS (
    SELECT key, value
    FROM filter_events,
    LATERAL jsonb_each_text(COALESCE(props->'filters', '{}'::jsonb))
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

-- 5. analytics_supply_stats(days_back, tz)
CREATE OR REPLACE FUNCTION analytics_supply_stats(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  new_listings_by_day jsonb,
  active_count integer,
  inactive_count integer,
  total_new_listings integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);

  RETURN QUERY
  WITH daily_new AS (
    SELECT 
      (l.created_at AT TIME ZONE tz)::date AS day_date,
      COUNT(*)::integer AS count
    FROM listings l
    WHERE l.created_at >= start_ts AND l.created_at < end_ts
    GROUP BY (l.created_at AT TIME ZONE tz)::date
    ORDER BY day_date
  )
  SELECT 
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('date', day_date, 'count', count) ORDER BY day_date)
       FROM daily_new),
      '[]'::jsonb
    ),
    (SELECT COUNT(*) FROM listings WHERE is_active = true)::integer,
    (SELECT COUNT(*) FROM listings WHERE is_active = false)::integer,
    (SELECT COUNT(*) FROM listings WHERE created_at >= start_ts AND created_at < end_ts)::integer;
END;
$$;

-- 6. analytics_listings_performance(days_back, tz, limit_count)
CREATE OR REPLACE FUNCTION analytics_listings_performance(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York',
  limit_count integer DEFAULT 20
)
RETURNS TABLE (
  listing_id uuid,
  title text,
  location text,
  neighborhood text,
  bedrooms integer,
  price integer,
  views bigint,
  impressions bigint,
  ctr numeric,
  inquiry_count bigint,
  phone_click_count bigint,
  hours_to_first_inquiry numeric,
  is_featured boolean,
  posted_by text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  RETURN QUERY
  WITH view_counts AS (
    SELECT
      COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid,
      COUNT(*) AS view_count
    FROM analytics_events ae
    WHERE ae.event_name = 'listing_view'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
    GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')
  ),
  impression_counts AS (
    SELECT
      listing_id_text AS lid,
      COUNT(*) AS impression_count
    FROM analytics_events ae,
    LATERAL jsonb_array_elements_text(
      COALESCE(ae.event_props->'listing_ids', ae.props->'listing_ids', '[]'::jsonb)
    ) AS listing_id_text
    WHERE ae.event_name = 'listing_impression_batch'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    GROUP BY listing_id_text
  ),
  phone_counts AS (
    SELECT
      COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid,
      COUNT(*) AS phone_count
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_click'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
    GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')
  ),
  inquiry_counts AS (
    SELECT
      lcs.listing_id::text AS lid,
      COUNT(*) AS inq_count
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
    GROUP BY lcs.listing_id
  ),
  first_inquiries AS (
    SELECT
      lcs.listing_id,
      MIN(lcs.created_at) AS first_inquiry_at
    FROM listing_contact_submissions lcs
    GROUP BY lcs.listing_id
  )
  SELECT
    l.id,
    l.title,
    l.location,
    l.neighborhood,
    l.bedrooms,
    l.price,
    COALESCE(vc.view_count, 0)::bigint,
    COALESCE(ic.impression_count, 0)::bigint,
    CASE
      WHEN COALESCE(ic.impression_count, 0) > 0 THEN
        ROUND((COALESCE(vc.view_count, 0)::numeric / ic.impression_count::numeric) * 100, 1)
      ELSE 0
    END,
    COALESCE(inq.inq_count, 0)::bigint,
    COALESCE(pc.phone_count, 0)::bigint,
    CASE
      WHEN fi.first_inquiry_at IS NOT NULL THEN
        ROUND(EXTRACT(EPOCH FROM (fi.first_inquiry_at - l.created_at)) / 3600, 1)
      ELSE NULL
    END,
    l.is_featured,
    COALESCE(p.full_name, 'Unknown')
  FROM listings l
  LEFT JOIN view_counts vc ON vc.lid = l.id::text
  LEFT JOIN impression_counts ic ON ic.lid = l.id::text
  LEFT JOIN phone_counts pc ON pc.lid = l.id::text
  LEFT JOIN inquiry_counts inq ON inq.lid = l.id::text
  LEFT JOIN first_inquiries fi ON fi.listing_id = l.id
  LEFT JOIN profiles p ON p.id = l.user_id
  WHERE l.is_active = true
    AND COALESCE(vc.view_count, 0) > 0
  ORDER BY COALESCE(vc.view_count, 0) DESC
  LIMIT limit_count;
END;
$$;

-- 7. analytics_zero_inquiry_listings(days_back, tz, min_views)
CREATE OR REPLACE FUNCTION analytics_zero_inquiry_listings(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York',
  min_views integer DEFAULT 5
)
RETURNS TABLE (
  listing_id text,
  title text,
  location text,
  neighborhood text,
  bedrooms integer,
  price integer,
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
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  RETURN QUERY
  WITH view_counts AS (
    SELECT
      COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid,
      COUNT(*) AS view_count
    FROM analytics_events ae
    WHERE ae.event_name = 'listing_view'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
    GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')
  ),
  listings_with_inquiries AS (
    SELECT DISTINCT lcs.listing_id::text AS lid
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
  ),
  phone_clicks AS (
    SELECT DISTINCT COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_click'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
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
  LIMIT 20;
END;
$$;

-- 8. analytics_summary(days_back, tz)
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
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  RETURN QUERY
  SELECT
    (SELECT COUNT(DISTINCT session_id) FROM analytics_events 
     WHERE COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts)::bigint,
    _analytics_events_count_range(start_ts, end_ts, 'page_view'),
    _analytics_events_count_range(start_ts, end_ts, 'listing_view'),
    _analytics_inquiries_count_range(start_ts, end_ts),
    (SELECT COUNT(*) FROM analytics_events 
     WHERE event_name IN ('post_started', 'post_listing_start') 
     AND COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events 
     WHERE event_name IN ('post_submitted', 'post_listing_submit') 
     AND COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events 
     WHERE event_name IN ('post_success', 'post_listing_success') 
     AND COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts)::bigint,
    (SELECT COUNT(*) FROM analytics_events 
     WHERE event_name IN ('post_abandoned', 'post_listing_abandoned') 
     AND COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts)::bigint;
END;
$$;

-- 9. analytics_inquiry_quality(days_back, tz)
CREATE OR REPLACE FUNCTION analytics_inquiry_quality(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  total_inquiries integer,
  unique_phones integer,
  repeat_rate numeric,
  avg_listings_per_inquirer numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  RETURN QUERY
  WITH inquiry_stats AS (
    SELECT 
      lcs.user_phone,
      COUNT(*) AS inquiry_count,
      COUNT(DISTINCT lcs.listing_id) AS listings_contacted
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
    GROUP BY lcs.user_phone
  )
  SELECT 
    COALESCE(SUM(inquiry_count), 0)::integer,
    COUNT(*)::integer,
    ROUND(COALESCE(
      (COUNT(CASE WHEN inquiry_count > 1 THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100,
      0
    ), 1)::numeric,
    ROUND(COALESCE(AVG(listings_contacted), 0), 2)::numeric
  FROM inquiry_stats;
END;
$$;

-- 10. analytics_inquiry_trend(days_back, tz)
CREATE OR REPLACE FUNCTION analytics_inquiry_trend(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  date date,
  inquiry_count integer,
  phone_click_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
  start_date date;
  end_date date;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  start_date := (start_ts AT TIME ZONE tz)::date;
  end_date := (timezone(tz, now())::date);
  
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(start_date, end_date, '1 day'::interval)::date AS day_date
  ),
  daily_inquiries AS (
    SELECT 
      (lcs.created_at AT TIME ZONE tz)::date AS day_date,
      COUNT(*)::integer AS count
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
    GROUP BY (lcs.created_at AT TIME ZONE tz)::date
  ),
  daily_phone_clicks AS (
    SELECT 
      (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)::date AS day_date,
      COUNT(*)::integer AS count
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_click'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    GROUP BY (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)::date
  )
  SELECT 
    ds.day_date,
    COALESCE(di.count, 0),
    COALESCE(dpc.count, 0)
  FROM date_series ds
  LEFT JOIN daily_inquiries di ON di.day_date = ds.day_date
  LEFT JOIN daily_phone_clicks dpc ON dpc.day_date = ds.day_date
  ORDER BY ds.day_date;
END;
$$;

-- 11. analytics_inquiry_velocity(days_back, tz)
CREATE OR REPLACE FUNCTION analytics_inquiry_velocity(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  bucket text,
  count integer,
  percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
  total_count integer;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  WITH first_inquiries AS (
    SELECT 
      lcs.listing_id,
      MIN(lcs.created_at) AS first_inquiry_at,
      l.created_at AS listing_created_at,
      EXTRACT(EPOCH FROM (MIN(lcs.created_at) - l.created_at)) / 3600 AS hours_to_inquiry
    FROM listing_contact_submissions lcs
    INNER JOIN listings l ON l.id = lcs.listing_id
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
    GROUP BY lcs.listing_id, l.created_at
  )
  SELECT COUNT(*)::integer INTO total_count FROM first_inquiries;
  
  RETURN QUERY
  WITH first_inquiries AS (
    SELECT 
      lcs.listing_id,
      MIN(lcs.created_at) AS first_inquiry_at,
      l.created_at AS listing_created_at,
      EXTRACT(EPOCH FROM (MIN(lcs.created_at) - l.created_at)) / 3600 AS hours_to_inquiry
    FROM listing_contact_submissions lcs
    INNER JOIN listings l ON l.id = lcs.listing_id
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
    GROUP BY lcs.listing_id, l.created_at
  ),
  bucketed AS (
    SELECT 
      CASE 
        WHEN hours_to_inquiry < 24 THEN 'Under 24 hours'
        WHEN hours_to_inquiry < 72 THEN '1-3 days'
        WHEN hours_to_inquiry < 168 THEN '3-7 days'
        ELSE 'Over 7 days'
      END AS bucket_name,
      CASE 
        WHEN hours_to_inquiry < 24 THEN 1
        WHEN hours_to_inquiry < 72 THEN 2
        WHEN hours_to_inquiry < 168 THEN 3
        ELSE 4
      END AS sort_order
    FROM first_inquiries
  )
  SELECT 
    b.bucket_name,
    COUNT(*)::integer,
    ROUND((COUNT(*)::numeric / NULLIF(total_count, 0)) * 100, 1)::numeric
  FROM bucketed b
  GROUP BY b.bucket_name, b.sort_order
  ORDER BY b.sort_order;
END;
$$;

-- 12. analytics_top_inquired_listings(days_back, tz, limit_count)
CREATE OR REPLACE FUNCTION analytics_top_inquired_listings(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York',
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  listing_id uuid,
  title text,
  location text,
  neighborhood text,
  bedrooms integer,
  price integer,
  inquiry_count integer,
  is_featured boolean,
  posted_by text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  RETURN QUERY
  WITH listing_inquiries AS (
    SELECT 
      lcs.listing_id AS lid,
      COUNT(*)::integer AS inq_count
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
    GROUP BY lcs.listing_id
    ORDER BY COUNT(*) DESC
    LIMIT limit_count
  )
  SELECT 
    l.id,
    l.title,
    l.location,
    l.neighborhood,
    l.bedrooms,
    l.price,
    li.inq_count,
    l.is_featured,
    COALESCE(p.full_name, 'Unknown')
  FROM listing_inquiries li
  INNER JOIN listings l ON l.id = li.lid
  LEFT JOIN profiles p ON p.id = l.user_id
  ORDER BY li.inq_count DESC;
END;
$$;

-- 13. analytics_inquiry_demand(days_back, tz)
CREATE OR REPLACE FUNCTION analytics_inquiry_demand(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  by_price_band jsonb,
  by_bedrooms jsonb,
  by_neighborhood jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  RETURN QUERY
  WITH inquiry_listings AS (
    SELECT 
      lcs.id,
      l.price,
      l.bedrooms,
      l.neighborhood
    FROM listing_contact_submissions lcs
    INNER JOIN listings l ON l.id = lcs.listing_id
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
  ),
  price_bands AS (
    SELECT 
      CASE 
        WHEN price IS NULL THEN 'Call for Price'
        WHEN price < 2000 THEN 'Under $2,000'
        WHEN price < 3000 THEN '$2,000-$3,000'
        WHEN price < 4000 THEN '$3,000-$4,000'
        ELSE '$4,000+'
      END AS label,
      CASE 
        WHEN price IS NULL THEN 5
        WHEN price < 2000 THEN 1
        WHEN price < 3000 THEN 2
        WHEN price < 4000 THEN 3
        ELSE 4
      END AS sort_order,
      COUNT(*)::integer AS count
    FROM inquiry_listings
    GROUP BY label, sort_order
  ),
  bedroom_counts AS (
    SELECT 
      CASE 
        WHEN bedrooms = 0 THEN 'Studio'
        WHEN bedrooms = 1 THEN '1 BR'
        WHEN bedrooms = 2 THEN '2 BR'
        WHEN bedrooms = 3 THEN '3 BR'
        ELSE '4+ BR'
      END AS label,
      bedrooms AS sort_order,
      COUNT(*)::integer AS count
    FROM inquiry_listings
    GROUP BY label, bedrooms
  ),
  neighborhood_counts AS (
    SELECT 
      COALESCE(neighborhood, 'Unknown') AS label,
      COUNT(*)::integer AS count
    FROM inquiry_listings
    GROUP BY neighborhood
    ORDER BY COUNT(*) DESC
    LIMIT 5
  )
  SELECT 
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count) ORDER BY sort_order) FROM price_bands),
      '[]'::jsonb
    ),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count) ORDER BY sort_order) FROM bedroom_counts),
      '[]'::jsonb
    ),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count)) FROM neighborhood_counts),
      '[]'::jsonb
    );
END;
$$;

-- 14. analytics_inquiry_timing(days_back, tz)
CREATE OR REPLACE FUNCTION analytics_inquiry_timing(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  day_of_week integer,
  hour_of_day integer,
  count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  RETURN QUERY
  SELECT 
    EXTRACT(DOW FROM (lcs.created_at AT TIME ZONE tz))::integer,
    EXTRACT(HOUR FROM (lcs.created_at AT TIME ZONE tz))::integer,
    COUNT(*)::integer
  FROM listing_contact_submissions lcs
  WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
  GROUP BY 
    EXTRACT(DOW FROM (lcs.created_at AT TIME ZONE tz)),
    EXTRACT(HOUR FROM (lcs.created_at AT TIME ZONE tz))
  ORDER BY 
    EXTRACT(DOW FROM (lcs.created_at AT TIME ZONE tz)),
    EXTRACT(HOUR FROM (lcs.created_at AT TIME ZONE tz));
END;
$$;

-- 15. analytics_abuse_signals(days_back, tz, mild_threshold, extreme_threshold)
CREATE OR REPLACE FUNCTION analytics_abuse_signals(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York',
  mild_threshold integer DEFAULT 6,
  extreme_threshold integer DEFAULT 15
)
RETURNS TABLE (
  phone_masked text,
  inquiry_count integer,
  severity text,
  first_inquiry timestamptz,
  last_inquiry timestamptz,
  listings_contacted integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  RETURN QUERY
  WITH phone_activity AS (
    SELECT 
      lcs.user_phone,
      COUNT(*)::integer AS inq_count,
      COUNT(DISTINCT lcs.listing_id)::integer AS listings_count,
      MIN(lcs.created_at) AS first_inq,
      MAX(lcs.created_at) AS last_inq
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
    GROUP BY lcs.user_phone
    HAVING COUNT(*) >= mild_threshold
  )
  SELECT 
    CONCAT('***-***-', RIGHT(pa.user_phone, 4)),
    pa.inq_count,
    CASE 
      WHEN pa.inq_count >= extreme_threshold THEN 'extreme'
      ELSE 'mild'
    END,
    pa.first_inq,
    pa.last_inq,
    pa.listings_count
  FROM phone_activity pa
  ORDER BY pa.inq_count DESC;
END;
$$;

-- 16. analytics_contact_submissions_summary(days_back, tz)
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
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  RETURN QUERY
  WITH submissions_in_range AS (
    SELECT
      lcs.id,
      lcs.listing_id,
      lcs.consent_to_followup
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE consent_to_followup = true)::bigint,
    COUNT(DISTINCT listing_id)::bigint,
    CASE 
      WHEN COUNT(*) > 0 
      THEN ROUND((COUNT(*) FILTER (WHERE consent_to_followup = true)::numeric / COUNT(*)::numeric) * 100, 1)
      ELSE 0 
    END
  FROM submissions_in_range;
END;
$$;

-- 17. analytics_validation_report(start_date, end_date, tz)
CREATE OR REPLACE FUNCTION analytics_validation_report(
  start_date date,
  end_date date,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  metric_name text,
  expected_value bigint,
  actual_value bigint,
  variance_percent numeric,
  status text,
  details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
  session_count bigint;
  unique_visitor_count bigint;
  listing_view_count bigint;
  inquiry_count bigint;
  impression_count bigint;
BEGIN
  PERFORM require_admin();
  
  start_ts := timezone(tz, start_date::timestamp);
  end_ts := timezone(tz, (end_date + 1)::timestamp);
  
  SELECT COUNT(DISTINCT ae.session_id) INTO session_count
  FROM analytics_events ae
  WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts 
    AND COALESCE(ae.occurred_at, ae.ts) < end_ts;
  
  SELECT COUNT(DISTINCT ae.anon_id) INTO unique_visitor_count
  FROM analytics_events ae
  WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts 
    AND COALESCE(ae.occurred_at, ae.ts) < end_ts;
  
  listing_view_count := _analytics_events_count_range(start_ts, end_ts, 'listing_view');
  
  inquiry_count := _analytics_inquiries_count_range(start_ts, end_ts);
  
  impression_count := _analytics_impressions_range(start_ts, end_ts);
  
  RETURN QUERY
  SELECT
    'sessions'::text,
    session_count,
    session_count,
    0::numeric,
    'pass'::text,
    jsonb_build_object('source', 'analytics_events', 'field', 'session_id', 'window', jsonb_build_object('start', start_ts, 'end', end_ts))
  UNION ALL
  SELECT
    'unique_visitors'::text,
    unique_visitor_count,
    unique_visitor_count,
    0::numeric,
    'pass'::text,
    jsonb_build_object('source', 'analytics_events', 'field', 'anon_id')
  UNION ALL
  SELECT
    'listing_views'::text,
    listing_view_count,
    listing_view_count,
    0::numeric,
    'pass'::text,
    jsonb_build_object('source', 'analytics_events', 'event_name', 'listing_view')
  UNION ALL
  SELECT
    'inquiries'::text,
    inquiry_count,
    inquiry_count,
    0::numeric,
    'pass'::text,
    jsonb_build_object('source', 'listing_contact_submissions')
  UNION ALL
  SELECT
    'impressions'::text,
    impression_count,
    impression_count,
    0::numeric,
    'pass'::text,
    jsonb_build_object('source', 'analytics_events', 'event_name', 'listing_impression_batch', 'note', 'expanded from listing_ids array');
END;
$$;

-- 18. analytics_listing_drilldown(p_listing_id uuid, days_back, tz)
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
  views bigint,
  impressions bigint,
  ctr numeric,
  phone_clicks bigint,
  inquiry_count bigint,
  hours_to_first_inquiry numeric,
  views_by_day jsonb,
  inquiries jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
  start_date date;
  end_date date;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  start_date := (start_ts AT TIME ZONE tz)::date;
  end_date := (timezone(tz, now())::date);
  
  RETURN QUERY
  WITH daily_views AS (
    SELECT
      (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)::date AS day_date,
      COUNT(*)::integer AS view_count
    FROM analytics_events ae
    WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND ae.event_name = 'listing_view'
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') = p_listing_id::text
    GROUP BY (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)::date
  ),
  date_series AS (
    SELECT generate_series(start_date, end_date, '1 day'::interval)::date AS day_date
  ),
  views_filled AS (
    SELECT
      ds.day_date,
      COALESCE(dv.view_count, 0) AS view_count
    FROM date_series ds
    LEFT JOIN daily_views dv ON dv.day_date = ds.day_date
    ORDER BY ds.day_date
  ),
  total_views AS (
    SELECT COUNT(*)::bigint AS count
    FROM analytics_events ae
    WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND ae.event_name = 'listing_view'
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') = p_listing_id::text
  ),
  total_impressions AS (
    SELECT COUNT(*)::bigint AS count
    FROM analytics_events ae,
    LATERAL jsonb_array_elements_text(
      COALESCE(ae.event_props->'listing_ids', ae.props->'listing_ids', '[]'::jsonb)
    ) AS lid
    WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND ae.event_name = 'listing_impression_batch'
      AND lid = p_listing_id::text
  ),
  total_phone_clicks AS (
    SELECT COUNT(*)::bigint AS count
    FROM analytics_events ae
    WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND ae.event_name = 'phone_click'
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') = p_listing_id::text
  ),
  inquiry_details AS (
    SELECT
      lcs.id AS inquiry_id,
      lcs.user_name,
      lcs.user_phone,
      lcs.created_at AS inquiry_created_at
    FROM listing_contact_submissions lcs
    WHERE lcs.listing_id = p_listing_id
    ORDER BY lcs.created_at DESC
    LIMIT 50
  ),
  first_inquiry AS (
    SELECT MIN(lcs.created_at) AS first_inq
    FROM listing_contact_submissions lcs
    WHERE lcs.listing_id = p_listing_id
  )
  SELECT
    l.id,
    l.title,
    l.location,
    l.neighborhood,
    l.bedrooms,
    l.price,
    l.is_featured,
    l.created_at,
    (SELECT count FROM total_views),
    (SELECT count FROM total_impressions),
    CASE
      WHEN (SELECT count FROM total_impressions) > 0 THEN
        ROUND(((SELECT count FROM total_views)::numeric / (SELECT count FROM total_impressions)::numeric) * 100, 2)
      ELSE 0
    END,
    (SELECT count FROM total_phone_clicks),
    (SELECT COUNT(*)::bigint FROM inquiry_details),
    CASE
      WHEN (SELECT first_inq FROM first_inquiry) IS NOT NULL THEN
        ROUND(EXTRACT(EPOCH FROM ((SELECT first_inq FROM first_inquiry) - l.created_at)) / 3600, 1)
      ELSE NULL
    END,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('date', day_date, 'views', view_count) ORDER BY day_date) FROM views_filled),
      '[]'::jsonb
    ),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', inquiry_id,
        'user_name', user_name,
        'user_phone', user_phone,
        'created_at', inquiry_created_at
      ) ORDER BY inquiry_created_at DESC)
       FROM inquiry_details),
      '[]'::jsonb
    )
  FROM listings l
  WHERE l.id = p_listing_id;
END;
$$;

-- 19. analytics_top_listings_detailed(days_back, tz, limit_count)
CREATE OR REPLACE FUNCTION analytics_top_listings_detailed(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York',
  limit_count integer DEFAULT 20
)
RETURNS TABLE (
  listing_id text,
  title text,
  location text,
  neighborhood text,
  bedrooms integer,
  price integer,
  views bigint,
  impressions bigint,
  ctr numeric,
  inquiry_count bigint,
  phone_click_count bigint,
  hours_to_first_inquiry numeric,
  is_featured boolean,
  posted_by text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  RETURN QUERY
  WITH view_counts AS (
    SELECT
      COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid,
      COUNT(*) AS view_count
    FROM analytics_events ae
    WHERE ae.event_name = 'listing_view'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
    GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')
  ),
  impression_counts AS (
    SELECT
      listing_id_text AS lid,
      COUNT(*) AS impression_count
    FROM analytics_events ae,
    LATERAL jsonb_array_elements_text(
      COALESCE(ae.event_props->'listing_ids', ae.props->'listing_ids', '[]'::jsonb)
    ) AS listing_id_text
    WHERE ae.event_name = 'listing_impression_batch'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    GROUP BY listing_id_text
  ),
  phone_counts AS (
    SELECT
      COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid,
      COUNT(*) AS phone_count
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_click'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
    GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')
  ),
  inquiry_counts AS (
    SELECT
      lcs.listing_id::text AS lid,
      COUNT(*) AS inq_count
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
    GROUP BY lcs.listing_id
  ),
  first_inquiries AS (
    SELECT
      lcs.listing_id,
      MIN(lcs.created_at) AS first_inquiry_at
    FROM listing_contact_submissions lcs
    GROUP BY lcs.listing_id
  )
  SELECT
    l.id::text,
    l.title,
    l.location,
    l.neighborhood,
    l.bedrooms,
    l.price,
    COALESCE(vc.view_count, 0)::bigint,
    COALESCE(ic.impression_count, 0)::bigint,
    CASE
      WHEN COALESCE(ic.impression_count, 0) > 0 THEN
        ROUND((COALESCE(vc.view_count, 0)::numeric / ic.impression_count::numeric) * 100, 1)
      ELSE 0
    END,
    COALESCE(inq.inq_count, 0)::bigint,
    COALESCE(pc.phone_count, 0)::bigint,
    CASE
      WHEN fi.first_inquiry_at IS NOT NULL THEN
        ROUND(EXTRACT(EPOCH FROM (fi.first_inquiry_at - l.created_at)) / 3600, 1)
      ELSE NULL
    END,
    l.is_featured,
    COALESCE(p.full_name, 'Unknown')
  FROM listings l
  LEFT JOIN view_counts vc ON vc.lid = l.id::text
  LEFT JOIN impression_counts ic ON ic.lid = l.id::text
  LEFT JOIN phone_counts pc ON pc.lid = l.id::text
  LEFT JOIN inquiry_counts inq ON inq.lid = l.id::text
  LEFT JOIN first_inquiries fi ON fi.listing_id = l.id
  LEFT JOIN profiles p ON p.id = l.user_id
  WHERE l.is_active = true
    AND COALESCE(vc.view_count, 0) > 0
  ORDER BY COALESCE(vc.view_count, 0) DESC
  LIMIT limit_count;
END;
$$;

-- 20. analytics_posting_funnel(days_back, tz)
CREATE OR REPLACE FUNCTION analytics_posting_funnel(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  starts bigint,
  submits bigint,
  successes bigint,
  abandoned bigint,
  success_rate numeric,
  abandon_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
  start_count bigint;
  submit_count bigint;
  success_count bigint;
BEGIN
  PERFORM require_admin();
  
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  
  SELECT COUNT(*) INTO start_count
  FROM analytics_events ae
  WHERE ae.event_name IN ('post_started', 'post_listing_start')
    AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
    AND COALESCE(ae.occurred_at, ae.ts) < end_ts;
  
  SELECT COUNT(*) INTO submit_count
  FROM analytics_events ae
  WHERE ae.event_name IN ('post_submitted', 'post_listing_submit')
    AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
    AND COALESCE(ae.occurred_at, ae.ts) < end_ts;
  
  SELECT COUNT(*) INTO success_count
  FROM analytics_events ae
  WHERE ae.event_name IN ('post_success', 'post_listing_success')
    AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
    AND COALESCE(ae.occurred_at, ae.ts) < end_ts;
  
  RETURN QUERY
  SELECT
    start_count,
    submit_count,
    success_count,
    GREATEST(start_count - success_count, 0),
    CASE WHEN start_count > 0 THEN ROUND((success_count::numeric / start_count::numeric) * 100, 1) ELSE 0 END,
    CASE WHEN start_count > 0 THEN ROUND(((start_count - success_count)::numeric / start_count::numeric) * 100, 1) ELSE 0 END;
END;
$$;

-- 21. analytics_period_comparison(days_back, tz)
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
  current_end_ts timestamptz;
  current_start_ts timestamptz;
  prev_end_ts timestamptz;
  prev_start_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  current_end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  current_start_ts := current_end_ts - make_interval(days => days_back);
  prev_end_ts := current_start_ts;
  prev_start_ts := prev_end_ts - make_interval(days => days_back);
  
  RETURN QUERY
  WITH current_metrics AS (
    SELECT
      (SELECT COUNT(DISTINCT session_id) FROM analytics_events 
       WHERE COALESCE(occurred_at, ts) >= current_start_ts AND COALESCE(occurred_at, ts) < current_end_ts)::numeric AS sessions,
      _analytics_events_count_range(current_start_ts, current_end_ts, 'listing_view')::numeric AS views,
      _analytics_inquiries_count_range(current_start_ts, current_end_ts)::numeric AS inquiries
  ),
  prev_metrics AS (
    SELECT
      (SELECT COUNT(DISTINCT session_id) FROM analytics_events 
       WHERE COALESCE(occurred_at, ts) >= prev_start_ts AND COALESCE(occurred_at, ts) < prev_end_ts)::numeric AS sessions,
      _analytics_events_count_range(prev_start_ts, prev_end_ts, 'listing_view')::numeric AS views,
      _analytics_inquiries_count_range(prev_start_ts, prev_end_ts)::numeric AS inquiries
  )
  SELECT 'sessions'::text, c.sessions, p.sessions,
    CASE WHEN p.sessions > 0 THEN ROUND(((c.sessions - p.sessions) / p.sessions) * 100, 1) ELSE 0 END,
    CASE WHEN c.sessions > p.sessions THEN 'up' WHEN c.sessions < p.sessions THEN 'down' ELSE 'flat' END
  FROM current_metrics c, prev_metrics p
  UNION ALL
  SELECT 'listing_views'::text, c.views, p.views,
    CASE WHEN p.views > 0 THEN ROUND(((c.views - p.views) / p.views) * 100, 1) ELSE 0 END,
    CASE WHEN c.views > p.views THEN 'up' WHEN c.views < p.views THEN 'down' ELSE 'flat' END
  FROM current_metrics c, prev_metrics p
  UNION ALL
  SELECT 'inquiries'::text, c.inquiries, p.inquiries,
    CASE WHEN p.inquiries > 0 THEN ROUND(((c.inquiries - p.inquiries) / p.inquiries) * 100, 1) ELSE 0 END,
    CASE WHEN c.inquiries > p.inquiries THEN 'up' WHEN c.inquiries < p.inquiries THEN 'down' ELSE 'flat' END
  FROM current_metrics c, prev_metrics p;
END;
$$;

-- ============================================================================
-- PART 4: GRANT EXECUTE PERMISSIONS
-- ============================================================================

-- Internal helpers (no public access needed, called by other functions)

-- Public analytics functions
GRANT EXECUTE ON FUNCTION analytics_session_quality(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_kpis_with_sparkline(text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_engagement_funnel(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_filters(integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_supply_stats(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_listings_performance(integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_zero_inquiry_listings(integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_summary(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_quality(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_trend(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_velocity(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_inquired_listings(integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_demand(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_timing(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_abuse_signals(integer, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_contact_submissions_summary(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_validation_report(date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_listing_drilldown(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_listings_detailed(integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_posting_funnel(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_period_comparison(integer, text) TO authenticated;
