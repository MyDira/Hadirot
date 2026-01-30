-- ============================================================================
-- REBUILD INQUIRY ANALYTICS WITH DUAL-METRIC SYSTEM
-- ============================================================================
--
-- Purpose: Track TWO types of inquiry events to measure marketplace effectiveness:
-- 1. Phone Reveals - When users click to reveal landlord contact phone number
-- 2. Contact Forms - When users submit their info via listing contact form
--
-- Background Context:
-- - Phone reveals: Tracked in analytics_events table with event_name='phone_click'
-- - Contact forms: Tracked in listing_contact_submissions table
-- - Previous system only tracked contact forms in inquiry metrics
-- - CEO needs BOTH metrics to understand complete conversion funnel
--
-- Architecture Decisions:
--
-- 1. WHY LISTING-LEVEL MATCHING (NOT SESSION MATCHING):
--    Problem: analytics_events.session_id (UUID) ≠ listing_contact_submissions.session_id (TEXT)
--    - analytics_events stores session_id as UUID: "5bb4b26a-66fb-427c-a6fb-a59ceb1a3f6c"
--    - listing_contact_submissions stores session_id as TEXT: "1767726543659-hfimu"
--    - These are different session tracking mechanisms (UUID vs timestamp-based)
--    - Cannot match users across tables by session
--    Solution: Match by LISTING_ID instead
--    - "both_count" means: listings that received BOTH phone reveals AND contact forms
--    - This measures listing-level inquiry diversity, not user-level behavior
--
-- 2. WHY COALESCE FOR event_props/props:
--    Problem: Analytics events table has dual JSONB columns for historical reasons
--    - Older events stored data in "props" column
--    - Newer events store data in "event_props" column
--    - Current data: 100% of phone_click events use event_props (verified)
--    Solution: Always use COALESCE(event_props, props) for backwards compatibility
--    - Pattern: COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')
--    - Ensures queries work with both old and new event formats
--
-- 3. TIMEZONE HANDLING STRATEGY:
--    - All functions accept tz parameter (default: 'America/New_York')
--    - DST-safe time window calculation:
--      * end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp)
--      * start_ts := end_ts - make_interval(days => days_back)
--    - All timestamp filters use: COALESCE(ae.occurred_at, ae.ts)
--    - Ensures consistent day boundaries across daylight saving transitions
--
-- 4. PERIOD COMPARISON LOGIC:
--    - Current period: [now - days_back, now]
--    - Previous period: [now - 2*days_back, now - days_back]
--    - Same duration for accurate % change calculations
--
-- 5. UNIQUE INQUIRERS CALCULATION:
--    - Cannot deduplicate across different identifier types
--    - Phone reveals tracked by anonymous session UUID
--    - Contact forms tracked by user-provided phone number
--    - Total unique inquirers = unique_sessions_phone + unique_phones_form (SUM, not deduplicated)
--
-- Functions Created:
-- - analytics_inquiry_overview_dual: Primary metrics with period comparison
-- - analytics_inquiry_conversion_funnel: Sessions→inquiries conversion rates
-- - analytics_inquiry_user_behavior: Listing-level behavior segmentation
-- - analytics_inquiry_listings_performance_dual: Top listings by combined inquiries
-- - analytics_inquiry_demand_breakdown_dual: Demand by price/bedrooms/neighborhood (separate)
-- - analytics_inquiry_timing_phones: Hour/day heatmap for phone reveals
-- - analytics_inquiry_quality_metrics: Repeat rates and quality indicators
--
-- Existing Functions Retained:
-- - analytics_inquiry_trend: Already returns both phone_click_count and inquiry_count
-- - analytics_inquiry_timing: Returns contact form timing (now used as forms-only heatmap)
-- - analytics_abuse_signals: Still relevant for spam detection
--
-- Security:
-- - All functions use SECURITY DEFINER
-- - All functions call require_admin() to enforce admin-only access
-- - All functions set search_path = public for security
-- - GRANT EXECUTE to authenticated role (admin check happens inside function)
--
-- ============================================================================

