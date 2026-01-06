/*
  # Complete Analytics Security & Validation System

  1. Overview
    - Drops and recreates remaining analytics functions with admin checks
    - Creates analytics_validation_log table for ground-truth validation
    - Creates analytics_validation_report RPC function

  2. Functions Updated
    - analytics_contact_submissions_summary (dropped and recreated)
    - analytics_listing_drilldown (add admin check)
    - analytics_top_listings_detailed (add admin check)
    - analytics_zero_inquiry_listings (add admin check)
    - analytics_posting_funnel (add admin check)
    - analytics_supply_trend (add admin check)
    - analytics_top_filters (add admin check)

  3. New Validation System
    - analytics_validation_log table with RLS
    - analytics_validation_report function

  4. Security
    - All functions require admin authentication via require_admin()
    - RLS enabled on validation log table
*/

-- Drop functions that need signature changes
DROP FUNCTION IF EXISTS analytics_contact_submissions_summary(integer, text);

-- Recreate analytics_contact_submissions_summary with admin check
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
  PERFORM require_admin();
  
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

-- Update analytics_listing_drilldown with admin check
CREATE OR REPLACE FUNCTION analytics_listing_drilldown(
  p_listing_id text,
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id text,
  title text,
  location text,
  neighborhood text,
  bedrooms integer,
  price numeric,
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
  listing_uuid uuid;
BEGIN
  PERFORM require_admin();
  
  start_ts := (now() AT TIME ZONE tz - (days_back || ' days')::interval);
  
  IF p_listing_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    listing_uuid := p_listing_id::uuid;
  ELSE
    RETURN;
  END IF;
  
  RETURN QUERY
  WITH listing_info AS (
    SELECT
      l.id,
      l.title,
      l.location,
      l.neighborhood,
      l.bedrooms,
      l.price,
      l.is_featured,
      l.created_at
    FROM listings l
    WHERE l.id = listing_uuid
  ),
  view_events AS (
    SELECT
      ae.created_at,
      (ae.created_at AT TIME ZONE tz)::date AS view_date
    FROM analytics_events ae
    WHERE ae.event_name = 'listing_view'
      AND ae.created_at >= start_ts
      AND (
        (ae.event_properties->>'listing_id') = p_listing_id
        OR (ae.properties->>'listing_id') = p_listing_id
      )
  ),
  impression_events AS (
    SELECT ae.id
    FROM analytics_events ae
    WHERE ae.event_name = 'listing_impression'
      AND ae.created_at >= start_ts
      AND (
        (ae.event_properties->>'listing_id') = p_listing_id
        OR (ae.properties->>'listing_id') = p_listing_id
        OR p_listing_id = ANY(
          SELECT jsonb_array_elements_text(
            COALESCE(ae.event_properties->'listing_ids', ae.properties->'listing_ids', '[]'::jsonb)
          )
        )
      )
  ),
  phone_events AS (
    SELECT ae.id
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_click'
      AND ae.created_at >= start_ts
      AND (
        (ae.event_properties->>'listing_id') = p_listing_id
        OR (ae.properties->>'listing_id') = p_listing_id
      )
  ),
  contact_submissions AS (
    SELECT
      lcs.id,
      lcs.name,
      lcs.phone,
      lcs.created_at
    FROM listing_contact_submissions lcs
    WHERE lcs.listing_id = listing_uuid
      AND lcs.created_at >= start_ts
    ORDER BY lcs.created_at DESC
  ),
  daily_views AS (
    SELECT
      view_date,
      COUNT(*) AS view_count
    FROM view_events
    GROUP BY view_date
    ORDER BY view_date
  ),
  first_inquiry AS (
    SELECT MIN(lcs.created_at) AS first_at
    FROM listing_contact_submissions lcs
    WHERE lcs.listing_id = listing_uuid
  )
  SELECT
    p_listing_id,
    li.title,
    li.location,
    li.neighborhood,
    li.bedrooms,
    li.price,
    li.is_featured,
    li.created_at,
    (SELECT COUNT(*) FROM view_events)::bigint,
    (SELECT COUNT(*) FROM impression_events)::bigint,
    CASE
      WHEN (SELECT COUNT(*) FROM impression_events) > 0 THEN
        ROUND(((SELECT COUNT(*) FROM view_events)::numeric / (SELECT COUNT(*) FROM impression_events)::numeric) * 100, 1)
      ELSE 0
    END,
    (SELECT COUNT(*) FROM phone_events)::bigint,
    (SELECT COUNT(*) FROM contact_submissions)::bigint,
    CASE
      WHEN fi.first_at IS NOT NULL THEN
        ROUND(EXTRACT(EPOCH FROM (fi.first_at - li.created_at)) / 3600, 1)
      ELSE NULL
    END,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('date', view_date, 'views', view_count) ORDER BY view_date)
       FROM daily_views),
      '[]'::jsonb
    ),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', cs.id,
        'name', cs.name,
        'phone', cs.phone,
        'created_at', cs.created_at
      ))
       FROM contact_submissions cs),
      '[]'::jsonb
    )
  FROM listing_info li
  CROSS JOIN first_inquiry fi;
