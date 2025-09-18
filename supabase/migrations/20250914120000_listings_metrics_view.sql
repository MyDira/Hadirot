/*
  # Listing metrics view

  - Aggregates impressions and direct views for each listing based on analytics events
  - Counts impression events from both single listing events and batched payloads
  - Counts direct views from listing view/page view events
  - Exposes a simple view that can be joined from Supabase client code
*/

CREATE OR REPLACE VIEW public.listing_metrics_v1 AS
WITH raw_impressions AS (
  SELECT
    (ae.props ->> 'listing_id')::uuid AS listing_id
  FROM public.analytics_events ae
  WHERE ae.event_name IN ('listing_impression', 'listing_card_view')
    AND ae.props ? 'listing_id'
    AND (ae.props ->> 'listing_id') ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
  UNION ALL
  SELECT
    CASE
      WHEN expanded.listing_id_text ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
      THEN expanded.listing_id_text::uuid
      ELSE NULL
    END AS listing_id
  FROM public.analytics_events ae
  CROSS JOIN LATERAL (
    SELECT jsonb_array_elements_text(
      COALESCE(ae.props -> 'listing_ids', ae.props -> 'ids', '[]'::jsonb)
    ) AS listing_id_text
  ) AS expanded
  WHERE ae.event_name IN ('listing_impression_batch', 'listing_card_view_batch')
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
    (ae.props ->> 'listing_id')::uuid AS listing_id,
    COUNT(*)::bigint AS direct_views
  FROM public.analytics_events ae
  WHERE ae.event_name IN ('listing_view', 'listing_page_view')
    AND ae.props ? 'listing_id'
    AND (ae.props ->> 'listing_id') ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
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
