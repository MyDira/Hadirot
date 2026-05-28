/*
  # Schedule send-paid-listing-reminders daily cron job

  Phase G of the residential-rental monetization plan.

  Schedules the new send-paid-listing-reminders edge function to fire daily at
  10:00 AM Eastern Time (matches the existing send-renewal-reminders cadence).
  The edge function itself handles Shabbat skip (Friday + Saturday in NY tz),
  so we just need a daily trigger.

  Pattern mirrors 20251020000001_setup_daily_email_cron.sql — uses pg_cron +
  pg_net and reads the project URL + service role key from Postgres settings.
  Those settings must be configured once on the Supabase project (see comment
  block at bottom for the setup commands).
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotency: drop any prior schedule with the same name.
DO $$
BEGIN
  PERFORM cron.unschedule('send-paid-listing-reminders');
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'send-paid-listing-reminders',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-paid-listing-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Set timezone to America/New_York so 10:00 means 10 AM ET (not UTC).
UPDATE cron.job
SET timezone = 'America/New_York'
WHERE jobname = 'send-paid-listing-reminders';

-- ---------------------------------------------------------------
-- One-time setup notes (NOT run by this migration):
--
-- 1) Ensure app.supabase_url and app.supabase_service_role_key are set in
--    Postgres settings. From Supabase Studio SQL editor, once per project:
--      ALTER DATABASE postgres SET app.supabase_url
--        = 'https://<project-ref>.supabase.co';
--      ALTER DATABASE postgres SET app.supabase_service_role_key
--        = 'eyJhbGc…';
--
-- 2) Edge function env vars (Supabase dashboard → Edge Functions → secrets):
--      TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
--      PUBLIC_SITE_URL (e.g. https://hadirot.com)
--      STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET
--      STRIPE_AGENT_PRICE_ID, STRIPE_VIP_PRICE_ID, STRIPE_ADDON_CONCIERGE_PRICE_ID
--
-- 3) Verify:
--      SELECT jobname, schedule, timezone FROM cron.job
--      WHERE jobname = 'send-paid-listing-reminders';
-- ---------------------------------------------------------------