-- Drop any conflicting function signatures (none expected, but safe to check)
DROP FUNCTION IF EXISTS analytics_inquiry_overview_dual(integer, text);
DROP FUNCTION IF EXISTS analytics_inquiry_conversion_funnel(integer, text);
DROP FUNCTION IF EXISTS analytics_inquiry_user_behavior(integer, text);
DROP FUNCTION IF EXISTS analytics_inquiry_listings_performance_dual(integer, text, integer);
DROP FUNCTION IF EXISTS analytics_inquiry_demand_breakdown_dual(integer, text);
DROP FUNCTION IF EXISTS analytics_inquiry_timing_phones(integer, text);
DROP FUNCTION IF EXISTS analytics_inquiry_quality_metrics(integer, text);

-- ============================================================================
-- FUNCTION 1: analytics_inquiry_overview_dual
-- Returns primary metrics with current and previous period for % change calculation
-- ============================================================================

CREATE OR REPLACE FUNCTION analytics_inquiry_overview_dual(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  phone_reveals bigint,
  phone_reveals_prev bigint,
  contact_forms bigint,
  contact_forms_prev bigint,
  total_inquiries bigint,
  total_inquiries_prev bigint,
  unique_sessions_phone bigint,
  unique_phones_form bigint
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
  SELECT
    -- Current period phone reveals
    (SELECT COUNT(*) FROM analytics_events ae
     WHERE ae.event_name = 'phone_click'
       AND COALESCE(ae.occurred_at, ae.ts) >= current_start_ts
       AND COALESCE(ae.occurred_at, ae.ts) < current_end_ts
       AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL)::bigint,

    -- Previous period phone reveals
    (SELECT COUNT(*) FROM analytics_events ae
     WHERE ae.event_name = 'phone_click'
       AND COALESCE(ae.occurred_at, ae.ts) >= prev_start_ts
       AND COALESCE(ae.occurred_at, ae.ts) < prev_end_ts
       AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL)::bigint,

    -- Current period contact forms
    (SELECT COUNT(*) FROM listing_contact_submissions lcs
     WHERE lcs.created_at >= current_start_ts
       AND lcs.created_at < current_end_ts)::bigint,

    -- Previous period contact forms
    (SELECT COUNT(*) FROM listing_contact_submissions lcs
     WHERE lcs.created_at >= prev_start_ts
       AND lcs.created_at < prev_end_ts)::bigint,

    -- Current period total (calculated)
    (SELECT COUNT(*) FROM analytics_events ae
     WHERE ae.event_name = 'phone_click'
       AND COALESCE(ae.occurred_at, ae.ts) >= current_start_ts
       AND COALESCE(ae.occurred_at, ae.ts) < current_end_ts
       AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL)::bigint +
    (SELECT COUNT(*) FROM listing_contact_submissions lcs
     WHERE lcs.created_at >= current_start_ts
       AND lcs.created_at < current_end_ts)::bigint,

    -- Previous period total (calculated)
    (SELECT COUNT(*) FROM analytics_events ae
     WHERE ae.event_name = 'phone_click'
       AND COALESCE(ae.occurred_at, ae.ts) >= prev_start_ts
       AND COALESCE(ae.occurred_at, ae.ts) < prev_end_ts
       AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL)::bigint +
    (SELECT COUNT(*) FROM listing_contact_submissions lcs
     WHERE lcs.created_at >= prev_start_ts
       AND lcs.created_at < prev_end_ts)::bigint,

    -- Unique sessions with phone reveals (current period)
    (SELECT COUNT(DISTINCT ae.session_id) FROM analytics_events ae
     WHERE ae.event_name = 'phone_click'
       AND COALESCE(ae.occurred_at, ae.ts) >= current_start_ts
       AND COALESCE(ae.occurred_at, ae.ts) < current_end_ts
       AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL)::bigint,

    -- Unique phone numbers from forms (current period)
    (SELECT COUNT(DISTINCT lcs.user_phone) FROM listing_contact_submissions lcs
     WHERE lcs.created_at >= current_start_ts
       AND lcs.created_at < current_end_ts)::bigint;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_inquiry_overview_dual(integer, text) TO authenticated;

COMMENT ON FUNCTION analytics_inquiry_overview_dual IS
'Returns primary inquiry metrics with period-over-period comparison for both phone reveals and contact forms';

-- ============================================================================
-- FUNCTION 2: analytics_inquiry_conversion_funnel
-- Calculates conversion rates from sessions and views to both inquiry types
-- ============================================================================

CREATE OR REPLACE FUNCTION analytics_inquiry_conversion_funnel(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  total_sessions bigint,
  total_listing_views bigint,
  phone_reveals bigint,
  phone_reveal_session_rate numeric,
  phone_reveal_view_rate numeric,
  contact_forms bigint,
  contact_form_session_rate numeric,
  contact_form_view_rate numeric,
  combined_inquiry_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
  sessions_count bigint;
  views_count bigint;
  phones_count bigint;
  forms_count bigint;
BEGIN
  PERFORM require_admin();

  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);

  SELECT COUNT(DISTINCT session_id) INTO sessions_count
  FROM analytics_events
  WHERE COALESCE(occurred_at, ts) >= start_ts
    AND COALESCE(occurred_at, ts) < end_ts;

  SELECT COUNT(*) INTO views_count
  FROM analytics_events
  WHERE event_name = 'listing_view'
    AND COALESCE(occurred_at, ts) >= start_ts
    AND COALESCE(occurred_at, ts) < end_ts;

  SELECT COUNT(*) INTO phones_count
  FROM analytics_events
  WHERE event_name = 'phone_click'
    AND COALESCE(occurred_at, ts) >= start_ts
    AND COALESCE(occurred_at, ts) < end_ts
    AND COALESCE(event_props->>'listing_id', props->>'listing_id') IS NOT NULL;

  SELECT COUNT(*) INTO forms_count
  FROM listing_contact_submissions
  WHERE created_at >= start_ts
    AND created_at < end_ts;

  RETURN QUERY
  SELECT
    sessions_count,
    views_count,
    phones_count,
    CASE WHEN sessions_count > 0 THEN ROUND((phones_count::numeric / sessions_count::numeric) * 100, 2) ELSE 0 END,
    CASE WHEN views_count > 0 THEN ROUND((phones_count::numeric / views_count::numeric) * 100, 2) ELSE 0 END,
    forms_count,
    CASE WHEN sessions_count > 0 THEN ROUND((forms_count::numeric / sessions_count::numeric) * 100, 2) ELSE 0 END,
    CASE WHEN views_count > 0 THEN ROUND((forms_count::numeric / views_count::numeric) * 100, 2) ELSE 0 END,
    CASE WHEN sessions_count > 0 THEN ROUND(((phones_count + forms_count)::numeric / sessions_count::numeric) * 100, 2) ELSE 0 END;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_inquiry_conversion_funnel(integer, text) TO authenticated;

COMMENT ON FUNCTION analytics_inquiry_conversion_funnel IS
'Calculates conversion rates from sessions and listing views to phone reveals and contact forms';

-- ============================================================================
-- FUNCTION 3: analytics_inquiry_user_behavior
-- Segments listings by inquiry type: phone only, form only, or both
-- Uses listing-level matching because session IDs are incompatible
-- ============================================================================

CREATE OR REPLACE FUNCTION analytics_inquiry_user_behavior(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  phone_only_count bigint,
  form_only_count bigint,
  both_count bigint
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
  WITH phone_listings AS (
    -- All listings with at least one phone reveal
    SELECT DISTINCT
      COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid AS listing_id
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_click'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
  ),
  form_listings AS (
    -- All listings with at least one contact form submission
    SELECT DISTINCT lcs.listing_id
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts
      AND lcs.created_at < end_ts
  ),
  both_listings AS (
    -- INTERSECT: Listings that appear in BOTH phone_listings AND form_listings
    SELECT pl.listing_id
    FROM phone_listings pl
    INNER JOIN form_listings fl ON fl.listing_id = pl.listing_id
  )
  SELECT
    -- Phone only: Listings with phone reveals but NO contact forms
    (SELECT COUNT(*)
     FROM phone_listings
     WHERE listing_id NOT IN (SELECT listing_id FROM form_listings))::bigint,

    -- Form only: Listings with contact forms but NO phone reveals
    (SELECT COUNT(*)
     FROM form_listings
     WHERE listing_id NOT IN (SELECT listing_id FROM phone_listings))::bigint,

    -- Both: Listings with BOTH phone reveals AND contact forms
    (SELECT COUNT(*) FROM both_listings)::bigint;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_inquiry_user_behavior(integer, text) TO authenticated;

COMMENT ON FUNCTION analytics_inquiry_user_behavior IS
'Segments listings by inquiry type behavior: phone reveals only, contact forms only, or both types. Uses listing-level matching because session IDs between analytics_events (UUID) and listing_contact_submissions (TEXT) are incompatible.';

-- ============================================================================
-- FUNCTION 4: analytics_inquiry_listings_performance_dual
-- Top listings ranked by total inquiries (phone reveals + contact forms)
-- ============================================================================

CREATE OR REPLACE FUNCTION analytics_inquiry_listings_performance_dual(
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
  phone_reveals bigint,
  contact_forms bigint,
  total_inquiries bigint,
  conversion_rate numeric,
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
  WITH phone_counts AS (
    SELECT
      COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid AS lid,
      COUNT(*) AS phone_count
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_click'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
    GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid
  ),
  form_counts AS (
    SELECT
      lcs.listing_id AS lid,
      COUNT(*) AS form_count
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts
      AND lcs.created_at < end_ts
    GROUP BY lcs.listing_id
  ),
  view_counts AS (
    SELECT
      COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid AS lid,
      COUNT(*) AS view_count
    FROM analytics_events ae
    WHERE ae.event_name = 'listing_view'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
    GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid
  )
  SELECT
    l.id,
    l.title,
    l.location,
    l.neighborhood,
    l.bedrooms,
    l.price,
    COALESCE(pc.phone_count, 0)::bigint,
    COALESCE(fc.form_count, 0)::bigint,
    (COALESCE(pc.phone_count, 0) + COALESCE(fc.form_count, 0))::bigint,
    CASE
      WHEN COALESCE(vc.view_count, 0) > 0 THEN
        ROUND(((COALESCE(pc.phone_count, 0) + COALESCE(fc.form_count, 0))::numeric / vc.view_count::numeric) * 100, 2)
      ELSE 0
    END,
    l.is_featured,
    COALESCE(p.full_name, 'Unknown')
  FROM listings l
  LEFT JOIN phone_counts pc ON pc.lid = l.id
  LEFT JOIN form_counts fc ON fc.lid = l.id
  LEFT JOIN view_counts vc ON vc.lid = l.id
  LEFT JOIN profiles p ON p.id = l.user_id
  WHERE l.is_active = true
    AND (COALESCE(pc.phone_count, 0) + COALESCE(fc.form_count, 0)) > 0
  ORDER BY (COALESCE(pc.phone_count, 0) + COALESCE(fc.form_count, 0)) DESC
  LIMIT limit_count;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_inquiry_listings_performance_dual(integer, text, integer) TO authenticated;

COMMENT ON FUNCTION analytics_inquiry_listings_performance_dual IS
'Returns top-performing listings ranked by total inquiries (phone reveals + contact forms combined)';

-- ============================================================================
-- FUNCTION 5: analytics_inquiry_demand_breakdown_dual
-- Separate demand analysis for phone reveals and contact forms
-- ============================================================================

CREATE OR REPLACE FUNCTION analytics_inquiry_demand_breakdown_dual(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  by_price_band_phones jsonb,
  by_price_band_forms jsonb,
  by_bedrooms_phones jsonb,
  by_bedrooms_forms jsonb,
  by_neighborhood_phones jsonb,
  by_neighborhood_forms jsonb
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
  WITH phone_listings AS (
    SELECT DISTINCT COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid AS listing_id
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_click'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
  ),
  form_listings AS (
    SELECT DISTINCT lcs.listing_id
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts
      AND lcs.created_at < end_ts
  ),
  phone_price_bands AS (
    SELECT
      CASE
        WHEN l.price IS NULL THEN 'Call for Price'
        WHEN l.price < 2000 THEN 'Under $2,000'
        WHEN l.price < 3000 THEN '$2,000-$3,000'
        WHEN l.price < 4000 THEN '$3,000-$4,000'
        ELSE '$4,000+'
      END AS label,
      CASE
        WHEN l.price IS NULL THEN 5
        WHEN l.price < 2000 THEN 1
        WHEN l.price < 3000 THEN 2
        WHEN l.price < 4000 THEN 3
        ELSE 4
      END AS sort_order,
      COUNT(*)::integer AS count
    FROM phone_listings pl
    INNER JOIN listings l ON l.id = pl.listing_id
    GROUP BY label, sort_order
  ),
  form_price_bands AS (
    SELECT
      CASE
        WHEN l.price IS NULL THEN 'Call for Price'
        WHEN l.price < 2000 THEN 'Under $2,000'
        WHEN l.price < 3000 THEN '$2,000-$3,000'
        WHEN l.price < 4000 THEN '$3,000-$4,000'
        ELSE '$4,000+'
      END AS label,
      CASE
        WHEN l.price IS NULL THEN 5
        WHEN l.price < 2000 THEN 1
        WHEN l.price < 3000 THEN 2
        WHEN l.price < 4000 THEN 3
        ELSE 4
      END AS sort_order,
      COUNT(*)::integer AS count
    FROM form_listings fl
    INNER JOIN listings l ON l.id = fl.listing_id
    GROUP BY label, sort_order
  ),
  phone_bedrooms AS (
    SELECT
      CASE
        WHEN l.bedrooms = 0 THEN 'Studio'
        WHEN l.bedrooms = 1 THEN '1 BR'
        WHEN l.bedrooms = 2 THEN '2 BR'
        WHEN l.bedrooms = 3 THEN '3 BR'
        ELSE '4+ BR'
      END AS label,
      l.bedrooms AS sort_order,
      COUNT(*)::integer AS count
    FROM phone_listings pl
    INNER JOIN listings l ON l.id = pl.listing_id
    GROUP BY label, l.bedrooms
  ),
  form_bedrooms AS (
    SELECT
      CASE
        WHEN l.bedrooms = 0 THEN 'Studio'
        WHEN l.bedrooms = 1 THEN '1 BR'
        WHEN l.bedrooms = 2 THEN '2 BR'
        WHEN l.bedrooms = 3 THEN '3 BR'
        ELSE '4+ BR'
      END AS label,
      l.bedrooms AS sort_order,
      COUNT(*)::integer AS count
    FROM form_listings fl
    INNER JOIN listings l ON l.id = fl.listing_id
    GROUP BY label, l.bedrooms
  ),
  phone_neighborhoods AS (
    SELECT
      COALESCE(l.neighborhood, 'Unknown') AS label,
      COUNT(*)::integer AS count
    FROM phone_listings pl
    INNER JOIN listings l ON l.id = pl.listing_id
    GROUP BY l.neighborhood
    ORDER BY COUNT(*) DESC
    LIMIT 5
  ),
  form_neighborhoods AS (
    SELECT
      COALESCE(l.neighborhood, 'Unknown') AS label,
      COUNT(*)::integer AS count
    FROM form_listings fl
    INNER JOIN listings l ON l.id = fl.listing_id
    GROUP BY l.neighborhood
    ORDER BY COUNT(*) DESC
    LIMIT 5
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count) ORDER BY sort_order) FROM phone_price_bands), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count) ORDER BY sort_order) FROM form_price_bands), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count) ORDER BY sort_order) FROM phone_bedrooms), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count) ORDER BY sort_order) FROM form_bedrooms), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count)) FROM phone_neighborhoods), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count)) FROM form_neighborhoods), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_inquiry_demand_breakdown_dual(integer, text) TO authenticated;

