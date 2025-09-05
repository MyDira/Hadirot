/*
  # Fix Analytics Functions with Qualified References

  1. Drop and recreate analytics functions safely
  2. Use proper qualified references for all columns
  3. Implement TEXT key normalization for deduplication
  4. Use America/New_York timezone consistently
  5. Single SELECT statements with no RETURN QUERY

  ## Changes
  - Drop analytics_summary and analytics_kpis safely using DO blocks
  - Recreate with proper column qualification
  - Use e.ts timestamp column consistently
  - Implement TEXT key deduplication strategy
  - Maintain frontend compatibility
*/

-- 1) Drop & recreate summary (funnel) safely.
DO $$
BEGIN
  IF to_regprocedure('public.analytics_summary(integer)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION public.analytics_summary(integer)';
  END IF;
END$$;

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
    (date(timezone('America/New_York', now())) - make_interval(days => GREATEST(days_back, 0))) AS start_d,
    date(timezone('America/New_York', now())) AS end_d
),
events_in_range AS (
  SELECT
    e.id,
    e.event_name,
    -- canonical dedupe key in TEXT (no uuid/text mixing; attempt_id is in props)
    coalesce(
      (e.props->>'attempt_id')::text,
      (e.session_id)::text,
      (e.user_id)::text,
      (e.id)::text
    ) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  SELECT DISTINCT id, event_name, key_text FROM events_in_range
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

GRANT EXECUTE ON FUNCTION public.analytics_summary(integer) TO authenticated;


-- 2) Create KPIs RPC used by the top cards (one row, today in NY).
DO $$
BEGIN
  IF to_regprocedure('public.analytics_kpis(integer)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION public.analytics_kpis(integer)';
  END IF;
END$$;

CREATE FUNCTION public.analytics_kpis(days_back integer DEFAULT 0)
RETURNS TABLE (
  daily_active         integer,
  unique_visitors      integer,
  avg_session_minutes  numeric,
  listing_views        integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH bounds AS (
  SELECT
    (date(timezone('America/New_York', now())) - make_interval(days => GREATEST(days_back, 0))) AS start_d,
    date(timezone('America/New_York', now())) AS end_d
),
today AS (
  SELECT
    e.id,
    e.event_name,
    -- session-ish and visitor-ish keys as TEXT for robust uniqueness
    coalesce((e.session_id)::text, (e.props->>'attempt_id')::text, (e.user_id)::text, (e.id)::text) AS session_key,
    coalesce((e.user_id)::text,   (e.session_id)::text,           (e.props->>'attempt_id')::text, (e.id)::text) AS visitor_key,
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
    COUNT(DISTINCT visitor_key)                                          AS daily_active,
    COUNT(DISTINCT visitor_key)                                          AS unique_visitors,
    COALESCE(EXTRACT(EPOCH FROM AVG(dur)) / 60.0, 0)                     AS avg_session_minutes,
    COUNT(*) FILTER (WHERE event_name = 'listing_view')                  AS listing_views
  FROM today
)
SELECT
  daily_active::int,
  unique_visitors::int,
  avg_session_minutes::numeric,
  listing_views::int
FROM kpis;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_kpis(integer) TO authenticated;