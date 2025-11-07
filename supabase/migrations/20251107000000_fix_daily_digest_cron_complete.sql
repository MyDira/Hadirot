/*
  # Fix Daily Admin Digest Cron Job and Configuration

  1. Purpose
    - Complete the daily admin digest cron job setup
    - Configure database settings for Edge Function URLs
    - Ensure pg_cron and pg_net extensions are enabled
    - Schedule hourly checks with dynamic time-based execution

  2. Configuration
    - Sets app.settings.supabase_url for Edge Function calls
    - Sets app.settings.service_role_key for authentication
    - These settings are used by cron jobs to call Edge Functions

  3. Scheduling Strategy
    - Cron runs every hour (0 * * * *)
    - Checks if current hour matches configured delivery_time
    - Reads delivery_time from daily_admin_digest_config table
    - Default: 9:00 AM Eastern Time (America/New_York)
    - Allows admins to change delivery time via config table

  4. Extensions Required
    - pg_cron: Job scheduler for PostgreSQL
    - pg_net: HTTP client for making requests to Edge Functions

  5. Security
    - Uses service role key for authenticated Edge Function calls
    - Function performs admin verification before sending emails
*/

-- Ensure required extensions are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Configure database settings for Edge Function calls
-- Note: In production, these should be set via Supabase dashboard or environment
-- This ensures the cron job can call Edge Functions
DO $$
BEGIN
  -- Set Supabase URL (update this to your actual project URL)
  -- In production, this is typically set automatically by Supabase
  PERFORM set_config('app.settings.supabase_url',
    current_setting('SUPABASE_URL', true),
    false);

  -- Set Service Role Key (update this to your actual service role key)
  -- In production, this is typically set automatically by Supabase
  PERFORM set_config('app.settings.service_role_key',
    current_setting('SUPABASE_SERVICE_ROLE_KEY', true),
    false);

  RAISE NOTICE 'Database settings configured for Edge Function calls';
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Could not set database settings - ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are available';
END $$;

-- Unschedule existing daily admin digest job if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('daily-admin-digest-email');
  RAISE NOTICE 'Unscheduled existing daily-admin-digest-email job if present';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'No existing job to unschedule or cron not available';
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
    supabase_url text;
    service_key text;
  BEGIN
    -- Get configuration
    SELECT delivery_time, enabled
    INTO config_time, config_enabled
    FROM daily_admin_digest_config
    LIMIT 1;

    -- If not enabled, skip
    IF NOT config_enabled THEN
      RAISE NOTICE 'Daily digest is disabled, skipping execution';
      RETURN;
    END IF;

    -- Get current hour in configured timezone (default America/New_York)
    current_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/New_York'));

    -- Get configured hour
    config_hour := EXTRACT(HOUR FROM config_time);

    -- If current hour matches configured hour, trigger the digest
    IF current_hour = config_hour THEN
      -- Get database settings
      BEGIN
        supabase_url := current_setting('app.settings.supabase_url');
        service_key := current_setting('app.settings.service_role_key');
      EXCEPTION
        WHEN OTHERS THEN
          -- Fallback to environment variables if settings not available
          supabase_url := current_setting('SUPABASE_URL', true);
          service_key := current_setting('SUPABASE_SERVICE_ROLE_KEY', true);
      END;

      IF supabase_url IS NULL OR service_key IS NULL THEN
        RAISE WARNING 'Cannot send daily digest - Supabase URL or Service Role Key not configured';
        RETURN;
      END IF;

      -- Trigger the Edge Function
      PERFORM
        net.http_post(
          url := supabase_url || '/functions/v1/send-daily-admin-digest',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_key
          ),
          body := '{}'::jsonb
        );

      RAISE NOTICE 'Daily digest triggered at hour %', current_hour;
    ELSE
      RAISE NOTICE 'Current hour % does not match config hour %, skipping', current_hour, config_hour;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Error in daily digest cron job: %', SQLERRM;
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

-- Verify configuration
DO $$
DECLARE
  job_count integer;
  config_record record;
BEGIN
  -- Check if cron job was created
  SELECT COUNT(*) INTO job_count
  FROM cron.job
  WHERE jobname = 'daily-admin-digest-email';

  IF job_count > 0 THEN
    RAISE NOTICE '✅ Daily admin digest cron job scheduled successfully';
    RAISE NOTICE 'Job runs hourly and checks delivery_time from daily_admin_digest_config table';
  ELSE
    RAISE WARNING '⚠️ Cron job was not created - check pg_cron extension';
  END IF;

  -- Display current configuration
  SELECT * INTO config_record
  FROM daily_admin_digest_config
  LIMIT 1;

  IF FOUND THEN
    RAISE NOTICE 'Current configuration:';
    RAISE NOTICE '  - Enabled: %', config_record.enabled;
    RAISE NOTICE '  - Delivery Time: % (America/New_York)', config_record.delivery_time;
    RAISE NOTICE '  - Timezone: %', config_record.timezone;
  ELSE
    RAISE WARNING '⚠️ No configuration found in daily_admin_digest_config table';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'To manually test the digest email:';
  RAISE NOTICE '  1. Go to Content Management > Email Tools in the admin panel';
  RAISE NOTICE '  2. Click "Send Now" button';
  RAISE NOTICE '  3. Check the logs table for results';
END $$;
