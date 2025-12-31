/*
  # Fix Analytics Hub Final Column Issues
  
  ## Issues Fixed
  1. listings.owner_id doesn't exist - should be listings.user_id
  2. Add UUID validation to prevent casting errors from invalid data
*/

-- Fix analytics_listings_performance (owner_id → user_id, add UUID validation)
CREATE OR REPLACE FUNCTION analytics_listings_performance(
  days_back integer DEFAULT 7,
  limit_count integer DEFAULT 20,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id uuid,
  title text,
  location text,
  neighborhood text,
  bedrooms integer,
  price integer,
  views integer,
  impressions integer,
  ctr numeric,
  inquiry_count integer,
  phone_click_count integer,
  hours_to_first_inquiry numeric,
  is_featured boolean,
  posted_by text,
  created_at timestamptz
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
  WITH listing_views AS (
    SELECT
      (event_props->>'listing_id')::uuid as lid,
      COUNT(*)::integer as view_count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'listing_view'
      AND event_props->>'listing_id' IS NOT NULL
      AND event_props->>'listing_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    GROUP BY (event_props->>'listing_id')::uuid
  ),
  listing_impressions AS (
    SELECT
      unnest(
        ARRAY(SELECT jsonb_array_elements_text(event_props->'listing_ids'))
      )::uuid as lid,
      1 as imp_count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'listing_impression_batch'
      AND event_props->'listing_ids' IS NOT NULL
  ),
  impression_totals AS (
    SELECT lid, SUM(imp_count)::integer as impression_count
    FROM listing_impressions
    GROUP BY lid
  ),
  listing_phone_clicks AS (
    SELECT
      (event_props->>'listing_id')::uuid as lid,
      COUNT(*)::integer as click_count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'phone_click'
      AND event_props->>'listing_id' IS NOT NULL
      AND event_props->>'listing_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    GROUP BY (event_props->>'listing_id')::uuid
  ),
  listing_inquiries AS (
    SELECT
      lcs.listing_id as lid,
      COUNT(*)::integer as inq_count,
      MIN(lcs.created_at) as first_inquiry
    FROM listing_contact_submissions lcs
    WHERE (lcs.created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    GROUP BY lcs.listing_id
  )
  SELECT
    l.id as listing_id,
    l.title,
    l.location,
    l.neighborhood,
    l.bedrooms,
    l.price::integer,
    COALESCE(lv.view_count, 0) as views,
    COALESCE(it.impression_count, 0) as impressions,
    CASE
      WHEN COALESCE(it.impression_count, 0) > 0
      THEN ROUND((COALESCE(lv.view_count, 0)::numeric / it.impression_count) * 100, 2)
      ELSE 0
    END as ctr,
    COALESCE(li.inq_count, 0) as inquiry_count,
    COALESCE(lpc.click_count, 0) as phone_click_count,
    CASE
      WHEN li.first_inquiry IS NOT NULL
      THEN ROUND(EXTRACT(EPOCH FROM (li.first_inquiry - l.created_at)) / 3600, 1)
      ELSE NULL
    END as hours_to_first_inquiry,
    l.is_featured,
    COALESCE(p.full_name, 'Unknown') as posted_by,
    l.created_at
  FROM listings l
  LEFT JOIN listing_views lv ON lv.lid = l.id
  LEFT JOIN impression_totals it ON it.lid = l.id
  LEFT JOIN listing_phone_clicks lpc ON lpc.lid = l.id
  LEFT JOIN listing_inquiries li ON li.lid = l.id
  LEFT JOIN profiles p ON p.id = l.user_id
  WHERE l.is_active = true
  ORDER BY COALESCE(lv.view_count, 0) DESC, COALESCE(li.inq_count, 0) DESC
  LIMIT limit_count;
END;
$$;

-- Fix analytics_zero_inquiry_listings (add UUID validation)
CREATE OR REPLACE FUNCTION analytics_zero_inquiry_listings(
  days_back integer DEFAULT 7,
  min_views integer DEFAULT 10,
  limit_count integer DEFAULT 20,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id uuid,
  title text,
  location text,
  neighborhood text,
  bedrooms integer,
  price integer,
  views integer,
  days_since_posted integer,
  is_featured boolean
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
  WITH listing_views AS (
    SELECT
      (event_props->>'listing_id')::uuid as lid,
      COUNT(*)::integer as view_count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'listing_view'
      AND event_props->>'listing_id' IS NOT NULL
      AND event_props->>'listing_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    GROUP BY (event_props->>'listing_id')::uuid
    HAVING COUNT(*) >= min_views
  ),
  listing_inquiries AS (
    SELECT DISTINCT lcs.listing_id as lid
    FROM listing_contact_submissions lcs
    WHERE (lcs.created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
  )
  SELECT
    l.id as listing_id,
    l.title,
    l.location,
    l.neighborhood,
    l.bedrooms,
    l.price::integer,
    lv.view_count as views,
    (end_date - l.created_at::date)::integer as days_since_posted,
    l.is_featured
  FROM listings l
  INNER JOIN listing_views lv ON lv.lid = l.id
  LEFT JOIN listing_inquiries li ON li.lid = l.id
  WHERE li.lid IS NULL
    AND l.is_active = true
  ORDER BY lv.view_count DESC
  LIMIT limit_count;
END;
$$;

-- Fix analytics_listing_drilldown (add UUID validation)
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
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';

  RETURN QUERY
  WITH daily_views AS (
    SELECT
      (occurred_at AT TIME ZONE tz)::date as day_date,
      COUNT(*)::integer as view_count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'listing_view'
      AND event_props->>'listing_id' IS NOT NULL
      AND event_props->>'listing_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (event_props->>'listing_id')::uuid = p_listing_id
    GROUP BY (occurred_at AT TIME ZONE tz)::date
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
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'listing_view'
      AND event_props->>'listing_id' IS NOT NULL
      AND event_props->>'listing_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (event_props->>'listing_id')::uuid = p_listing_id
  ),
  total_impressions AS (
    SELECT COUNT(*)::integer as count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'listing_impression_batch'
      AND event_props->'listing_ids' ? p_listing_id::text
  ),
  total_phone_clicks AS (
    SELECT COUNT(*)::integer as count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'phone_click'
      AND event_props->>'listing_id' IS NOT NULL
      AND event_props->>'listing_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (event_props->>'listing_id')::uuid = p_listing_id
  ),
  inquiry_details AS (
    SELECT
      lcs.id,
      lcs.name,
      lcs.phone,
      lcs.created_at
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
      (SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone, 'created_at', created_at) ORDER BY created_at DESC) FROM inquiry_details),
      '[]'::jsonb
    ) as inquiries
  FROM listings l
  WHERE l.id = p_listing_id;
END;
$$;
