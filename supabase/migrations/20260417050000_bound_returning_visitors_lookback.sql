/*
  # Bound the returning_visitors CTE lookback window (PR H1-analytics)

  ## Purpose
  analytics_session_quality runs on every dashboard load. The returning_visitors
  CTE scans every analytics_events row older than the current window — i.e.,
  all historical events back to the dawn of the table. As the table grows this
  becomes a full-table scan on every call.

  ## Fix
  Add a 90-day lower bound to the CTE. A user is "returning" if they had
  activity within 90 days before the current window — which is the usable
  definition for observability. Anything older is stale and would distort
  the metric anyway.

  ## What doesn't change
  - Function signature (same args, same return columns)
  - Permission model (still require_admin, still SECURITY DEFINER)
  - Session / page-count / bounce logic — only the returning_visitors CTE
*/

CREATE OR REPLACE FUNCTION analytics_session_quality(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  pages_per_session numeric,
  bounce_rate numeric,
  avg_duration_minutes numeric,
  total_sessions integer,
  unique_visitors integer,
  returning_visitor_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
  lookback_start_ts timestamptz;
BEGIN
  PERFORM require_admin();

  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  lookback_start_ts := start_ts - interval '90 days';

  RETURN QUERY
  WITH sessions AS (
    SELECT
      ae.session_id,
      ae.anon_id,
      COUNT(*) AS page_count,
      MIN(COALESCE(ae.occurred_at, ae.ts)) AS session_start,
      MAX(COALESCE(ae.occurred_at, ae.ts)) AS session_end
    FROM analytics_events ae
    WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    GROUP BY ae.session_id, ae.anon_id
  ),
  session_metrics AS (
    SELECT
      s.session_id,
      s.anon_id,
      s.page_count,
      EXTRACT(EPOCH FROM (s.session_end - s.session_start)) / 60.0 AS duration_minutes,
      CASE WHEN s.page_count = 1 THEN 1 ELSE 0 END AS is_bounce
    FROM sessions s
  ),
  returning_visitors AS (
    SELECT DISTINCT ae.anon_id
    FROM analytics_events ae
    WHERE COALESCE(ae.occurred_at, ae.ts) < start_ts
      AND COALESCE(ae.occurred_at, ae.ts) >= lookback_start_ts
  )
  SELECT
    COALESCE(ROUND(AVG(sm.page_count), 1), 0)::numeric,
    COALESCE(ROUND(AVG(sm.is_bounce) * 100, 1), 0)::numeric,
    COALESCE(ROUND(AVG(sm.duration_minutes), 1), 0)::numeric,
    COUNT(DISTINCT sm.session_id)::integer,
    COUNT(DISTINCT sm.anon_id)::integer,
    COALESCE(
      ROUND(
        COUNT(DISTINCT CASE WHEN rv.anon_id IS NOT NULL THEN sm.anon_id END)::numeric /
        NULLIF(COUNT(DISTINCT sm.anon_id), 0) * 100,
        1
      ),
      0
    )::numeric
  FROM session_metrics sm
  LEFT JOIN returning_visitors rv ON sm.anon_id = rv.anon_id;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_session_quality(integer, text) TO authenticated;
