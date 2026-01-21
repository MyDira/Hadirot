/*
  # Schedule Weekly Performance Reports via SMS

  ## Overview
  Schedules a weekly SMS performance report that sends listing metrics to listing owners
  every Thursday at 2 PM EST (19:00 UTC).

  ## What it does
  - Runs every Thursday at 2 PM EST / 19:00 UTC
  - Aggregates metrics for the past 7 days per listing owner:
    * Impressions (from listing_impression_batch events)
    * Clicks (from listing_view events)
    * Phone reveals (from phone_click events)
    * Callback requests (from listing_contact_submissions)
  - Filters out contacts with < 10 total impressions
  - Sends SMS via Twilio with dynamic message formatting
  - Skips zero-value metrics in the message

  ## Cron Schedule
  - Job name: send-weekly-performance-reports
  - Schedule: '0 19 * * 4' (Thursday at 19:00 UTC = 2 PM EST)
  - Function: /functions/v1/send-weekly-performance-reports

  ## Message Format Example
  Hadirot Update:
  This week your 3 listings got on average
  89.5 impressions each
  14.2 clicks each
  8 leads total (1 callbacks, 7 requests for your phone number)

  ## Prerequisites
  - Twilio credentials configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)
  - Edge function deployed: send-weekly-performance-reports
  - analytics_events table with event tracking
  - listing_contact_submissions table
*/

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule existing job if it exists (for safe re-runs)
DO $$
BEGIN
  PERFORM cron.unschedule('send-weekly-performance-reports');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Schedule the weekly performance reports job
-- Runs every Thursday at 19:00 UTC (2 PM EST)
SELECT cron.schedule(
  'send-weekly-performance-reports',
  '0 19 * * 4',
  $$
  SELECT net.http_post(
    url:='https://[PROJECT-REF].supabase.co/functions/v1/send-weekly-performance-reports',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE-ROLE-KEY]"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Verification and setup instructions
DO $$
DECLARE
  job_count integer;
BEGIN
  SELECT COUNT(*) INTO job_count
  FROM cron.job
  WHERE jobname = 'send-weekly-performance-reports';

  IF job_count = 1 THEN
    RAISE NOTICE 'Weekly Performance Reports cron job scheduled successfully';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Job: send-weekly-performance-reports';
    RAISE NOTICE '📅 Schedule: Every Thursday at 2 PM EST (19:00 UTC)';
    RAISE NOTICE '📊 Metrics: Impressions, Clicks, Phone Reveals, Callbacks';
    RAISE NOTICE '🎯 Filter: Minimum 10 impressions per contact';
    RAISE NOTICE '';
  ELSE
    RAISE WARNING 'Expected 1 cron job, found %', job_count;
  END IF;

  RAISE NOTICE '⚙️  CONFIGURATION REQUIRED:';
  RAISE NOTICE '  1. Go to Supabase Dashboard > Database > Extensions > pg_cron';
  RAISE NOTICE '  2. Find job: send-weekly-performance-reports';
  RAISE NOTICE '  3. Replace [PROJECT-REF] with your project reference';
  RAISE NOTICE '  4. Replace [SERVICE-ROLE-KEY] with your service role key';
  RAISE NOTICE '';
  RAISE NOTICE '📝 To test manually, run:';
  RAISE NOTICE '  curl -X POST https://[PROJECT-REF].supabase.co/functions/v1/send-weekly-performance-reports \';
  RAISE NOTICE '    -H "Authorization: Bearer [SERVICE-ROLE-KEY]"';
  RAISE NOTICE '';
  RAISE NOTICE '🔍 To view scheduled jobs:';
  RAISE NOTICE '  SELECT * FROM cron.job WHERE jobname = ''send-weekly-performance-reports'';';
  RAISE NOTICE '';
  RAISE NOTICE '📊 To view job execution history:';
  RAISE NOTICE '  SELECT * FROM cron.job_run_details WHERE jobname = ''send-weekly-performance-reports'' ORDER BY start_time DESC LIMIT 10;';
END $$;
