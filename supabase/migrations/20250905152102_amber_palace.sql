/*
  # Fix Analytics Summary Function Syntax and Types

  1. Issues Fixed
    - COALESCE type mismatch between uuid and text
    - SQL language function using RETURN QUERY (invalid syntax)
    - Ensure one-row return for dashboard compatibility

  2. Preserved Features
    - America/New_York timezone filtering for today-only data
    - DISTINCT pre-aggregation to avoid JOIN inflation
    - Function name: analytics_summary(days_back integer)
    - Standard dashboard return columns
    - Safe abandoned calculation (non-negative)

  3. Security
    - SECURITY DEFINER with proper search_path
    - Execute permissions for PostgREST roles
*/

-- Step 1: Safely drop existing function using DO block
DO $$
BEGIN
  IF to_regprocedure('public.analytics_summary(integer)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION public.analytics_summary(integer)';
  END IF;
END$$;

-- Step 2: Recreate with proper SQL syntax and type casting
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
    /* 🔒 normalize to TEXT to avoid uuid/text COALESCE errors */
    coalesce(
      (e.props->>'attempt_id')::text,
      (e.session_id)::text,
      (e.id)::text
    ) AS key_text,
    timezone('America/New_York', e.ts)::date AS d
  FROM public.analytics_events e
  JOIN bounds b
    ON timezone('America/New_York', e.ts)::date BETWEEN b.start_d AND b.end_d
),
dedup AS (
  /* De-dup by row + logical key BEFORE any joins */
  SELECT DISTINCT id, event_name, key_text
  FROM events_in_range
)
SELECT
  COUNT(*) FILTER (WHERE event_name = 'listing_post_start')::int   AS post_starts,
  COUNT(*) FILTER (WHERE event_name = 'listing_post_submit')::int  AS post_submits,
  COUNT(*) FILTER (WHERE event_name = 'listing_post_success')::int AS post_successes,
  GREATEST(
    (COUNT(*) FILTER (WHERE event_name = 'listing_post_start')
     - COUNT(DISTINCT key_text) FILTER (WHERE event_name = 'listing_post_success')
    ),
    0
  )::int AS post_abandoned
FROM dedup;
$$;

-- Step 3: Grant proper permissions
GRANT EXECUTE ON FUNCTION public.analytics_summary(integer) TO anon, authenticated, service_role;