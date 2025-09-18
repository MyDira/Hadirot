/*
  # Create agency page metrics view

  1. New Views
    - `agency_page_metrics_v1`
      - `agency_id` (uuid, references agencies.id)
      - `views_total` (bigint, total page views for the agency)
      - `views_30d` (bigint, page views in the last 30 days)

  2. Security
    - View inherits RLS from underlying tables
    - Public read access for active agencies

  This view aggregates analytics data to provide agency-specific page metrics
  by counting relevant events from the analytics_events table.
*/

CREATE OR REPLACE VIEW agency_page_metrics_v1 AS
SELECT 
  a.id as agency_id,
  COALESCE(total_views.views_total, 0) as views_total,
  COALESCE(recent_views.views_30d, 0) as views_30d
FROM agencies a
LEFT JOIN (
  SELECT 
    (ae.props->>'agency_id')::uuid as agency_id,
    COUNT(*) as views_total
  FROM analytics_events ae
  WHERE ae.event_name = 'agency_page_view'
    AND ae.props->>'agency_id' IS NOT NULL
  GROUP BY (ae.props->>'agency_id')::uuid
) total_views ON total_views.agency_id = a.id
LEFT JOIN (
  SELECT 
    (ae.props->>'agency_id')::uuid as agency_id,
    COUNT(*) as views_30d
  FROM analytics_events ae
  WHERE ae.event_name = 'agency_page_view'
    AND ae.props->>'agency_id' IS NOT NULL
    AND ae.ts >= NOW() - INTERVAL '30 days'
  GROUP BY (ae.props->>'agency_id')::uuid
) recent_views ON recent_views.agency_id = a.id
WHERE a.is_active = true;