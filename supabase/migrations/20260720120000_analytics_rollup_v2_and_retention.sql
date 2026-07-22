/*
  # Analytics rollup v2 + retention hardening
  (ANALYTICS_AUDIT_2026-07-20 H4/H6 + prod verification findings)

  Prod-verified problems this fixes:
  - rollup_analytics_events() read the legacy `props` column (empty since the
    Nov 2025 column consolidation) and matched wrong event names
    ('post_start' vs the real 'post_started'), so daily_analytics post
    funnel = 0, top-listings mostly empty, and `returners` was literally
    the same expression as `dau`.
  - analytics_sessions had no retention (50k rows back to Sept 2025) and
    84% of rows never get ended_at (session_end rarely reaches the server).
  - analytics_events carried 4 duplicate/unused indexes (~30 MB of the
    66 MB index footprint, pg_stat idx_scan 0 or duplicate-of-kept-index).

  Legacy columns (ts/page/referrer/user_agent/ip/props) are deliberately
  KEPT: they are all-NULL/empty so they cost nothing, and 16 deployed
  SECURITY DEFINER functions have source that may alias `props`. Dropping
  indexes is safe (worst case a slower query); dropping columns is not.

  Adds per-day metrics needed for long-term trends (impressions, phone
  events, contact submissions, favorites, shares, searches, clicks) and
  backfills the last 90 days from raw events.
*/

-- ============================================================
-- 1) daily_analytics: new metric columns (existing rows keep 0)
-- ============================================================
ALTER TABLE daily_analytics
  ADD COLUMN IF NOT EXISTS sessions_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impressions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phone_reveals integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phone_dials integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contact_submissions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorites integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS searches integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS map_pin_clicks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS listing_clicks integer NOT NULL DEFAULT 0;

COMMENT ON TABLE daily_analytics IS
  'Permanent per-day aggregates rolled up from analytics_events before raw retention deletes them. dau = distinct logged-in users, visitors = distinct anon devices, sessions_count = distinct sessions. Rebuilt by rollup_analytics_for_date().';

-- ============================================================
-- 2) Per-date rollup helper (idempotent per day) + daily wrapper
-- ============================================================
CREATE OR REPLACE FUNCTION rollup_analytics_for_date(target_date date, tz text DEFAULT 'America/New_York')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
  session_avg numeric;
