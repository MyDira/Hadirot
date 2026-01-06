/*
  # Fix Admin Authentication Using JSONB JWT Claims

  1. Overview
    - Fixes require_admin() to use jsonb JWT claims extraction with safe casting
    - Removes is_admin() to consolidate to a single admin check function
    - Updates all analytics functions to use require_admin() consistently
    - Fixes analytics_zero_inquiry_listings signature to match frontend

  2. Key Changes
    - require_admin() now uses current_setting('request.jwt.claims', true)::jsonb
    - Safe casting with exception handling for malformed tokens
    - All analytics functions use fail-fast pattern (throw on non-admin)
    - Removed graceful empty-result pattern in favor of explicit errors

  3. Security
    - SECURITY DEFINER maintained on require_admin()
    - All analytics functions call require_admin() at start
    - Non-admins receive clear error messages
*/

-- Drop the is_admin() function to consolidate to require_admin() only
DROP FUNCTION IF EXISTS is_admin();

-- Recreate require_admin() with jsonb JWT claims extraction
CREATE OR REPLACE FUNCTION require_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_claims jsonb;
  user_id uuid;
  is_user_admin boolean;
BEGIN
  BEGIN
    jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Authentication required: unable to parse JWT claims';
  END;
  
  IF jwt_claims IS NULL THEN
    RAISE EXCEPTION 'Authentication required: no JWT claims present';
  END IF;
  
  IF jwt_claims->>'sub' IS NULL OR jwt_claims->>'sub' = '' THEN
    RAISE EXCEPTION 'Authentication required: no user ID in token';
  END IF;
  
  BEGIN
    user_id := (jwt_claims->>'sub')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Authentication required: invalid user ID format';
  END;
  
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id AND is_admin = true
  ) INTO is_user_admin;
  
  IF NOT is_user_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
END;
$$;

-- Update analytics_session_quality to use require_admin() instead of is_admin()
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

-- Update analytics_kpis_with_sparkline
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

-- Update analytics_engagement_funnel
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

-- Update analytics_summary
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

-- Update analytics_supply_stats
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
    WHERE l.status = 'active'
    GROUP BY l.neighborhood
    ORDER BY count DESC
    LIMIT 10
  )
  SELECT
    (SELECT COUNT(*) FROM listings WHERE status = 'active')::bigint,
    (SELECT COUNT(*) FROM listings WHERE status = 'inactive')::bigint,
    (SELECT COUNT(*) FROM listings WHERE created_at >= now() - interval '7 days')::bigint,
    (SELECT COUNT(*) FROM listings WHERE created_at >= now() - interval '30 days')::bigint,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('neighborhood', neighborhood, 'count', count))
       FROM neighborhood_counts),
      '[]'::jsonb
    );
END;
$$;

-- Update analytics_listings_performance
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
      COALESCE(ae.event_properties->>'listing_id', ae.properties->>'listing_id') AS lid,
      COUNT(*) AS view_count
    FROM analytics_events ae
    WHERE ae.event_name = 'listing_view'
      AND ae.created_at >= start_ts
    GROUP BY COALESCE(ae.event_properties->>'listing_id', ae.properties->>'listing_id')
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
  WHERE l.status = 'active'
  ORDER BY COALESCE(vc.view_count, 0) DESC
  LIMIT limit_count;
END;
$$;

