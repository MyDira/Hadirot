/*
  # Update Remaining Analytics Functions with Graceful Admin Check
  
  Updates the remaining analytics functions used by the dashboard to use
  the graceful is_admin() check instead of throwing errors.
*/

-- analytics_supply_stats - doesn't have admin check, needs one
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
  IF NOT is_admin() THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint, '[]'::jsonb;
    RETURN;
  END IF;

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

-- analytics_listings_performance
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
  IF NOT is_admin() THEN
    RETURN;
  END IF;

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

-- analytics_top_filters - update to use graceful check
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
  IF NOT is_admin() THEN
    RETURN;
  END IF;

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

-- analytics_inquiry_quality
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
  IF NOT is_admin() THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::numeric, 0::numeric;
    RETURN;
  END IF;

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

-- analytics_inquiry_trend
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
  IF NOT is_admin() THEN
    RETURN;
  END IF;

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

-- analytics_inquiry_velocity  
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
  IF NOT is_admin() THEN
    RETURN;
  END IF;

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

-- analytics_top_inquired_listings
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
  IF NOT is_admin() THEN
    RETURN;
  END IF;

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

-- analytics_inquiry_demand
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
  IF NOT is_admin() THEN
    RETURN QUERY SELECT '[]'::jsonb, '[]'::jsonb, '[]'::jsonb;
    RETURN;
  END IF;

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

-- analytics_inquiry_timing
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
  IF NOT is_admin() THEN
    RETURN;
  END IF;

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

-- analytics_abuse_signals
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
  IF NOT is_admin() THEN
    RETURN;
  END IF;

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

-- Grant permissions
GRANT EXECUTE ON FUNCTION analytics_supply_stats(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_listings_performance(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_filters(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_quality(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_trend(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_velocity(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_top_inquired_listings(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_demand(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_inquiry_timing(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_abuse_signals(integer, integer, integer, text) TO authenticated;
