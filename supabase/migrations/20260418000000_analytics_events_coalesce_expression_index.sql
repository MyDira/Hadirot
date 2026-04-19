-- Expression index so analytics queries with COALESCE(occurred_at, ts) in
-- their WHERE clauses can use an index instead of doing a seq scan every
-- time.
--
-- Every analytics_* RPC (session_quality, kpis, engagement_funnel,
-- listings_performance, etc.) filters on `COALESCE(ae.occurred_at, ae.ts)
-- >= start_ts`. With no index matching this expression the planner has
-- nothing to work with and seq-scans the whole analytics_events table
-- (~120k rows today, grows unbounded).
--
-- Postgres uses expression indexes when the query's WHERE clause contains
-- the same expression text, so we don't need to rewrite any function
-- bodies — this index works for all existing analytics RPCs immediately.
--
-- Not using CONCURRENTLY because migrations run inside a transaction, which
-- CONCURRENTLY forbids. At 120k rows the CREATE INDEX should complete in a
-- few seconds with a brief write lock — acceptable for this table which is
-- not in the user-facing hot path.

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_ts
  ON public.analytics_events (COALESCE(occurred_at, ts));

COMMENT ON INDEX public.idx_analytics_events_event_ts IS
  'Expression index on COALESCE(occurred_at, ts) used by all analytics_* RPCs. Lets range-filtered dashboard queries use an index instead of seq-scanning analytics_events.';
