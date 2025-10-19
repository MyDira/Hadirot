/*
  # Fix listing metrics view to handle both old and new impression formats

  ## Problem
  Historical impression events used `listing_id` (singular) but the view only checked for
  `listing_ids` (plural array). This caused historical impressions to be ignored.

  ## Changes
  - Handle both `listing_id` singular format (old data)
  - Handle `listing_ids` array format (new data going forward)
  - Union both formats together

  ## Impact
  - Historical impression data will now be counted
  - New impression data will also work correctly
*/

CREATE OR REPLACE VIEW public.listing_metrics_v1 AS
WITH raw_impressions AS (
  -- Single listing impression events (direct format)
  SELECT
    (ae.event_props ->> 'listing_id')::uuid AS listing_id
  FROM public.analytics_events ae
  WHERE ae.event_name IN ('listing_impression', 'listing_card_view')
    AND ae.event_props ? 'listing_id'
    AND (ae.event_props ->> 'listing_id') ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
  
  UNION ALL
  
  -- OLD FORMAT: Batch events with singular listing_id (historical data)
  SELECT
    (ae.event_props ->> 'listing_id')::uuid AS listing_id
  FROM public.analytics_events ae
  WHERE ae.event_name IN ('listing_impression_batch', 'listing_card_view_batch')
    AND ae.event_props ? 'listing_id'
    AND (ae.event_props ->> 'listing_id') ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
  
  UNION ALL
  
  -- NEW FORMAT: Batch events with listing_ids array (new data)
  SELECT
    CASE
      WHEN expanded.listing_id_text ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
      THEN expanded.listing_id_text::uuid
      ELSE NULL
    END AS listing_id
  FROM public.analytics_events ae
  CROSS JOIN LATERAL (
    SELECT jsonb_array_elements_text(
      COALESCE(ae.event_props -> 'listing_ids', ae.event_props -> 'ids', '[]'::jsonb)
    ) AS listing_id_text
  ) AS expanded
  WHERE ae.event_name IN ('listing_impression_batch', 'listing_card_view_batch')
    AND (ae.event_props ? 'listing_ids' OR ae.event_props ? 'ids')
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
    (ae.event_props ->> 'listing_id')::uuid AS listing_id,
    COUNT(*)::bigint AS direct_views
  FROM public.analytics_events ae
  WHERE ae.event_name IN ('listing_view', 'listing_page_view')
    AND ae.event_props ? 'listing_id'
    AND (ae.event_props ->> 'listing_id') ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
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
