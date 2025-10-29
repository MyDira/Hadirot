/*
  # Setup Daily Admin Digest Cron Job

  1. Purpose
    - Schedule daily admin digest email based on configurable time
    - Use pg_cron extension for scheduling
    - Call send-daily-admin-digest Edge Function
    - Check hourly and execute if current time matches configured delivery time

  2. Timing
    - Cron runs every hour (0 * * * *)
    - Checks if current hour matches configured delivery_time
    - Reads delivery_time from daily_admin_digest_config table
    - Default: 9:00 AM Eastern Time (America/New_York)

  3. Scheduling Strategy
    - Instead of hardcoding time, check config each hour
    - This allows adjustable delivery time via config table
    - Admins can change delivery time without migration
    - More flexible than fixed cron expression

  4. Notes
    - Requires pg_cron and pg_net extensions
    - Uses service role key for authentication
    - Function call is asynchronous via HTTP
    - Logs stored in daily_admin_digest_logs table
*/

-- Ensure required extensions are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule existing daily admin digest job if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('daily-admin-digest-email');
  RAISE NOTICE 'Unscheduled existing daily-admin-digest-email job if present';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'No existing job to unschedule';
END $$;

-- Schedule the daily admin digest email job
-- Runs every hour and checks if it's time to send based on config
SELECT cron.schedule(
  'daily-admin-digest-email',
  '0 * * * *', -- Run at top of every hour
  $$
  DO $$
  DECLARE
    config_time time;
    config_enabled boolean;
    current_hour integer;
    config_hour integer;
  BEGIN
    -- Get configuration
    SELECT delivery_time, enabled
    INTO config_time, config_enabled
    FROM daily_admin_digest_config
    LIMIT 1;

    -- If not enabled, skip
    IF NOT config_enabled THEN
      RETURN;
    END IF;

    -- Get current hour in configured timezone (default America/New_York)
    current_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/New_York'));

    -- Get configured hour
    config_hour := EXTRACT(HOUR FROM config_time);

    -- If current hour matches configured hour, trigger the digest
    IF current_hour = config_hour THEN
      PERFORM
        net.http_post(
          url := current_setting('app.settings.supabase_url') || '/functions/v1/send-daily-admin-digest',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
          ),
          body := '{}'::jsonb
        );
    END IF;
  END $$;
  $$
);

-- Set timezone for the cron job
UPDATE cron.job
SET timezone = 'America/New_York'
WHERE jobname = 'daily-admin-digest-email';

-- Add comment explaining the schedule
COMMENT ON EXTENSION pg_cron IS
  'Daily admin digest email checks hourly and sends based on configured delivery_time in daily_admin_digest_config table';

-- Add helpful note
DO $$
BEGIN
  RAISE NOTICE '✅ Daily admin digest cron job scheduled';
  RAISE NOTICE 'Runs hourly and checks delivery_time from daily_admin_digest_config table';
  RAISE NOTICE 'Default delivery time: 9:00 AM Eastern Time';
  RAISE NOTICE 'To change delivery time, update daily_admin_digest_config table';
END $$;
