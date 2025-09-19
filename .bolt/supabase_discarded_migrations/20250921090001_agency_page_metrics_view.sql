/*
  # Agency page metrics view

  Aggregates page view counts for each agency from analytics events.
*/

CREATE OR REPLACE VIEW public.agency_page_metrics_v1 AS
WITH filtered_events AS (
  SELECT
    (ae.props ->> 'agency_id')::uuid AS agency_id,
    ae.created_at
  FROM public.analytics_events ae
  WHERE ae.event_name = 'agency_page_view'
    AND ae.props ? 'agency_id'
    AND (ae.props ->> 'agency_id') ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
)
SELECT
  fe.agency_id,
  COUNT(*)::bigint AS views_total,
  COUNT(*) FILTER (
    WHERE fe.created_at >= NOW() - INTERVAL '30 days'
  )::bigint AS views_30d
FROM filtered_events fe
WHERE fe.agency_id IS NOT NULL
GROUP BY fe.agency_id;

GRANT SELECT ON public.agency_page_metrics_v1 TO authenticated;