-- Fix analytics_zero_inquiry_listings signature to match frontend expectations
-- Frontend calls: { days_back, min_views, limit_count, tz }
DROP FUNCTION IF EXISTS analytics_zero_inquiry_listings(integer, text, integer);
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
      COALESCE(ae.event_properties->>'listing_id', ae.properties->>'listing_id') AS lid,
      COUNT(*) AS view_count
    FROM analytics_events ae
    WHERE ae.event_name = 'listing_view'
      AND ae.created_at >= start_ts
      AND COALESCE(ae.event_properties->>'listing_id', ae.properties->>'listing_id') IS NOT NULL
    GROUP BY COALESCE(ae.event_properties->>'listing_id', ae.properties->>'listing_id')
  ),
  listings_with_inquiries AS (
    SELECT DISTINCT lcs.listing_id::text AS lid
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts
  ),
  phone_clicks AS (
    SELECT DISTINCT COALESCE(ae.event_properties->>'listing_id', ae.properties->>'listing_id') AS lid
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_click'
      AND ae.created_at >= start_ts
      AND COALESCE(ae.event_properties->>'listing_id', ae.properties->>'listing_id') IS NOT NULL
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
  WHERE l.status = 'active'
    AND COALESCE(vc.view_count, 0) >= min_views
    AND l.id::text NOT IN (SELECT lid FROM listings_with_inquiries WHERE lid IS NOT NULL)
    AND l.id::text NOT IN (SELECT lid FROM phone_clicks WHERE lid IS NOT NULL)
  ORDER BY COALESCE(vc.view_count, 0) DESC
  LIMIT limit_count;
END;
$$;

-- Update analytics_top_filters
DROP FUNCTION IF EXISTS analytics_top_filters(integer, text, integer);
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
    SELECT ae.event_properties, ae.properties
    FROM analytics_events ae
    WHERE ae.event_name = 'filter_apply'
      AND ae.created_at >= start_ts
  ),
  extracted_filters AS (
    SELECT key, value
    FROM filter_events,
    LATERAL jsonb_each_text(COALESCE(event_properties->'filters', properties->'filters', '{}'::jsonb))
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

-- Update analytics_inquiry_quality
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
    SELECT lcs.id, lcs.listing_id, lcs.phone
    FROM listing_contact_submissions lcs
    WHERE (lcs.created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
  ),
  repeat_inquirers AS (
    SELECT phone FROM inquiries GROUP BY phone HAVING COUNT(*) > 1
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(DISTINCT phone)::bigint,
    ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT listing_id), 0), 1),
    ROUND(
      COUNT(DISTINCT CASE WHEN phone IN (SELECT phone FROM repeat_inquirers) THEN phone END)::numeric /
      NULLIF(COUNT(DISTINCT phone), 0) * 100,
      1
    )
  FROM inquiries;
END;
$$;

-- Update analytics_inquiry_trend
DROP FUNCTION IF EXISTS analytics_inquiry_trend(integer, text);

