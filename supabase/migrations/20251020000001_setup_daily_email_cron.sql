/*
  # Setup Daily Approved Listings Email Cron Job

  1. Purpose
    - Schedule automated daily email to all admins with newly approved listings
    - Runs every day at 7:00 AM Eastern Time (America/New_York timezone)
    - Invokes the send-daily-approved-listings edge function

  2. Implementation
    - Enable pg_cron extension if not already enabled
    - Create cron job to invoke edge function via HTTP POST
    - Schedule uses America/New_York timezone for 7 AM EST/EDT

  3. Notes
    - Cron job runs in UTC but converts to America/New_York timezone
    - Uses pg_net extension to make HTTP requests to edge function
    - Job runs daily, checking for listings approved in last 24 hours
*/

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule existing job if it exists (for migration idempotency)
DO $$
BEGIN
  PERFORM cron.unschedule('daily-approved-listings-email');
EXCEPTION
  WHEN undefined_table THEN
    -- pg_cron not installed yet, ignore
    NULL;
  WHEN undefined_function THEN
    -- cron.unschedule doesn't exist, ignore
    NULL;
END $$;

-- Schedule the daily approved listings email job
-- Runs at 7 AM Eastern Time (America/New_York) every day
-- This converts to the appropriate UTC time automatically
SELECT cron.schedule(
  'daily-approved-listings-email',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-daily-approved-listings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Update the job to use America/New_York timezone
UPDATE cron.job
SET timezone = 'America/New_York'
WHERE jobname = 'daily-approved-listings-email';

-- Add comment for documentation
COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL - used for daily approved listings email at 7 AM EST';
