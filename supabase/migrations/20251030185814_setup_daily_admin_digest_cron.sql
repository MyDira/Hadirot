/*
  # Setup Daily Admin Digest Cron Job

  1. Purpose
    - Schedule daily admin digest email based on configurable time
    - Use pg_cron extension for scheduling
    - Call send-daily-admin-digest Edge Function

  2. Notes
    - Requires pg_cron extension
    - Scheduled for 9 AM Eastern Time daily
    - Logs stored in daily_admin_digest_logs table
*/

-- Ensure required extensions are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule existing daily admin digest job if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('daily-admin-digest-email');
  RAISE NOTICE 'Unscheduled existing daily-admin-digest-email job if present';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'No existing job to unschedule';
END $$;