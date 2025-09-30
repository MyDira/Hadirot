/*
  # Fix analytics_top_listings_detailed UUID Cast Error

  ## Problem
  The function fails when analytics_events contains listing_id values that are not valid UUIDs
  (e.g., "debug-listing"). This causes the entire query to fail with: 
  "invalid input syntax for type uuid"

  ## Solution
  Add a WHERE clause to filter out invalid UUID values before attempting the cast.
  Uses a regex pattern to validate UUID format before casting.

  ## Changes
  - Modified analytics_top_listings_detailed function to filter invalid UUIDs
  - Ensures only valid UUID strings are cast to uuid type
  - Prevents query failures from test/debug data
*/

CREATE OR REPLACE FUNCTION analytics_top_listings_detailed(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id uuid,
  property_location text,
  bedrooms integer,
  monthly_rent text,
  posted_by text,
  views integer,
  impressions integer,
  ctr numeric,
  is_featured boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_date date;
BEGIN
  target_date := (now() AT TIME ZONE tz)::date - days_back * interval '1 day';

  RETURN QUERY
  WITH listing_stats AS (
    SELECT
      (e.event_props->>'listing_id')::uuid as lid,
      COUNT(CASE WHEN e.event_name = 'listing_view' THEN 1 END)::integer as view_count,
      COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END)::integer as impression_count,
      CASE
        WHEN COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END) > 0
        THEN ROUND(
          (COUNT(CASE WHEN e.event_name = 'listing_view' THEN 1 END)::numeric /
           COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END)::numeric) * 100,
          2
        )
        ELSE 0
      END as click_through_rate
    FROM analytics_events e
    WHERE e.occurred_at::date = target_date
      AND e.event_name IN ('listing_view', 'listing_impression_batch')
      AND (e.event_props->>'listing_id') IS NOT NULL
      AND (e.event_props->>'listing_id') != ''
      -- Filter to only valid UUID format before casting
      AND (e.event_props->>'listing_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    GROUP BY (e.event_props->>'listing_id')
    HAVING COUNT(*) > 0
  )
  SELECT
    l.id,
    COALESCE(
      CASE
        WHEN l.neighborhood IS NOT NULL AND l.neighborhood != ''
        THEN l.neighborhood || ' - ' || l.location
        ELSE l.location
      END,
      'Unknown Location'
    ) as property_location,
    l.bedrooms,
    CASE
      WHEN l.call_for_price = true THEN 'Call for Price'
      WHEN l.price IS NULL THEN 'Not specified'
      ELSE '$' || l.price::text || '/mo'
    END as monthly_rent,
    COALESCE(p.full_name, 'Unknown') as posted_by,
    ls.view_count,
    ls.impression_count,
    ls.click_through_rate,
    COALESCE(l.is_featured, false) as is_featured
  FROM listing_stats ls
  INNER JOIN listings l ON l.id = ls.lid
  LEFT JOIN profiles p ON p.id = l.user_id
  WHERE l.is_active = true
  ORDER BY ls.view_count DESC, ls.impression_count DESC
  LIMIT limit_count;
END;
$$;
