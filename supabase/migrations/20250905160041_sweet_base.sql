/*
  # Fix Analytics Functions with Qualified References

  1. Drop existing functions safely using DO blocks
  2. Recreate analytics_summary for posting funnel with proper deduplication
  3. Recreate analytics_kpis for top KPIs (DAU, visitors, session time, listing views)
  4. Use America/New_York timezone consistently
  5. Normalize keys to TEXT and deduplicate before aggregations
  6. Use e.ts as the timestamp column throughout
*/

-- 1) Drop safely using DO (no ALTER/RENAME anywhere)

DO $$
BEGIN
  IF to_regprocedure('public.analytics_summary(integer)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION public.analytics_summary(integer)';
  END IF;
END$$;

DO $$
BEGIN
  IF to_regprocedure('public.analytics_kpis(integer)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION public.analytics_kpis(integer)';
  END IF;
END$$;

-- 2) Recreate POSTING FUNNEL summary (one row, ints). Fixes doubles and abandoned logic.

CREATE FUNCTION public.analytics_summary(days_back integer DEFAULT 0)
RETURNS TABLE (
  post_starts     integer,
  post_submits    integer,
  post_successes  integer,
  post_abandoned  integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH bounds AS (
  SELECT
    (date(timezone('America/New_York', now()))
     - make_interval(days => GREATEST(days_back, 0))) AS start_d,
    date(timezone('America/New_York', now()))          AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    -- one canonical logical key for dedupe (TEXT only)
    coalesce((e.props->>'attempt_id')::text,
             (e.session_id)::text,
             (e.user_id)::text,
             (e.id)::text) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  -- dedupe by row + logical key BEFORE any joins/aggregations
  SELECT DISTINCT id, event_name, key_text
  FROM events_in_range
)
SELECT
  COUNT(*) FILTER (WHERE event_name = 'listing_post_start')::int    AS post_starts,
  COUNT(*) FILTER (WHERE event_name = 'listing_post_submit')::int   AS post_submits,
  COUNT(*) FILTER (WHERE event_name = 'listing_post_success')::int  AS post_successes,
  GREATEST(
    (COUNT(*) FILTER (WHERE event_name = 'listing_post_start')
     - COUNT(DISTINCT key_text) FILTER (WHERE event_name = 'listing_post_success')
    ), 0
  )::int                                                            AS post_abandoned
FROM dedup;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_summary(integer) TO anon, authenticated, service_role;

-- 3) Create KPIs (one row) used by the top cards: DAU, Unique Visitors, Avg Session (min), Listing Views.
--    If your UI expects slightly different column names, keep these names and map in the UI (or adjust here).

CREATE FUNCTION public.analytics_kpis(days_back integer DEFAULT 0)
RETURNS TABLE (
  daily_active         integer,  -- distinct active keys today
  unique_visitors      integer,  -- alias of daily_active or distinct user_id-based if you prefer
  avg_session_minutes  numeric,  -- average per-session duration in minutes (0 if none)
  listing_views        integer   -- total listing_view events today
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH bounds AS (
  SELECT
    (date(timezone('America/New_York', now()))
     - make_interval(days => GREATEST(days_back, 0))) AS start_d,
    date(timezone('America/New_York', now()))          AS end_d
),
today AS (
  SELECT
    e.id,
    e.event_name,
    coalesce((e.session_id)::text,
             (e.props->>'attempt_id')::text,
             (e.user_id)::text,
             (e.id)::text) AS session_key,           -- session-ish key
    coalesce((e.user_id)::text,
             (e.session_id)::text,
             (e.props->>'attempt_id')::text,
             (e.id)::text) AS visitor_key,           -- visitor-ish key (covers anon)
    timezone('America/New_York', e.ts) AS ts_ny
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
per_session AS (
  SELECT session_key, (max(ts_ny) - min(ts_ny)) AS dur
  FROM today
  GROUP BY session_key
),
kpis AS (
  SELECT
    COUNT(DISTINCT visitor_key)                                                 AS daily_active,
    COUNT(DISTINCT visitor_key)                                                 AS unique_visitors,
    COALESCE( (EXTRACT(EPOCH FROM AVG(dur)) / 60.0), 0 )                        AS avg_session_minutes,
    COUNT(*) FILTER (WHERE event_name = 'listing_view')                          AS listing_views
  FROM today
  CROSS JOIN per_session
)
SELECT
  daily_active::int,
  unique_visitors::int,
  avg_session_minutes::numeric,
  listing_views::int
FROM kpis;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_kpis(integer) TO anon, authenticated, service_role;

-- Sanity check (non-blocking, at end of migration)
SELECT * FROM public.analytics_summary(0);
SELECT * FROM public.analytics_kpis(0);