BEGIN
  -- Day boundaries in local (NY) time, matching the dashboard RPCs
  start_ts := timezone(tz, target_date::timestamp);
  end_ts := timezone(tz, (target_date + 1)::timestamp);

  DELETE FROM daily_analytics WHERE date = target_date;
  DELETE FROM daily_top_listings WHERE date = target_date;
  DELETE FROM daily_top_filters WHERE date = target_date;

  -- Session duration via bounded gaps (caps idle gaps at 30 min)
  WITH session_events AS (
    SELECT session_id,
           COALESCE(occurred_at, ts) AS ev_ts,
           LAG(COALESCE(occurred_at, ts)) OVER (PARTITION BY session_id ORDER BY COALESCE(occurred_at, ts)) AS prev_ts
    FROM analytics_events
    WHERE COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts
  ),
  session_durations AS (
    SELECT session_id,
           SUM(CASE WHEN prev_ts IS NULL THEN 0
                    ELSE LEAST(EXTRACT(EPOCH FROM (ev_ts - prev_ts)) / 60.0, 30.0) END) AS total_minutes
    FROM session_events
    GROUP BY session_id
  )
  SELECT COALESCE(AVG(total_minutes), 0) INTO session_avg FROM session_durations;

  INSERT INTO daily_analytics (
    date, dau, visitors, returners, avg_session_minutes,
    listing_views, post_starts, post_submits, post_success, post_abandoned,
    sessions_count, impressions, phone_reveals, phone_dials, contact_submissions,
    favorites, shares, searches, map_pin_clicks, listing_clicks
  )
  SELECT
    target_date,
    COUNT(DISTINCT ae.user_id) FILTER (WHERE ae.user_id IS NOT NULL),
    COUNT(DISTINCT ae.anon_id),
    (SELECT COUNT(*) FROM (
        SELECT DISTINCT cur.anon_id
        FROM analytics_events cur
        WHERE COALESCE(cur.occurred_at, cur.ts) >= start_ts
          AND COALESCE(cur.occurred_at, cur.ts) < end_ts
      ) day_anons
      WHERE day_anons.anon_id IN (
        SELECT prior.anon_id FROM analytics_events prior
        WHERE COALESCE(prior.occurred_at, prior.ts) < start_ts
          AND COALESCE(prior.occurred_at, prior.ts) >= start_ts - interval '90 days')),
    ROUND(session_avg, 2),
    COUNT(*) FILTER (WHERE ae.event_name = 'listing_view'),
    COUNT(*) FILTER (WHERE ae.event_name = 'post_started'),
    COUNT(*) FILTER (WHERE ae.event_name = 'post_submitted'),
    COUNT(*) FILTER (WHERE ae.event_name = 'post_success'),
    COUNT(*) FILTER (WHERE ae.event_name = 'post_abandoned'),
    COUNT(DISTINCT ae.session_id),
    COALESCE(SUM(CASE WHEN ae.event_name = 'listing_impression_batch'
      THEN COALESCE(
        CASE WHEN jsonb_typeof(ae.event_props->'listing_ids') = 'array'
             THEN jsonb_array_length(ae.event_props->'listing_ids') END,
        CASE WHEN jsonb_typeof(ae.event_props->'ids') = 'array'
             THEN jsonb_array_length(ae.event_props->'ids') END,
        0)
      ELSE 0 END), 0)::integer,
    COUNT(*) FILTER (WHERE ae.event_name = 'phone_reveal'),
    COUNT(*) FILTER (WHERE ae.event_name = 'phone_dial'),
    (SELECT COUNT(*) FROM listing_contact_submissions lcs
      WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts),
    COUNT(*) FILTER (WHERE ae.event_name = 'listing_favorite'),
    COUNT(*) FILTER (WHERE ae.event_name = 'listing_share'),
    COUNT(*) FILTER (WHERE ae.event_name = 'search_query'),
    COUNT(*) FILTER (WHERE ae.event_name = 'map_pin_click'),
    COUNT(*) FILTER (WHERE ae.event_name = 'listing_click')
  FROM analytics_events ae
  WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts
    AND COALESCE(ae.occurred_at, ae.ts) < end_ts;

  -- Top listings for the day (views + impressions from event_props)
  WITH listing_views AS (
    SELECT (event_props->>'listing_id')::uuid AS listing_id, COUNT(*) AS views
    FROM analytics_events
    WHERE event_name = 'listing_view'
      AND COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts
      AND event_props->>'listing_id' ~ '^[0-9a-f-]{36}$'
    GROUP BY 1
  ),
  listing_impressions AS (
    SELECT expanded.listing_id::uuid AS listing_id, COUNT(*) AS impressions
    FROM analytics_events ae,
         LATERAL jsonb_array_elements_text(
           COALESCE(
             CASE WHEN jsonb_typeof(ae.event_props->'listing_ids') = 'array'
                  THEN ae.event_props->'listing_ids' END,
             CASE WHEN jsonb_typeof(ae.event_props->'ids') = 'array'
                  THEN ae.event_props->'ids' END,
             '[]'::jsonb)
         ) AS expanded(listing_id)
    WHERE ae.event_name = 'listing_impression_batch'
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts
      AND expanded.listing_id ~ '^[0-9a-f-]{36}$'
    GROUP BY 1
  ),
  combined AS (
    SELECT COALESCE(v.listing_id, i.listing_id) AS listing_id,
           COALESCE(v.views, 0) AS views,
           COALESCE(i.impressions, 0) AS impressions,
           CASE WHEN COALESCE(i.impressions, 0) > 0
                THEN ROUND((COALESCE(v.views, 0)::numeric / i.impressions) * 100, 2)
                ELSE 0 END AS ctr
    FROM listing_views v FULL OUTER JOIN listing_impressions i USING (listing_id)
  )
  INSERT INTO daily_top_listings (date, listing_id, views, impressions, ctr, rank)
  SELECT target_date, listing_id, views, impressions, ctr,
         ROW_NUMBER() OVER (ORDER BY views DESC, impressions DESC)
  FROM combined
  ORDER BY views DESC, impressions DESC
  LIMIT 50;

  -- Top filters for the day
  WITH filter_usage AS (
    SELECT key AS filter_key, val AS filter_value, COUNT(*) AS uses
    FROM (
      SELECT jsonb_object_keys(event_props->'filters') AS key,
             (event_props->'filters'->>jsonb_object_keys(event_props->'filters')) AS val
      FROM analytics_events
      WHERE event_name = 'filter_apply'
        AND COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts
        AND jsonb_typeof(event_props->'filters') = 'object'
    ) expanded
    WHERE val IS NOT NULL
    GROUP BY 1, 2
  )
  INSERT INTO daily_top_filters (date, filter_key, filter_value, uses, rank)
  SELECT target_date, filter_key, filter_value, uses,
         ROW_NUMBER() OVER (ORDER BY uses DESC)
  FROM filter_usage
  ORDER BY uses DESC
  LIMIT 50;
