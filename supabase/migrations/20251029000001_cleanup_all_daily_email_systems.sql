/*
  # Complete Cleanup of All Daily Email Digest Systems

  1. Purpose
    - Remove all previous daily email digest implementations
    - Clean up daily_cards system (first implementation)
    - Clean up daily_digest system (second implementation)
    - Remove send-daily-approved-listings infrastructure
    - Drop all related tables, indexes, policies, cron jobs, and storage buckets

  2. Tables Being Removed
    - daily_cards_config
    - daily_cards_logs
    - daily_digest_sent_listings
    - daily_digest_logs

  3. Columns Being Removed
    - listings.approval_email_sent_at (deprecated tracking column)

  4. Cron Jobs Being Removed
    - daily-approved-listings-email
    - daily-digest-email
    - Any other daily email related cron jobs

  5. Storage
    - daily-listing-cards bucket and all policies

  6. Notes
    - This is a complete cleanup before implementing new simple system
    - All manual email functionality remains unaffected
    - Transactional emails (welcome, password reset, contact) remain unaffected
*/

-- Unschedule all daily email cron jobs
DO $$
BEGIN
  -- Attempt to unschedule daily-approved-listings-email
  BEGIN
    PERFORM cron.unschedule('daily-approved-listings-email');
    RAISE NOTICE 'Unscheduled daily-approved-listings-email cron job';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Cron job daily-approved-listings-email does not exist or already removed';
  END;

  -- Attempt to unschedule daily-digest-email
  BEGIN
    PERFORM cron.unschedule('daily-digest-email');
    RAISE NOTICE 'Unscheduled daily-digest-email cron job';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Cron job daily-digest-email does not exist or already removed';
  END;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'pg_cron not installed, skipping cron job removal';
  WHEN undefined_function THEN
    RAISE NOTICE 'cron.unschedule function not found, skipping';
END $$;

-- Drop storage policies for daily-listing-cards bucket
DROP POLICY IF EXISTS "Public can view daily listing card images" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload daily listing cards" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete old daily listing cards" ON storage.objects;

-- Drop the daily-listing-cards storage bucket
DO $$
BEGIN
  DELETE FROM storage.buckets WHERE id = 'daily-listing-cards';
  RAISE NOTICE 'Removed daily-listing-cards storage bucket';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Storage bucket already removed or does not exist';
END $$;

-- Drop policies on daily_cards_logs table
DROP POLICY IF EXISTS "Admins can view daily cards logs" ON daily_cards_logs;
DROP POLICY IF EXISTS "Service role can insert logs" ON daily_cards_logs;

-- Drop policies on daily_cards_config table
DROP POLICY IF EXISTS "Admins can view daily cards config" ON daily_cards_config;
DROP POLICY IF EXISTS "Admins can update daily cards config" ON daily_cards_config;
DROP POLICY IF EXISTS "Admins can insert daily cards config" ON daily_cards_config;

-- Drop policies on daily_digest_sent_listings table
DROP POLICY IF EXISTS "Admins can view sent listings" ON daily_digest_sent_listings;
DROP POLICY IF EXISTS "Service role can insert sent listings" ON daily_digest_sent_listings;

-- Drop policies on daily_digest_logs table
DROP POLICY IF EXISTS "Admins can view digest logs" ON daily_digest_logs;
DROP POLICY IF EXISTS "Service role can insert digest logs" ON daily_digest_logs;

-- Drop indexes from daily cards system
DROP INDEX IF EXISTS idx_daily_cards_logs_run_at;
DROP INDEX IF EXISTS idx_daily_cards_logs_success;

-- Drop indexes from daily digest system
DROP INDEX IF EXISTS idx_digest_sent_listing_id;
DROP INDEX IF EXISTS idx_digest_sent_date;
DROP INDEX IF EXISTS idx_digest_logs_run_at;
DROP INDEX IF EXISTS idx_digest_logs_success;

-- Drop index from approval email tracking
DROP INDEX IF EXISTS listings_approval_email_idx;

-- Drop all daily email related tables
DROP TABLE IF EXISTS daily_cards_logs;
DROP TABLE IF EXISTS daily_cards_config;
DROP TABLE IF EXISTS daily_digest_sent_listings;
DROP TABLE IF EXISTS daily_digest_logs;

-- Remove approval_email_sent_at column from listings table
ALTER TABLE listings DROP COLUMN IF EXISTS approval_email_sent_at;

-- Add notice about cleanup completion
DO $$
BEGIN
  RAISE NOTICE 'Successfully cleaned up all daily email digest systems';
  RAISE NOTICE 'Removed: daily_cards_*, daily_digest_*, approval_email_sent_at column';
  RAISE NOTICE 'Unscheduled: all daily email cron jobs';
  RAISE NOTICE 'Ready for new simple daily admin digest implementation';
END $$;
