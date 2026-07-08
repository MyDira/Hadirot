-- SMS cron repair (July 8 2026 audit, P0-1 / P0-2 / P3-9)
-- Paste into Supabase Dashboard > SQL Editor and run once.
-- Contains NO secrets: it reuses the Authorization header already stored in
-- the WORKING send-renewal-reminders cron job (jobid 13).
--
-- What it does:
--   Job 19 send-paid-listing-reminders : has failed every single day
--     ("unrecognized configuration parameter app.supabase_url") -> rewrite
--     with a hardcoded URL + auth like job 13, and move 10:00 UTC (6am ET)
--     to 14:00 UTC (10am EDT).
--   Job 17 send-weekly-performance-reports : command still contains the
--     literal [PROJECT-REF] placeholder from the Jan 2026 migration ->
--     rewrite with the real URL + auth. Schedule stays Thu 19:00 UTC.
--   Job 14 cleanup-expired-renewals : daily -> every 6 hours, so the
--     "we will deactivate in 24 hours" report-rented promise is at most
--     ~6h late instead of up to ~24h.

DO $$
DECLARE
  auth_header text;
BEGIN
  SELECT substring(command from 'Bearer [A-Za-z0-9._-]+')
    INTO auth_header
    FROM cron.job WHERE jobid = 13;

  IF auth_header IS NULL THEN
    RAISE EXCEPTION 'Could not extract auth header from cron job 13';
  END IF;

  PERFORM cron.alter_job(19, schedule := '0 14 * * *', command := format($fmt$
  select net.http_post(
      url:='https://pxlxdlrjmrkxyygdhvku.supabase.co/functions/v1/send-paid-listing-reminders',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','%s'),
      body:='{}'::jsonb,
      timeout_milliseconds:=30000
  ) as request_id;
$fmt$, auth_header));

  PERFORM cron.alter_job(17, command := format($fmt$
  select net.http_post(
      url:='https://pxlxdlrjmrkxyygdhvku.supabase.co/functions/v1/send-weekly-performance-reports',
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','%s'),
      body:='{}'::jsonb,
      timeout_milliseconds:=30000
  ) as request_id;
$fmt$, auth_header));

  PERFORM cron.alter_job(14, schedule := '0 */6 * * *');

  RAISE NOTICE 'SMS cron jobs 19, 17, 14 repaired.';
END $$;

-- Verify (run after): both commands should show the real project URL and the
-- new schedules (0 14 * * * for job 19, 0 */6 * * * for job 14).
SELECT jobid, jobname, schedule, active, left(command, 120) AS cmd
FROM cron.job WHERE jobid IN (13, 14, 17, 19) ORDER BY jobid;
