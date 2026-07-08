/*
  # [P2 / Track-1] Reschedule placeholder / hardcoded-JWT pg_cron jobs

  ## Finding (audit 01-database-rls.md)
  - "send-weekly-performance-reports" was scheduled (20260121191812) with literal
    placeholders `https://[PROJECT-REF].supabase.co/...` and
    `Bearer [SERVICE-ROLE-KEY]`, so every Thursday invocation failed and reports
    never sent. The SMS audit (2026-07-08, SMS_CRON_FIX.sql) fixed this LIVE by
    hand, but the committed migration still contained placeholders — a from-scratch
    rebuild would reintroduce the break. This migration captures the live fix.
  - "send-renewal-reminders" and "cleanup-expired-renewals" (20260113202436) were
    likewise committed with placeholders and, per the audit, hold hardcoded
    service-role JWTs live. Rescheduling them via current_setting() removes the
    hardcoded token AND the placeholders in one step.

  ## Fix
  Reschedule each job using the same `current_setting('app.supabase_url')` /
  `current_setting('app.supabase_service_role_key')` pattern already used by the
  working `send-paid-listing-reminders` job (20260527150600). Those two settings
  are configured once per project via:
    ALTER DATABASE postgres SET app.supabase_url = 'https://<ref>.supabase.co';
    ALTER DATABASE postgres SET app.supabase_service_role_key = 'eyJhbGc…';
  (Already set in prod — the paid-listing-reminders job relies on them.)

  Schedules are preserved exactly as originally defined (all in UTC, no timezone
  override, matching prior behavior):
    - send-weekly-performance-reports : '0 19 * * 4'  (Thu 19:00 UTC)
    - send-renewal-reminders          : '0 14 * * *'  (daily 14:00 UTC)
    - cleanup-expired-renewals        : '0 0 * * *'   (daily 00:00 UTC)

  ## Not touched here
  "cleanup-expired-drafts-daily" (audit notes an anon-JWT literal) has NO committed
  migration in this repo and its live schedule is unknown, so it is intentionally
  left for a separate, verified fix rather than guessing its cadence. Also, the
  service-role key exposed in the old job bodies should be ROTATED in the Supabase
  dashboard (Track 2 owns secret rotation).

  ## Reversal (spirit)
  Reschedule the jobs with their original literal placeholder bodies (not
  recommended — that is the broken/insecure state).

  ## Verification (manual)
  --   SELECT jobname, schedule, command FROM cron.job
  --   WHERE jobname IN ('send-weekly-performance-reports',
  --                     'send-renewal-reminders','cleanup-expired-renewals');
  -- Confirm each command references current_setting(...) and has no literal
  -- project ref, JWT, or [PLACEHOLDER].
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- send-weekly-performance-reports ---------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('send-weekly-performance-reports');
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'send-weekly-performance-reports',
  '0 19 * * 4',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-weekly-performance-reports',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- send-renewal-reminders ------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('send-renewal-reminders');
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'send-renewal-reminders',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-renewal-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- cleanup-expired-renewals ----------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-expired-renewals');
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-expired-renewals',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/cleanup-expired-renewals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
