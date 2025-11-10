/*
  # Fix GROUP BY clause in analytics_top_listings function
  
  ## Problem
  The analytics_top_listings function has a SQL error where columns from the FULL OUTER JOIN
  need to be properly included in the GROUP BY clause.
  
  ## Solution
  Restructure the query to properly aggregate impression and view counts by listing_id
  before joining, rather than trying to aggregate after the join.
*/

-- Drop and recreate analytics_top_listings with corrected GROUP BY logic
DROP FUNCTION IF EXISTS analytics_top_listings(integer, integer, text);

CREATE OR REPLACE FUNCTION analytics_top_listings(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id text,
  views integer,
  impressions integer,
  ctr numeric
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
  WITH impression_counts AS (
    -- Count impressions per listing from batch events
    SELECT
      CASE
        WHEN expanded.listing_id_text ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
        THEN expanded.listing_id_text
        ELSE NULL
      END AS lid,
      COUNT(*) as imp_count
    FROM analytics_events e
    CROSS JOIN LATERAL (
      SELECT jsonb_array_elements_text(
        COALESCE(
          e.event_props -> 'listing_ids',
          e.event_props -> 'ids',
          e.props -> 'listing_ids',
          e.props -> 'ids',
          '[]'::jsonb
        )
      ) AS listing_id_text
    ) AS expanded
    WHERE e.occurred_at::date = target_date
      AND e.event_name = 'listing_impression_batch'
    GROUP BY CASE
        WHEN expanded.listing_id_text ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
        THEN expanded.listing_id_text
        ELSE NULL
      END
    HAVING CASE
        WHEN expanded.listing_id_text ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
        THEN expanded.listing_id_text
        ELSE NULL
      END IS NOT NULL
  ),
  view_counts AS (
    -- Count views per listing
    SELECT
      COALESCE(
        (e.event_props->>'listing_id'),
        (e.props->>'listing_id')
      ) AS lid,
      COUNT(DISTINCT e.id) as view_count
    FROM analytics_events e
    WHERE e.occurred_at::date = target_date
      AND e.event_name = 'listing_view'
      AND (e.event_props ? 'listing_id' OR e.props ? 'listing_id')
      AND COALESCE(
        (e.event_props->>'listing_id'),
        (e.props->>'listing_id')
      ) ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
    GROUP BY COALESCE(
        (e.event_props->>'listing_id'),
        (e.props->>'listing_id')
      )
  )
  SELECT 
    COALESCE(i.lid, v.lid, '')::text as listing_id,
    COALESCE(v.view_count, 0)::integer as views,
    COALESCE(i.imp_count, 0)::integer as impressions,
    CASE 
      WHEN COALESCE(i.imp_count, 0) > 0 
      THEN ROUND((COALESCE(v.view_count, 0)::numeric / i.imp_count::numeric) * 100, 2)
      ELSE 0
    END as ctr
  FROM impression_counts i
  FULL OUTER JOIN view_counts v ON i.lid = v.lid
  WHERE COALESCE(i.lid, v.lid) IS NOT NULL
    AND COALESCE(i.lid, v.lid) != ''
    AND (COALESCE(i.imp_count, 0) > 0 OR COALESCE(v.view_count, 0) > 0)
  ORDER BY views DESC, impressions DESC
  LIMIT limit_count;
END;
$$;

COMMENT ON FUNCTION analytics_top_listings IS
'Returns top performing listings by views and impressions. Uses COALESCE to check both props and event_props columns for backward compatibility with historical data. Aggregates data before joining for proper GROUP BY handling.';