COMMENT ON FUNCTION analytics_inquiry_demand_breakdown_dual IS
'Separate demand breakdown by price, bedrooms, and neighborhood for phone reveals and contact forms';

-- ============================================================================
-- FUNCTION 6: analytics_inquiry_timing_phones
-- Hour and day-of-week distribution for phone reveals
-- ============================================================================

CREATE OR REPLACE FUNCTION analytics_inquiry_timing_phones(
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
    EXTRACT(DOW FROM (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz))::integer,
    EXTRACT(HOUR FROM (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz))::integer,
    COUNT(*)::integer
  FROM analytics_events ae
  WHERE ae.event_name = 'phone_click'
    AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
    AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
  GROUP BY
    EXTRACT(DOW FROM (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)),
    EXTRACT(HOUR FROM (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz))
  ORDER BY
    EXTRACT(DOW FROM (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)),
    EXTRACT(HOUR FROM (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz));
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_inquiry_timing_phones(integer, text) TO authenticated;

COMMENT ON FUNCTION analytics_inquiry_timing_phones IS
'Returns hour and day-of-week distribution for phone reveals (phone_click events)';

-- ============================================================================
-- FUNCTION 7: analytics_inquiry_quality_metrics
-- Combined quality metrics across both inquiry types
-- ============================================================================

CREATE OR REPLACE FUNCTION analytics_inquiry_quality_metrics(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  repeat_inquiry_rate numeric,
  avg_listings_per_user numeric,
  avg_time_to_first_inquiry_hours numeric
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
  WITH form_stats AS (
    SELECT
      lcs.user_phone,
      COUNT(*) AS inquiry_count,
      COUNT(DISTINCT lcs.listing_id) AS listings_contacted
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts
      AND lcs.created_at < end_ts
    GROUP BY lcs.user_phone
  ),
  first_inquiries AS (
    SELECT
      lcs.listing_id,
      MIN(lcs.created_at) AS first_inquiry_at,
      l.created_at AS listing_created_at,
      EXTRACT(EPOCH FROM (MIN(lcs.created_at) - l.created_at)) / 3600 AS hours_to_inquiry
    FROM listing_contact_submissions lcs
    INNER JOIN listings l ON l.id = lcs.listing_id
    WHERE lcs.created_at >= start_ts
      AND lcs.created_at < end_ts
    GROUP BY lcs.listing_id, l.created_at
  )
  SELECT
    ROUND(COALESCE(
      (SELECT (COUNT(*) FILTER (WHERE inquiry_count > 1)::numeric / NULLIF(COUNT(*), 0)) * 100
       FROM form_stats),
      0
    ), 1)::numeric,
    ROUND(COALESCE(
      (SELECT AVG(listings_contacted) FROM form_stats),
      0
    ), 2)::numeric,
    ROUND(COALESCE(
      (SELECT AVG(hours_to_inquiry) FROM first_inquiries),
      0
    ), 1)::numeric;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_inquiry_quality_metrics(integer, text) TO authenticated;

COMMENT ON FUNCTION analytics_inquiry_quality_metrics IS
'Returns quality metrics: repeat inquiry rate, average listings per user, and time to first inquiry';
