-- Login-gate funnel analytics.
--
-- Aggregates the four login-gate events emitted from the listing-detail page
-- (shown / dismissed / auth_success / action_completed) into a single row
-- with breakdowns by action type and auth method. Rates (bounce, conversion)
-- are computed client-side from these raw counts.
--
-- Read access via SECURITY DEFINER, gated by require_admin() like the rest of
-- the analytics dashboard.

DROP FUNCTION IF EXISTS analytics_login_gate_funnel(integer, text);

CREATE OR REPLACE FUNCTION analytics_login_gate_funnel(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  shown_total bigint,
  shown_reveal_phone bigint,
  shown_send_callback bigint,
  dismissed_total bigint,
  dismissed_reveal_phone bigint,
  dismissed_send_callback bigint,
  auth_success_total bigint,
  auth_success_email_signin bigint,
  auth_success_email_signup bigint,
  auth_success_google bigint,
  action_completed_total bigint,
  action_completed_reveal_phone bigint,
  action_completed_send_callback bigint
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
      COALESCE(ae.event_props->>'action', ae.props->>'action') AS action,
      COALESCE(ae.event_props->>'method', ae.props->>'method') AS method
    FROM analytics_events ae
    WHERE ae.event_name IN (
        'login_gate_shown',
        'login_gate_dismissed',
        'login_gate_auth_success',
        'login_gate_action_completed'
      )
      AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
      AND COALESCE(ae.occurred_at, ae.ts) < end_ts
  )
  SELECT
    COUNT(*) FILTER (WHERE event_name = 'login_gate_shown')::bigint,
    COUNT(*) FILTER (WHERE event_name = 'login_gate_shown' AND action = 'reveal_phone')::bigint,
    COUNT(*) FILTER (WHERE event_name = 'login_gate_shown' AND action = 'send_callback')::bigint,
    COUNT(*) FILTER (WHERE event_name = 'login_gate_dismissed')::bigint,
    COUNT(*) FILTER (WHERE event_name = 'login_gate_dismissed' AND action = 'reveal_phone')::bigint,
    COUNT(*) FILTER (WHERE event_name = 'login_gate_dismissed' AND action = 'send_callback')::bigint,
    COUNT(*) FILTER (WHERE event_name = 'login_gate_auth_success')::bigint,
    COUNT(*) FILTER (WHERE event_name = 'login_gate_auth_success' AND method = 'email_signin')::bigint,
    COUNT(*) FILTER (WHERE event_name = 'login_gate_auth_success' AND method = 'email_signup')::bigint,
    COUNT(*) FILTER (WHERE event_name = 'login_gate_auth_success' AND method = 'google')::bigint,
    COUNT(*) FILTER (WHERE event_name = 'login_gate_action_completed')::bigint,
    COUNT(*) FILTER (WHERE event_name = 'login_gate_action_completed' AND action = 'reveal_phone')::bigint,
    COUNT(*) FILTER (WHERE event_name = 'login_gate_action_completed' AND action = 'send_callback')::bigint
  FROM events;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_login_gate_funnel(integer, text) TO authenticated;

COMMENT ON FUNCTION analytics_login_gate_funnel IS
'Aggregates login-gate funnel events into counts for the admin Inquiries dashboard';
