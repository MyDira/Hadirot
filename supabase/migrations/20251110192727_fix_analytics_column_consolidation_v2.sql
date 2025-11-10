/*
  # Fix Analytics Column Consolidation and View/Impression Tracking
  
  ## Problem
  The analytics_events table has both `props` and `event_props` columns, with data split between them.
  - Newer events (listing_impression_batch, listing_view) use `event_props`
  - Older events used `props`
  - Current views and RPC functions only check one column, causing missing data
  
  ## Summary
  This migration fixes the analytics data pipeline to accurately track views and impressions by:
  
  1. **Data Migration**
     - Consolidate all event data from `props` column into `event_props`
     - Ensure no data is lost during migration
     - Keep `props` column for backward compatibility (can be dropped later)
  
  2. **View Updates**
     - Fix listing_metrics_v1 to check both props and event_props columns
     - Handle both singular listing_id and array listing_ids formats
     - Properly expand batch impression events
  
  3. **RPC Function Updates**
     - Update analytics_top_listings to use COALESCE for column checking
     - Fix analytics_top_listings_detailed to use correct columns
     - Ensure all functions handle both old and new data formats
  
  4. **Improved Data Quality**
     - Add better UUID validation
     - Handle edge cases (null values, empty arrays, malformed data)
     - Add indexes for improved query performance
  
  ## Impact
  - User dashboard will show accurate impression and view counts
  - Internal analytics dashboard will display correct metrics
  - CTR calculations will be accurate
  - Historical data will be preserved and accessible
  
  ## Security
  - Maintains existing RLS policies
  - No changes to access control
  - All functions use SECURITY DEFINER with search_path = public
*/

-- Step 1: Migrate data from props to event_props for events that have props but empty event_props
UPDATE analytics_events
SET event_props = props
WHERE props != '{}'::jsonb 
  AND event_props = '{}'::jsonb;

-- Step 2: Recreate listing_metrics_v1 view to check both columns
DROP VIEW IF EXISTS public.listing_metrics_v1;

CREATE OR REPLACE VIEW public.listing_metrics_v1 AS
WITH raw_impressions AS (
  -- Single listing impression events (direct format) - check both columns
  SELECT
    COALESCE(
      (ae.event_props ->> 'listing_id'),
      (ae.props ->> 'listing_id')
    )::uuid AS listing_id
  FROM public.analytics_events ae
  WHERE ae.event_name IN ('listing_impression', 'listing_card_view')
    AND (ae.event_props ? 'listing_id' OR ae.props ? 'listing_id')
    AND COALESCE(
      (ae.event_props ->> 'listing_id'),
      (ae.props ->> 'listing_id')
    ) ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
  
  UNION ALL
  
  -- OLD FORMAT: Batch events with singular listing_id in props
  SELECT
    (ae.props ->> 'listing_id')::uuid AS listing_id
  FROM public.analytics_events ae
  WHERE ae.event_name IN ('listing_impression_batch', 'listing_card_view_batch')
    AND ae.props ? 'listing_id'
    AND (ae.props ->> 'listing_id') ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
  
  UNION ALL
  
  -- NEW FORMAT: Batch events with listing_ids array in event_props
  SELECT
    CASE
      WHEN expanded.listing_id_text ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
      THEN expanded.listing_id_text::uuid
      ELSE NULL
    END AS listing_id
  FROM public.analytics_events ae
  CROSS JOIN LATERAL (
    SELECT jsonb_array_elements_text(
      COALESCE(
        ae.event_props -> 'listing_ids', 
        ae.event_props -> 'ids',
        ae.props -> 'listing_ids',
        ae.props -> 'ids',
        '[]'::jsonb
      )
    ) AS listing_id_text
  ) AS expanded
  WHERE ae.event_name IN ('listing_impression_batch', 'listing_card_view_batch')
    AND (
      ae.event_props ? 'listing_ids' OR 
      ae.event_props ? 'ids' OR
      ae.props ? 'listing_ids' OR
      ae.props ? 'ids'
    )
),
rollup_impressions AS (
  SELECT
    ri.listing_id,
    COUNT(*)::bigint AS impressions
  FROM raw_impressions ri
  WHERE ri.listing_id IS NOT NULL
  GROUP BY ri.listing_id
),
rollup_views AS (
  SELECT
    COALESCE(
      (ae.event_props ->> 'listing_id'),
      (ae.props ->> 'listing_id')
    )::uuid AS listing_id,
    COUNT(*)::bigint AS direct_views
  FROM public.analytics_events ae
  WHERE ae.event_name IN ('listing_view', 'listing_page_view')
    AND (ae.event_props ? 'listing_id' OR ae.props ? 'listing_id')
    AND COALESCE(
      (ae.event_props ->> 'listing_id'),
      (ae.props ->> 'listing_id')
    ) ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
  GROUP BY 1
)
SELECT
  l.id AS listing_id,
  COALESCE(i.impressions, 0)::bigint AS impressions,
  COALESCE(v.direct_views, 0)::bigint AS direct_views
