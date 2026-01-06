/*
  # Cleanup All Duplicate Analytics Function Signatures
  
  ## Problem
  Multiple analytics functions have duplicate versions with different parameter
  orders or signatures, causing PostgreSQL function resolution failures.
  
  ## Duplicates Found
  1. analytics_kpis - (days_back) vs (days_back, tz)
  2. analytics_listing_drilldown - (text, ...) vs (uuid, ...)
  3. analytics_summary - () vs (days_back, tz)
  4. analytics_top_filters - () vs (days_back, tz, limit_count)
  5. analytics_top_listings_detailed - different param orders
  6. analytics_zero_inquiry_listings - different param orders
  
  ## Solution
  Drop all duplicate versions and keep/create single canonical versions
*/

-- ============================================================================
-- 1. Clean up analytics_kpis duplicates
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_kpis(integer);
-- Keep: analytics_kpis(days_back integer, tz text)

-- ============================================================================
-- 2. Clean up analytics_listing_drilldown duplicates  
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_listing_drilldown(uuid, integer, text);
-- Keep: analytics_listing_drilldown(p_listing_id text, days_back integer, tz text)

-- ============================================================================
-- 3. Clean up analytics_summary duplicates
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_summary();
-- Keep: analytics_summary(days_back integer, tz text)

-- ============================================================================
-- 4. Clean up analytics_top_filters duplicates (additional cleanup)
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_top_filters();
-- Already fixed: analytics_top_filters(days_back integer, tz text, limit_count integer)

-- ============================================================================
-- 5. Clean up analytics_top_listings_detailed duplicates
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_top_listings_detailed(integer, integer, text);

-- Recreate with consistent parameter order
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
      COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid,
      COUNT(*) AS view_count
    FROM analytics_events ae
    WHERE ae.event_name = 'listing_view'
      AND ae.occurred_at >= start_ts
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
    WHERE ae.event_name = 'listing_impression'
      AND ae.occurred_at >= start_ts
    GROUP BY listing_id_text
  ),
  phone_counts AS (
    SELECT
      COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid,
      COUNT(*) AS phone_count
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_click'
      AND ae.occurred_at >= start_ts
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
    GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')
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
    l.price::numeric,
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

-- ============================================================================
-- 6. Clean up analytics_zero_inquiry_listings duplicates
-- ============================================================================
DROP FUNCTION IF EXISTS analytics_zero_inquiry_listings(integer, integer, integer, text);

-- Recreate with consistent parameter order
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
  WHERE l.status = 'active'
    AND COALESCE(vc.view_count, 0) >= min_views
    AND l.id::text NOT IN (SELECT lid FROM listings_with_inquiries WHERE lid IS NOT NULL)
    AND l.id::text NOT IN (SELECT lid FROM phone_clicks WHERE lid IS NOT NULL)
  ORDER BY COALESCE(vc.view_count, 0) DESC
  LIMIT 20;
END;
$$;

-- ============================================================================
-- Grant execute permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION analytics_top_listings_detailed(integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_zero_inquiry_listings(integer, text, integer) TO authenticated;
