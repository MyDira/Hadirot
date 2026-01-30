/*
  # Fix UUID Casting in Analytics Inquiry Functions

  ## Problem
  Analytics inquiry functions fail with "invalid input syntax for type uuid" errors when 
  querying date ranges that include test/debug data with non-UUID listing_id values 
  (e.g., "debug-listing").

  ## Solution
  Add UUID validation regex filter BEFORE casting listing_id strings to UUID type.
  Uses case-insensitive regex (~*) to handle both uppercase and lowercase UUIDs.

  ## Functions Fixed
  1. analytics_inquiry_listings_performance_dual
     - Fixed phone_counts CTE
     - Fixed view_counts CTE
  
  2. analytics_inquiry_demand_breakdown_dual
     - Fixed phone_listings CTE
  
  3. analytics_inquiry_user_behavior
     - Fixed phone_listings CTE

  ## Changes
  BEFORE: AND COALESCE(...) IS NOT NULL
  AFTER:  AND COALESCE(...) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

  ## Impact
  - Filters out invalid test data (e.g., "debug-listing")
  - Prevents UUID casting errors on 30-day queries
  - No breaking changes to function signatures
  - Minimal performance impact (regex executed before failed cast)
*/

-- 1. Fix analytics_inquiry_listings_performance_dual
CREATE OR REPLACE FUNCTION analytics_inquiry_listings_performance_dual(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York',
  limit_count integer DEFAULT 20
)
RETURNS TABLE(
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
SET search_path TO 'public'
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
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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

-- 2. Fix analytics_inquiry_demand_breakdown_dual
CREATE OR REPLACE FUNCTION analytics_inquiry_demand_breakdown_dual(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  by_price_band_phones jsonb,
  by_price_band_forms jsonb,
  by_bedrooms_phones jsonb,
  by_bedrooms_forms jsonb,
  by_neighborhood_phones jsonb,
  by_neighborhood_forms jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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

-- 3. Fix analytics_inquiry_user_behavior
CREATE OR REPLACE FUNCTION analytics_inquiry_user_behavior(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  phone_only_count bigint,
  form_only_count bigint,
  both_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
