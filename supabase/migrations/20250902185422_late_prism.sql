/*
  # Fix Analytics RPC Functions

  1. Fix ambiguous listing_id column reference in analytics_top_listings
  2. Fix type mismatch (bigint vs integer) in analytics_top_filters
*/

-- Drop and recreate analytics_top_listings to fix ambiguous listing_id
DROP FUNCTION IF EXISTS public.analytics_top_listings(integer, integer);

CREATE OR REPLACE FUNCTION public.analytics_top_listings(
  days_back integer DEFAULT 7,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  listing_id uuid,
  views bigint,
  impressions bigint,
  ctr numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH views_cte AS (
    SELECT 
      (ae.props->>'listing_id')::uuid AS listing_id,
      COUNT(*) AS view_count
    FROM analytics_events ae
    WHERE ae.event_name = 'listing_view'
      AND ae.ts > (now() at time zone 'utc') - (days_back || ' days')::interval
      AND ae.props ? 'listing_id'
    GROUP BY (ae.props->>'listing_id')::uuid
  ),
  impressions_cte AS (
    SELECT 
      listing_id_text::uuid AS listing_id,
      COUNT(*) AS impression_count
    FROM analytics_events ae,
         jsonb_array_elements_text(
           COALESCE(ae.props->'listing_ids', ae.props->'ids', '[]'::jsonb)
         ) AS listing_id_text
    WHERE ae.event_name = 'listing_impression_batch'
      AND ae.ts > (now() at time zone 'utc') - (days_back || ' days')::interval
      AND (ae.props ? 'listing_ids' OR ae.props ? 'ids')
    GROUP BY listing_id_text::uuid
  )
  SELECT 
    COALESCE(v.listing_id, i.listing_id) AS listing_id,
    COALESCE(v.view_count, 0) AS views,
    COALESCE(i.impression_count, 0) AS impressions,
    CASE 
      WHEN COALESCE(i.impression_count, 0) > 0 
      THEN ROUND((COALESCE(v.view_count, 0)::numeric / i.impression_count::numeric) * 100, 2)
      ELSE 0::numeric
    END AS ctr
  FROM views_cte v
  FULL OUTER JOIN impressions_cte i ON v.listing_id = i.listing_id
  ORDER BY COALESCE(v.view_count, 0) DESC
  LIMIT limit_count;
END;
$$;

-- Drop and recreate analytics_top_filters to fix type mismatch
DROP FUNCTION IF EXISTS public.analytics_top_filters(integer, integer);

CREATE OR REPLACE FUNCTION public.analytics_top_filters(
  days_back integer DEFAULT 7,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  filter_key text,
  filter_value text,
  uses integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    key_val.key AS filter_key,
    key_val.val AS filter_value,
    COUNT(*)::integer AS uses
  FROM (
    SELECT 
      jsonb_object_keys(ae.props->'filters') AS key,
      (ae.props->'filters'->>jsonb_object_keys(ae.props->'filters')) AS val
    FROM analytics_events ae
    WHERE ae.event_name = 'filter_apply'
      AND ae.ts > (now() at time zone 'utc') - (days_back || ' days')::interval
      AND ae.props ? 'filters'
      AND jsonb_typeof(ae.props->'filters') = 'object'
  ) key_val
  GROUP BY key_val.key, key_val.val
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$;