FROM public.listings l
LEFT JOIN rollup_impressions i ON i.listing_id = l.id
LEFT JOIN rollup_views v ON v.listing_id = l.id;

GRANT SELECT ON public.listing_metrics_v1 TO anon, authenticated;

-- Step 3: Drop ALL versions of analytics_top_listings function
DROP FUNCTION IF EXISTS analytics_top_listings();
DROP FUNCTION IF EXISTS analytics_top_listings(integer, integer);
DROP FUNCTION IF EXISTS analytics_top_listings(integer, integer, text);

-- Recreate with new logic
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
  WITH impression_events AS (
    -- Expand batch impression events with proper column checking
    SELECT
      CASE
        WHEN expanded.listing_id_text ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
        THEN expanded.listing_id_text
        ELSE NULL
      END AS lid
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
  ),
  view_events AS (
    SELECT
      COALESCE(
        (e.event_props->>'listing_id'),
        (e.props->>'listing_id')
      ) AS lid
    FROM analytics_events e
    WHERE e.occurred_at::date = target_date
      AND e.event_name = 'listing_view'
      AND (e.event_props ? 'listing_id' OR e.props ? 'listing_id')
  )
  SELECT 
    COALESCE(i.lid, v.lid, '')::text as listing_id,
    COALESCE(COUNT(DISTINCT v.lid), 0)::integer as views,
    COALESCE(COUNT(i.lid), 0)::integer as impressions,
    CASE 
      WHEN COUNT(i.lid) > 0 
      THEN ROUND((COUNT(DISTINCT v.lid)::numeric / COUNT(i.lid)::numeric) * 100, 2)
      ELSE 0
    END as ctr
  FROM impression_events i
  FULL OUTER JOIN view_events v ON i.lid = v.lid
  WHERE COALESCE(i.lid, v.lid) IS NOT NULL
    AND COALESCE(i.lid, v.lid) != ''
  GROUP BY COALESCE(i.lid, v.lid)
  HAVING COUNT(i.lid) > 0 OR COUNT(DISTINCT v.lid) > 0
  ORDER BY views DESC, impressions DESC
  LIMIT limit_count;
END;
$$;

-- Step 4: Drop and recreate analytics_top_listings_detailed function
DROP FUNCTION IF EXISTS analytics_top_listings_detailed(integer, integer, text);

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
  WITH impression_events AS (
    SELECT
      CASE
        WHEN expanded.listing_id_text ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
        THEN expanded.listing_id_text::uuid
        ELSE NULL
      END AS lid
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
  ),
  view_events AS (
    SELECT
      COALESCE(
        (e.event_props->>'listing_id'),
        (e.props->>'listing_id')
      )::uuid AS lid
    FROM analytics_events e
    WHERE e.occurred_at::date = target_date
      AND e.event_name = 'listing_view'
      AND (e.event_props ? 'listing_id' OR e.props ? 'listing_id')
      AND COALESCE(
        (e.event_props->>'listing_id'),
        (e.props->>'listing_id')
      ) ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
  ),
  listing_stats AS (
    SELECT
      COALESCE(i.lid, v.lid) as lid,
      COUNT(DISTINCT v.lid)::integer as view_count,
      COUNT(i.lid)::integer as impression_count,
      CASE
        WHEN COUNT(i.lid) > 0
        THEN ROUND((COUNT(DISTINCT v.lid)::numeric / COUNT(i.lid)::numeric) * 100, 2)
        ELSE 0
      END as click_through_rate
    FROM impression_events i
    FULL OUTER JOIN view_events v ON i.lid = v.lid
    WHERE COALESCE(i.lid, v.lid) IS NOT NULL
    GROUP BY COALESCE(i.lid, v.lid)
    HAVING COUNT(i.lid) > 0 OR COUNT(DISTINCT v.lid) > 0
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

-- Step 5: Add helpful indexes for the consolidated approach
CREATE INDEX IF NOT EXISTS analytics_events_event_props_listing_id_idx
ON analytics_events ((event_props->>'listing_id'))
WHERE event_props->>'listing_id' IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_events_props_listing_id_idx
ON analytics_events ((props->>'listing_id'))
WHERE props->>'listing_id' IS NOT NULL;

-- Step 6: Add comment explaining the dual-column approach
COMMENT ON VIEW listing_metrics_v1 IS 
'Aggregates impressions and direct views for each listing. Checks both props (old) and event_props (new) columns to ensure all historical data is captured. Handles both singular listing_id and array listing_ids formats for batch impression events.';

COMMENT ON FUNCTION analytics_top_listings IS
'Returns top performing listings by views and impressions. Uses COALESCE to check both props and event_props columns for backward compatibility with historical data.';

COMMENT ON FUNCTION analytics_top_listings_detailed IS
'Returns top performing listings with complete property details and metrics. Properly expands batch impression events and checks both old and new data columns.';
