/*
  # Fix Analytics Listing Drilldown - created_at Ambiguity
  
  ## Issue
  The function has "created_at" as both an output column and a column in CTEs,
  causing ambiguous reference errors. Need to rename CTE columns.
*/

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
