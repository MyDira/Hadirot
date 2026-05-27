-- Post-listing wizard funnel analytics.
--
-- Returns one row per (path, step) combo with the count of users who
-- VIEWED that step and the count who COMPLETED it (clicked Continue).
-- Drop-off between step N and step N+1 is computed client-side as
-- completed[N] - viewed[N+1], which surfaces both abandonment after
-- pressing Continue (rare) and abandonment before pressing Continue
-- (common).
--
-- Read access via SECURITY DEFINER, gated by require_admin() like the
-- rest of the analytics dashboard.

DROP FUNCTION IF EXISTS analytics_wizard_funnel(integer, text);

CREATE OR REPLACE FUNCTION analytics_wizard_funnel(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  path text,
  step integer,
  viewed bigint,
  completed bigint
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
  WITH events AS (
    SELECT
      ae.event_name,
      COALESCE(ae.event_props->>'path', ae.props->>'path') AS path,
      COALESCE(
        (ae.event_props->>'step')::int,
        (ae.props->>'step')::int
      ) AS step,
      COALESCE(ae.event_props->>'attempt_id', ae.props->>'attempt_id') AS attempt_id
    FROM analytics_events ae
    WHERE ae.event_name IN ('wizard_step_viewed', 'wizard_step_completed')
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
  )
  -- Distinct (attempt_id, path, step) so re-fires within a single
  -- attempt (e.g. accidental remount) don't double-count.
  SELECT
    e.path,
    e.step,
    COUNT(DISTINCT e.attempt_id) FILTER (WHERE e.event_name = 'wizard_step_viewed')::bigint AS viewed,
    COUNT(DISTINCT e.attempt_id) FILTER (WHERE e.event_name = 'wizard_step_completed')::bigint AS completed
  FROM events e
  WHERE e.path IS NOT NULL
    AND e.step IS NOT NULL
  GROUP BY e.path, e.step
  ORDER BY e.path, e.step;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_wizard_funnel(integer, text) TO authenticated;

COMMENT ON FUNCTION analytics_wizard_funnel IS
'Aggregates wizard step viewed/completed events into per-step counts for the admin Inquiries dashboard';
