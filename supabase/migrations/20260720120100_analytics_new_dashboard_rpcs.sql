/*
  # New analytics dashboard RPCs
  (ANALYTICS_AUDIT_2026-07-20 H1/H2/H4 — surface the newly unified events)

  - analytics_traffic_sources: where sessions come from (UTM > referrer >
    direct), from session_start attribution props added 2026-07-20.
  - analytics_engagement_extras: totals for the intent events previously
    visible only in GA4 (favorites, shares, searches, image zooms, clicks,
    contact events).
  - analytics_longterm_trends: reads daily_analytics (permanent) so trends
    survive the 90-day raw-event retention.
  - analytics_listing_engagement: per-listing intent stats for the
    drilldown panel.

  All follow the existing pattern: SECURITY DEFINER + require_admin(),
  execute revoked from anon/PUBLIC.
*/

-- ============================================================
-- 1) Traffic sources
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_traffic_sources(days_back integer DEFAULT 14, tz text DEFAULT 'America/New_York')
RETURNS TABLE(source text, sessions integer, pct numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();

  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);

  RETURN QUERY
  WITH starts AS (
    SELECT
      NULLIF(ae.event_props->>'utm_source', '') AS utm_source,
      NULLIF(ae.event_props->>'referrer', '') AS referrer
    FROM analytics_events ae
    WHERE ae.event_name = 'session_start'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
  ),
  classified AS (
    SELECT CASE
      WHEN s.utm_source IS NOT NULL THEN lower(s.utm_source)
      WHEN s.referrer IS NULL THEN 'direct'
      WHEN s.referrer ILIKE '%google.%' THEN 'google'
      WHEN s.referrer ILIKE '%bing.%' THEN 'bing'
      WHEN s.referrer ILIKE '%duckduckgo.%' THEN 'duckduckgo'
      WHEN s.referrer ILIKE '%facebook.%' OR s.referrer ILIKE '%fb.me%' THEN 'facebook'
      WHEN s.referrer ILIKE '%instagram.%' THEN 'instagram'
      WHEN s.referrer ILIKE '%whatsapp%' OR s.referrer ILIKE '%wa.me%' THEN 'whatsapp'
      WHEN s.referrer ILIKE '%t.co/%' OR s.referrer ILIKE '%twitter.%' OR s.referrer ILIKE '%x.com%' THEN 'x'
      ELSE regexp_replace(regexp_replace(s.referrer, '^https?://(www\.)?', ''), '[/:].*$', '')
    END AS src
    FROM starts s
  )
  SELECT
    c.src,
    COUNT(*)::integer,
    ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100, 1)
  FROM classified c
  GROUP BY c.src
  ORDER BY COUNT(*) DESC
  LIMIT 15;
END $$;

-- ============================================================
-- 2) Engagement extras (previously GA4-only intent events)
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_engagement_extras(days_back integer DEFAULT 14, tz text DEFAULT 'America/New_York')
RETURNS TABLE(metric text, total integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();

  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);

  RETURN QUERY
  WITH counts AS (
    SELECT ae.event_name, COUNT(*)::integer AS n
    FROM analytics_events ae
    WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND ae.event_name IN (
        'listing_favorite', 'listing_unfavorite', 'listing_share',
        'search_query', 'listing_image_zoom', 'listing_click',
        'contact_click', 'contact_submitted', 'listing_reported_rented')
    GROUP BY ae.event_name
  )
  SELECT m.metric, COALESCE(c.n, 0)
  FROM (VALUES
    ('favorites', 'listing_favorite'),
    ('unfavorites', 'listing_unfavorite'),
    ('shares', 'listing_share'),
    ('searches', 'search_query'),
    ('image_zooms', 'listing_image_zoom'),
    ('listing_clicks', 'listing_click'),
    ('contact_clicks', 'contact_click'),
    ('contact_submissions', 'contact_submitted'),
    ('reported_rented', 'listing_reported_rented')
  ) AS m(metric, event_name)
  LEFT JOIN counts c ON c.event_name = m.event_name;
END $$;

-- ============================================================
-- 3) Long-term trends from permanent daily aggregates
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_longterm_trends(days_back integer DEFAULT 180)
RETURNS TABLE(
  day date,
  visitors integer,
  sessions_count integer,
  listing_views integer,
  inquiries integer,
  post_success integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM require_admin();

  RETURN QUERY
  SELECT
    da.date,
    da.visitors,
    da.sessions_count,
    da.listing_views,
    (COALESCE(da.phone_reveals, 0) + COALESCE(da.contact_submissions, 0))::integer,
    da.post_success
  FROM daily_analytics da
  WHERE da.date >= (CURRENT_DATE - days_back)
  ORDER BY da.date;
END $$;

-- ============================================================
-- 4) Per-listing engagement for the drilldown
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_listing_engagement(p_listing_id uuid, days_back integer DEFAULT 30, tz text DEFAULT 'America/New_York')
RETURNS TABLE(
  favorites integer,
  shares integer,
  image_zooms integer,
  listing_clicks integer,
  contact_clicks integer,
  contact_submissions integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();

  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::integer FROM analytics_events ae
      WHERE ae.event_name = 'listing_favorite'
        AND ae.event_props->>'listing_id' = p_listing_id::text
        AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts),
    (SELECT COUNT(*)::integer FROM analytics_events ae
      WHERE ae.event_name = 'listing_share'
        AND ae.event_props->>'listing_id' = p_listing_id::text
        AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts),
    (SELECT COUNT(*)::integer FROM analytics_events ae
      WHERE ae.event_name = 'listing_image_zoom'
        AND ae.event_props->>'listing_id' = p_listing_id::text
        AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts),
    (SELECT COUNT(*)::integer FROM analytics_events ae
      WHERE ae.event_name = 'listing_click'
        AND ae.event_props->>'listing_id' = p_listing_id::text
        AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts),
    (SELECT COUNT(*)::integer FROM analytics_events ae
      WHERE ae.event_name = 'contact_click'
        AND ae.event_props->>'listing_id' = p_listing_id::text
        AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts),
    (SELECT COUNT(*)::integer FROM listing_contact_submissions lcs
      WHERE (lcs.listing_id = p_listing_id OR lcs.commercial_listing_id = p_listing_id)
        AND lcs.created_at >= start_ts AND lcs.created_at < end_ts);
END $$;

-- ============================================================
-- Grants: match existing analytics_* pattern
-- ============================================================
REVOKE ALL ON FUNCTION analytics_traffic_sources(integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION analytics_engagement_extras(integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION analytics_longterm_trends(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION analytics_listing_engagement(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION analytics_traffic_sources(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_engagement_extras(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_longterm_trends(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION analytics_listing_engagement(uuid, integer, text) TO authenticated;
