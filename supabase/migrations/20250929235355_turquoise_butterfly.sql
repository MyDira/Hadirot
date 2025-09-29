/*
  # Fix analytics function type mismatches

  1. Function Updates
    - Fix analytics_kpis function to return proper integer types
    - Fix analytics_summary function to return proper integer types
    - Add explicit type casting for COUNT() results

  2. Changes Made
    - Cast COUNT() results to integer to match function signatures
    - Ensure all numeric operations return expected types
*/

-- Fix analytics_kpis function type mismatch
CREATE OR REPLACE FUNCTION public.analytics_kpis(
  days_back integer DEFAULT 0,
  tz text DEFAULT 'America/New_York'
) RETURNS TABLE (
  daily_active integer,
  unique_visitors integer,
  avg_session_minutes numeric,
  listing_views integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d int := GREATEST(days_back, 0);
  start_local timestamptz;
  end_local   timestamptz;
  start_utc   timestamptz;
  end_utc     timestamptz;
BEGIN
  start_local := date_trunc('day', timezone(tz, now())) - make_interval(days => d);
  end_local   := start_local + interval '1 day';
  start_utc   := start_local AT TIME ZONE tz;
  end_utc     := end_local   AT TIME ZONE tz;

  RETURN QUERY
  WITH ev AS (
    SELECT * FROM public.analytics_events
    WHERE occurred_at >= start_utc AND occurred_at < end_utc
  ),
  ses AS (
    SELECT
      session_id,
      GREATEST(started_at, start_utc) AS s,
      LEAST(COALESCE(ended_at, last_seen_at), end_utc) AS e
    FROM public.analytics_sessions
    WHERE started_at < end_utc AND COALESCE(ended_at, last_seen_at) >= start_utc
  ),
  dur AS (
    SELECT GREATEST(0, EXTRACT(EPOCH FROM (e - s)) / 60.0) AS mins
    FROM ses
    WHERE e > s
  )
  SELECT
    COALESCE((SELECT COUNT(DISTINCT session_id)::integer FROM ev), 0),
    COALESCE((SELECT COUNT(DISTINCT anon_id)::integer FROM ev), 0),
    COALESCE((SELECT AVG(mins) FROM dur), 0)::numeric,
    COALESCE((SELECT COUNT(*)::integer FROM ev WHERE event_name='listing_view'), 0);
END;
$$;

-- Create analytics_summary function if it doesn't exist
CREATE OR REPLACE FUNCTION public.analytics_summary(
  days_back integer DEFAULT 0,
  tz text DEFAULT 'America/New_York'
) RETURNS TABLE (
  post_starts integer,
  post_submits integer,
  post_successes integer,
  post_abandoned integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d int := GREATEST(days_back, 0);
  start_local timestamptz;
  end_local   timestamptz;
  start_utc   timestamptz;
  end_utc     timestamptz;
BEGIN
  start_local := date_trunc('day', timezone(tz, now())) - make_interval(days => d);
  end_local   := start_local + interval '1 day';
  start_utc   := start_local AT TIME ZONE tz;
  end_utc     := end_local   AT TIME ZONE tz;

  RETURN QUERY
  WITH ev AS (
    SELECT * FROM public.analytics_events
    WHERE occurred_at >= start_utc AND occurred_at < end_utc
  )
  SELECT
    COALESCE((SELECT COUNT(*)::integer FROM ev WHERE event_name='post_started'), 0),
    COALESCE((SELECT COUNT(*)::integer FROM ev WHERE event_name='post_submitted'), 0),
    COALESCE((SELECT COUNT(*)::integer FROM ev WHERE event_name='post_success'), 0),
    COALESCE((SELECT COUNT(*)::integer FROM ev WHERE event_name='post_abandoned'), 0);
END;
$$;