/*
  # Extend listing_metrics_v1 with phone_reveals and map_pin_clicks

  ## Problem
  The standard user dashboard shows per-listing impressions, direct views, and
  inquiries. Phone reveals (`phone_reveal`) and map pin clicks (`map_pin_click`)
  are already tracked in `analytics_events`, but they were only aggregated by
  admin-only RPCs (`require_admin()`), so a regular listing owner could not see
  them. `listing_metrics_v1` — the view that already powers the owner-facing
  impressions/direct_views counts and is granted to anon/authenticated — did not
  expose them.

  ## Summary
  Recreate `listing_metrics_v1` to add two columns:
    - `phone_reveals`  — count of `phone_reveal` events for the listing
    - `map_pin_clicks` — count of `map_pin_click` events for the listing

  Both follow the exact pattern already used for direct_views: check both the
  new `event_props` and legacy `props` columns, validate the listing_id UUID,
  and group per listing. Existing impressions/direct_views logic is unchanged.

  ## Security
  - No security_invoker change (matches existing view definition).
  - Re-grants SELECT to anon, authenticated (same as before).
  - Only exposes aggregate counts per listing, identical exposure level to the
    impressions/direct_views columns that already exist on this view.
*/

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
),
rollup_phone_reveals AS (
  SELECT
    COALESCE(
      (ae.event_props ->> 'listing_id'),
      (ae.props ->> 'listing_id')
    )::uuid AS listing_id,
    COUNT(*)::bigint AS phone_reveals
  FROM public.analytics_events ae
  WHERE ae.event_name = 'phone_reveal'
    AND (ae.event_props ? 'listing_id' OR ae.props ? 'listing_id')
    AND COALESCE(
      (ae.event_props ->> 'listing_id'),
      (ae.props ->> 'listing_id')
    ) ~* '^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$'
  GROUP BY 1
),
rollup_map_pin_clicks AS (
  SELECT
    COALESCE(
      (ae.event_props ->> 'listing_id'),
      (ae.props ->> 'listing_id')
    )::uuid AS listing_id,
    COUNT(*)::bigint AS map_pin_clicks
  FROM public.analytics_events ae
  WHERE ae.event_name = 'map_pin_click'
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
  COALESCE(v.direct_views, 0)::bigint AS direct_views,
  COALESCE(pr.phone_reveals, 0)::bigint AS phone_reveals,
  COALESCE(mpc.map_pin_clicks, 0)::bigint AS map_pin_clicks
FROM public.listings l
LEFT JOIN rollup_impressions i ON i.listing_id = l.id
LEFT JOIN rollup_views v ON v.listing_id = l.id
LEFT JOIN rollup_phone_reveals pr ON pr.listing_id = l.id
LEFT JOIN rollup_map_pin_clicks mpc ON mpc.listing_id = l.id;

GRANT SELECT ON public.listing_metrics_v1 TO anon, authenticated;

COMMENT ON VIEW public.listing_metrics_v1 IS
'Aggregates impressions, direct views, phone reveals, and map pin clicks for each listing. Checks both props (old) and event_props (new) columns to ensure all historical data is captured. Handles both singular listing_id and array listing_ids formats for batch impression events.';