END $$;

CREATE OR REPLACE FUNCTION rollup_analytics_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Yesterday in NY time (dashboard timezone), not UTC
  PERFORM rollup_analytics_for_date(
    (timezone('America/New_York', now()))::date - 1
  );
END $$;

REVOKE ALL ON FUNCTION rollup_analytics_for_date(date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rollup_analytics_events() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3) Retention v2: events + sessions
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_analytics_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_high_volume integer;
  deleted_others integer;
  deleted_sessions integer;
  closed_sessions integer;
BEGIN
  -- High-volume/low-value events: 30 days (by insert time; immune to
  -- client clock skew in occurred_at)
  DELETE FROM analytics_events
  WHERE event_name IN ('listing_impression_batch', 'listing_scroll', 'listing_click')
    AND ts < now() - interval '30 days';
  GET DIAGNOSTICS deleted_high_volume = ROW_COUNT;

  -- Everything else: 90 days (daily_analytics keeps the aggregates forever)
  DELETE FROM analytics_events
  WHERE event_name NOT IN ('listing_impression_batch', 'listing_scroll', 'listing_click')
    AND ts < now() - interval '90 days';
  GET DIAGNOSTICS deleted_others = ROW_COUNT;

  -- Close sessions idle > 1 hour (session_end rarely reaches the server)
  UPDATE analytics_sessions
  SET ended_at = last_seen_at,
      duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (last_seen_at - started_at)))::integer
  WHERE ended_at IS NULL
    AND last_seen_at < now() - interval '1 hour';
  GET DIAGNOSTICS closed_sessions = ROW_COUNT;

  -- Sessions past the raw-event horizon have nothing to join to: purge
  DELETE FROM analytics_sessions
  WHERE last_seen_at < now() - interval '180 days';
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;

  RAISE NOTICE 'Cleanup: % high-volume events, % other events, % sessions closed, % sessions purged',
    deleted_high_volume, deleted_others, closed_sessions, deleted_sessions;
END $$;

REVOKE ALL ON FUNCTION cleanup_analytics_events() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 4) Drop duplicate/unused indexes on analytics_events
--    (ae_on_occurred_at duplicates analytics_events_occurred_at_idx;
--     ae_on_event_name duplicates analytics_events_event_name_occurred_at_idx;
--     anon_id and event_props GIN have zero scans and no query shape
--     that can use them)
-- ============================================================
DROP INDEX IF EXISTS ae_on_occurred_at;
DROP INDEX IF EXISTS ae_on_event_name;
DROP INDEX IF EXISTS analytics_events_anon_id_idx;
DROP INDEX IF EXISTS analytics_events_event_props_gin_idx;

-- Deprecation markers on the legacy write-path columns (kept — see header)
COMMENT ON COLUMN analytics_events.props IS 'DEPRECATED: legacy column, always {}. Use event_props.';
COMMENT ON COLUMN analytics_events.ts IS 'Insert timestamp (server clock). Event time is occurred_at; retention uses ts.';

-- ============================================================
-- 5) Backfill: rebuild the last 90 days of daily aggregates from
--    raw events (previous rollup output was wrong — see header)
-- ============================================================
DO $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT generate_series(
      (timezone('America/New_York', now()))::date - 90,
      (timezone('America/New_York', now()))::date - 1,
      interval '1 day'
    )::date
  LOOP
    PERFORM rollup_analytics_for_date(d);
  END LOOP;
END $$;