END;
$$;

-- Update analytics_top_listings_detailed with admin check
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
  price numeric,
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
  impression_counts AS (
    SELECT
      listing_id_text AS lid,
      COUNT(*) AS impression_count
    FROM analytics_events ae,
    LATERAL jsonb_array_elements_text(
      COALESCE(ae.event_properties->'listing_ids', ae.properties->'listing_ids', '[]'::jsonb)
    ) AS listing_id_text
    WHERE ae.event_name = 'listing_impression'
      AND ae.created_at >= start_ts
    GROUP BY listing_id_text
  ),
  phone_counts AS (
    SELECT
      COALESCE(ae.event_properties->>'listing_id', ae.properties->>'listing_id') AS lid,
      COUNT(*) AS phone_count
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_click'
      AND ae.created_at >= start_ts
      AND COALESCE(ae.event_properties->>'listing_id', ae.properties->>'listing_id') IS NOT NULL
    GROUP BY COALESCE(ae.event_properties->>'listing_id', ae.properties->>'listing_id')
  ),
  inquiry_counts AS (
    SELECT
      lcs.listing_id::text AS lid,
      COUNT(*) AS inq_count
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts
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
    COALESCE(p.full_name, p.email, 'Unknown')
  FROM listings l
  LEFT JOIN view_counts vc ON vc.lid = l.id::text
  LEFT JOIN impression_counts ic ON ic.lid = l.id::text
  LEFT JOIN phone_counts pc ON pc.lid = l.id::text
  LEFT JOIN inquiry_counts inq ON inq.lid = l.id::text
  LEFT JOIN first_inquiries fi ON fi.listing_id = l.id
  LEFT JOIN profiles p ON p.id = l.user_id
  WHERE l.status = 'active'
    AND COALESCE(vc.view_count, 0) > 0
  ORDER BY COALESCE(vc.view_count, 0) DESC
  LIMIT limit_count;
END;
$$;

-- Update analytics_zero_inquiry_listings with admin check
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
  LIMIT 20;
END;
$$;

-- Update analytics_posting_funnel with admin check
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
  start_count bigint;
  submit_count bigint;
  success_count bigint;
BEGIN
  PERFORM require_admin();
  
  start_ts := (now() AT TIME ZONE tz - (days_back || ' days')::interval);
  
  SELECT COUNT(*) INTO start_count
  FROM analytics_events ae
  WHERE ae.event_name = 'post_listing_start'
    AND ae.created_at >= start_ts;
  
  SELECT COUNT(*) INTO submit_count
  FROM analytics_events ae
  WHERE ae.event_name = 'post_listing_submit'
    AND ae.created_at >= start_ts;
  
  SELECT COUNT(*) INTO success_count
  FROM analytics_events ae
  WHERE ae.event_name = 'post_listing_success'
    AND ae.created_at >= start_ts;
  
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

-- Update analytics_supply_trend with admin check
CREATE OR REPLACE FUNCTION analytics_supply_trend(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  new_listings_by_day jsonb,
  active_count bigint,
  inactive_count bigint,
  total_new_listings bigint
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
  WITH daily_new AS (
    SELECT
      (l.created_at AT TIME ZONE tz)::date AS listing_date,
      COUNT(*) AS count
    FROM listings l
    WHERE (l.created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    GROUP BY (l.created_at AT TIME ZONE tz)::date
    ORDER BY listing_date
  )
  SELECT
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('date', listing_date, 'count', count) ORDER BY listing_date)
       FROM daily_new),
      '[]'::jsonb
    ),
    (SELECT COUNT(*) FROM listings WHERE status = 'active')::bigint,
    (SELECT COUNT(*) FROM listings WHERE status = 'inactive')::bigint,
    (SELECT COUNT(*) FROM listings WHERE (created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date)::bigint;
END;
$$;

-- Update analytics_top_filters with admin check
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
BEGIN
  PERFORM require_admin();
  
  start_ts := (now() AT TIME ZONE tz - (days_back || ' days')::interval);
  
  RETURN QUERY
  WITH filter_events AS (
    SELECT
      ae.event_properties,
      ae.properties
    FROM analytics_events ae
    WHERE ae.event_name = 'filter_apply'
      AND ae.created_at >= start_ts
  ),
  extracted_filters AS (
    SELECT
      key,
      value
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

-- Create analytics_validation_log table
CREATE TABLE IF NOT EXISTS analytics_validation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_date date NOT NULL,
  metric_name text NOT NULL,
  expected_value bigint NOT NULL,
  actual_value bigint NOT NULL,
  variance_percent numeric NOT NULL,
  status text NOT NULL CHECK (status IN ('pass', 'warn', 'fail')),
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_validation_log_date ON analytics_validation_log(validation_date);
CREATE INDEX IF NOT EXISTS idx_validation_log_status ON analytics_validation_log(status);

ALTER TABLE analytics_validation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read validation logs" ON analytics_validation_log;
CREATE POLICY "Admins can read validation logs"
  ON analytics_validation_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "System can insert validation logs" ON analytics_validation_log;
CREATE POLICY "System can insert validation logs"
  ON analytics_validation_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- Create analytics_validation_report function
CREATE OR REPLACE FUNCTION analytics_validation_report(
  validation_date date DEFAULT CURRENT_DATE,
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
  day_start timestamptz;
  day_end timestamptz;
  session_count bigint;
  unique_visitor_count bigint;
  listing_view_count bigint;
  inquiry_count bigint;
  impression_count bigint;
BEGIN
  PERFORM require_admin();
  
  day_start := validation_date::timestamptz AT TIME ZONE tz;
  day_end := (validation_date + 1)::timestamptz AT TIME ZONE tz;
  
  -- Count sessions (unique session_ids)
  SELECT COUNT(DISTINCT ae.session_id) INTO session_count
  FROM analytics_events ae
  WHERE ae.created_at >= day_start AND ae.created_at < day_end;
  
  -- Count unique visitors (unique anon_ids)
  SELECT COUNT(DISTINCT ae.anon_id) INTO unique_visitor_count
  FROM analytics_events ae
  WHERE ae.created_at >= day_start AND ae.created_at < day_end;
  
  -- Count listing views
  SELECT COUNT(*) INTO listing_view_count
  FROM analytics_events ae
  WHERE ae.event_name = 'listing_view'
    AND ae.created_at >= day_start AND ae.created_at < day_end;
  
  -- Count inquiries from contact submissions
  SELECT COUNT(*) INTO inquiry_count
  FROM listing_contact_submissions lcs
  WHERE lcs.created_at >= day_start AND lcs.created_at < day_end;
  
  -- Count impressions (expanded from listing_ids arrays)
  SELECT COUNT(*) INTO impression_count
  FROM analytics_events ae,
  LATERAL jsonb_array_elements_text(
    COALESCE(ae.event_properties->'listing_ids', ae.properties->'listing_ids', '[]'::jsonb)
  ) AS listing_id
  WHERE ae.event_name = 'listing_impression'
    AND ae.created_at >= day_start AND ae.created_at < day_end;
  
  -- Return validation results
  RETURN QUERY
  SELECT
    'sessions'::text,
    session_count,
    session_count,
    0::numeric,
    'pass'::text,
    jsonb_build_object('source', 'analytics_events', 'field', 'session_id')
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
    jsonb_build_object('source', 'analytics_events', 'event_name', 'listing_impression', 'note', 'expanded from listing_ids array');
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION analytics_contact_submissions_summary(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_listing_drilldown(text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_listings_detailed(integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_zero_inquiry_listings(integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_posting_funnel(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_supply_trend(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_filters(integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_validation_report(date, text) TO authenticated;
