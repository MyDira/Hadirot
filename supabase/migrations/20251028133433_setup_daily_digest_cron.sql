/*
  # Setup Daily Digest Cron Job

  1. Purpose
    - Schedule daily digest email to run at 5:00 PM EST/EDT
    - Use pg_cron extension for scheduling
    - Call send-daily-digest Edge Function

  2. Timing
    - Run daily at 5:00 PM Eastern Time (EST/EDT)
    - Cron expression: '0 17 * * *' in America/New_York timezone
    - Or '0 21 * * *' in UTC (5 PM EST = 10 PM UTC during winter)
    - Or '0 22 * * *' in UTC (5 PM EDT = 10 PM UTC during summer)

  3. Notes
    - Using UTC 22:00 to handle EDT (most of the year)
    - Edge Function will be invoked via HTTP call
    - Requires SUPABASE_SERVICE_ROLE_KEY for authentication
*/

-- Ensure pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule existing job if it exists (for re-running migration)
DO $$
BEGIN
  PERFORM cron.unschedule('daily-digest-email');
  RAISE NOTICE 'Unscheduled existing daily-digest-email job if present';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'No existing job to unschedule';
END $$;

-- Schedule the daily digest email job
-- Runs at 10 PM UTC (5 PM EST/EDT depending on season)
SELECT cron.schedule(
  'daily-digest-email',
  '0 22 * * *', -- 10 PM UTC = 5 PM EST (or 6 PM during EDT transition)
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/send-daily-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Add comment explaining the schedule
COMMENT ON EXTENSION pg_cron IS
  'Daily digest email scheduled for 10 PM UTC (5 PM EST/6 PM EDT)';

-- Note: For production, you may want to adjust the time based on your timezone
-- To change the schedule, run:
-- SELECT cron.unschedule('daily-digest-email');
-- Then schedule again with desired time
