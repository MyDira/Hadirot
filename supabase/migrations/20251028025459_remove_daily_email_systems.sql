/*
  # Remove Daily Email Systems

  1. Purpose
    - Complete removal of Daily Listing Cards automation system
    - Complete removal of Daily Approved Listings automation system
    - Preserve manual email send functionality
    - Preserve approval_email_sent_at column (unused but kept per requirement)

  2. Changes
    - Drop daily_cards_config table and all policies
    - Drop daily_cards_logs table and all policies
    - Drop indexes on daily cards tables
    - Drop listings_approval_email_idx index
    - Remove daily-listing-cards storage bucket
    - Unschedule daily-approved-listings-email cron job
    - KEEP approval_email_sent_at column in listings table

  3. Preserved Functionality
    - Manual email send via send-listing-email-manual Edge Function
    - All transactional emails (welcome, password reset, contact)
    - approval_email_sent_at column remains in listings table

  4. Notes
    - This is a cleanup migration to remove unused automation
    - Manual email functionality is unaffected
    - Edge Functions must be manually deleted from Supabase dashboard
    - Frontend components must be manually removed from codebase
*/

-- Unschedule the daily approved listings cron job
DO $$
BEGIN
  -- Try to unschedule the cron job if it exists
  PERFORM cron.unschedule('daily-approved-listings-email');
  RAISE NOTICE 'Unscheduled daily-approved-listings-email cron job';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'pg_cron not installed, skipping cron job removal';
  WHEN undefined_function THEN
    RAISE NOTICE 'cron.unschedule function not found, skipping';
  WHEN OTHERS THEN
    RAISE NOTICE 'Cron job daily-approved-listings-email does not exist or already removed';
END $$;

-- Drop storage policies for daily-listing-cards bucket
DO $$
BEGIN
  DROP POLICY IF EXISTS "Public can view daily listing card images" ON storage.objects;
  DROP POLICY IF EXISTS "Service role can upload daily listing cards" ON storage.objects;
  DROP POLICY IF EXISTS "Service role can delete old daily listing cards" ON storage.objects;
  RAISE NOTICE 'Dropped storage policies for daily-listing-cards bucket';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Storage policies already removed or do not exist';
END $$;

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

-- Drop indexes
DROP INDEX IF EXISTS idx_daily_cards_logs_run_at;
DROP INDEX IF EXISTS idx_daily_cards_logs_success;
DROP INDEX IF EXISTS listings_approval_email_idx;

-- Drop tables
DROP TABLE IF EXISTS daily_cards_logs;
DROP TABLE IF EXISTS daily_cards_config;

-- Note: approval_email_sent_at column is preserved in listings table
-- It can be removed in a future migration if needed:
-- ALTER TABLE listings DROP COLUMN IF EXISTS approval_email_sent_at;

-- Add comment documenting the preserved column
COMMENT ON COLUMN listings.approval_email_sent_at IS
  'DEPRECATED: Previously used for daily approval email tracking. No longer in use but preserved per requirement. Can be removed in future migration if needed.';