CREATE OR REPLACE FUNCTION analytics_inquiry_trend(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  day date,
  count bigint
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
  SELECT
    (lcs.created_at AT TIME ZONE tz)::date,
    COUNT(*)::bigint
  FROM listing_contact_submissions lcs
  WHERE (lcs.created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
  GROUP BY (lcs.created_at AT TIME ZONE tz)::date
  ORDER BY (lcs.created_at AT TIME ZONE tz)::date;
END;
$$;

-- Update analytics_inquiry_velocity
DROP FUNCTION IF EXISTS analytics_inquiry_velocity(integer, text);

CREATE OR REPLACE FUNCTION analytics_inquiry_velocity(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  hour_bucket integer,
  count bigint
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
    EXTRACT(HOUR FROM lcs.created_at AT TIME ZONE tz)::integer,
    COUNT(*)::bigint
  FROM listing_contact_submissions lcs
  WHERE lcs.created_at >= start_ts
  GROUP BY EXTRACT(HOUR FROM lcs.created_at AT TIME ZONE tz)::integer
  ORDER BY EXTRACT(HOUR FROM lcs.created_at AT TIME ZONE tz)::integer;
END;
$$;

-- Update analytics_top_inquired_listings
DROP FUNCTION IF EXISTS analytics_top_inquired_listings(integer, integer, text);

CREATE OR REPLACE FUNCTION analytics_top_inquired_listings(
  days_back integer DEFAULT 14,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id uuid,
  title text,
  location text,
  inquiry_count bigint
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
    l.id,
    l.title,
    l.location,
    COUNT(lcs.id)::bigint
  FROM listings l
  JOIN listing_contact_submissions lcs ON lcs.listing_id = l.id
  WHERE lcs.created_at >= start_ts
  GROUP BY l.id, l.title, l.location
  ORDER BY COUNT(lcs.id) DESC
  LIMIT limit_count;
END;
$$;

-- Update analytics_inquiry_demand
DROP FUNCTION IF EXISTS analytics_inquiry_demand(integer, text);

CREATE OR REPLACE FUNCTION analytics_inquiry_demand(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  by_bedrooms jsonb,
  by_neighborhood jsonb,
  by_price_range jsonb
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
  WITH inquiries AS (
    SELECT lcs.listing_id
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts
  ),
  by_bed AS (
    SELECT l.bedrooms, COUNT(*) AS cnt
    FROM inquiries i JOIN listings l ON l.id = i.listing_id
    GROUP BY l.bedrooms ORDER BY cnt DESC LIMIT 5
  ),
  by_hood AS (
    SELECT l.neighborhood, COUNT(*) AS cnt
    FROM inquiries i JOIN listings l ON l.id = i.listing_id
    GROUP BY l.neighborhood ORDER BY cnt DESC LIMIT 5
  ),
  by_price AS (
    SELECT
      CASE
        WHEN l.price < 2000 THEN 'Under $2000'
        WHEN l.price < 3000 THEN '$2000-$3000'
        WHEN l.price < 4000 THEN '$3000-$4000'
        ELSE '$4000+'
      END AS price_range,
      COUNT(*) AS cnt
    FROM inquiries i JOIN listings l ON l.id = i.listing_id
    GROUP BY price_range ORDER BY cnt DESC
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object('bedrooms', bedrooms, 'count', cnt)) FROM by_bed), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('neighborhood', neighborhood, 'count', cnt)) FROM by_hood), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('price_range', price_range, 'count', cnt)) FROM by_price), '[]'::jsonb);
END;
$$;

-- Update analytics_inquiry_timing
DROP FUNCTION IF EXISTS analytics_inquiry_timing(integer, text);

CREATE OR REPLACE FUNCTION analytics_inquiry_timing(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  day_of_week integer,
  day_name text,
  count bigint
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
    EXTRACT(DOW FROM lcs.created_at AT TIME ZONE tz)::integer,
    TO_CHAR(lcs.created_at AT TIME ZONE tz, 'Day'),
    COUNT(*)::bigint
  FROM listing_contact_submissions lcs
  WHERE lcs.created_at >= start_ts
  GROUP BY EXTRACT(DOW FROM lcs.created_at AT TIME ZONE tz)::integer, TO_CHAR(lcs.created_at AT TIME ZONE tz, 'Day')
  ORDER BY EXTRACT(DOW FROM lcs.created_at AT TIME ZONE tz)::integer;
END;
$$;

-- Update analytics_abuse_signals
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
    lcs.phone,
    COUNT(*)::bigint,
    COUNT(DISTINCT lcs.listing_id)::bigint,
    CASE
      WHEN COUNT(*) >= extreme_threshold THEN 'extreme'
      WHEN COUNT(*) >= mild_threshold THEN 'mild'
      ELSE 'normal'
    END
  FROM listing_contact_submissions lcs
  WHERE lcs.created_at >= start_ts
  GROUP BY lcs.phone
  HAVING COUNT(*) >= mild_threshold
  ORDER BY COUNT(*) DESC
  LIMIT 20;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION require_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_session_quality(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_kpis_with_sparkline(text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_engagement_funnel(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_summary(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_supply_stats(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_listings_performance(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_zero_inquiry_listings(integer, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_filters(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_quality(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_trend(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_velocity(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_inquired_listings(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_demand(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_timing(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_abuse_signals(integer, integer, integer, text) TO authenticated;
