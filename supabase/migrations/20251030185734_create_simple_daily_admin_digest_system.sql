/*
  # Create Simple Daily Admin Digest System

  1. Purpose
    - Track which listings have been emailed to prevent duplicates
    - Log execution history for monitoring
    - Store adjustable configuration for delivery time
    - Simple, plain-text email digest of new listings to admins

  2. New Tables
    - `daily_admin_digest_sent_listings`
      - Tracks listings that have been included in digest emails
      - Prevents duplicate emails within 7 day window
      - Uses listing_id foreign key with CASCADE delete

    - `daily_admin_digest_logs`
      - Logs each digest execution for monitoring
      - Tracks success/failure, counts, and error messages
      - Helps with troubleshooting and analytics

    - `daily_admin_digest_config`
      - Stores adjustable delivery settings
      - Controls enabled status and timing
      - Allows admin UI to modify schedule

  3. Security
    - Enable RLS on all tables
    - Only admins can view logs and config
    - Service role can insert logs and sent listings
    - Admins can update config settings

  4. Indexes
    - Efficient lookup by listing_id for deduplication
    - Time-based queries for recent sends
    - Log ordering by execution time

  5. Default Configuration
    - Enabled by default
    - Delivery time: 09:00 (9 AM)
    - Timezone: America/New_York (Eastern Time)
*/

-- Create table to track which listings have been sent in digest emails
CREATE TABLE IF NOT EXISTS daily_admin_digest_sent_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create table to log digest execution history
CREATE TABLE IF NOT EXISTS daily_admin_digest_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  listings_count integer NOT NULL DEFAULT 0,
  recipients_count integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Create table for adjustable configuration
CREATE TABLE IF NOT EXISTS daily_admin_digest_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT true,
  delivery_time time NOT NULL DEFAULT '09:00:00',
  timezone text NOT NULL DEFAULT 'America/New_York',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_daily_admin_digest_sent_listing_id
  ON daily_admin_digest_sent_listings(listing_id);

CREATE INDEX IF NOT EXISTS idx_daily_admin_digest_sent_at
  ON daily_admin_digest_sent_listings(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_admin_digest_logs_run_at
  ON daily_admin_digest_logs(run_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_admin_digest_logs_success
  ON daily_admin_digest_logs(success);

-- Enable Row Level Security
ALTER TABLE daily_admin_digest_sent_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_admin_digest_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_admin_digest_config ENABLE ROW LEVEL SECURITY;

-- Policies for daily_admin_digest_sent_listings
CREATE POLICY "Admins can view sent listings"
  ON daily_admin_digest_sent_listings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role can insert sent listings"
  ON daily_admin_digest_sent_listings
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policies for daily_admin_digest_logs
CREATE POLICY "Admins can view digest logs"
  ON daily_admin_digest_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role can insert digest logs"
  ON daily_admin_digest_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policies for daily_admin_digest_config
CREATE POLICY "Admins can view digest config"
  ON daily_admin_digest_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update digest config"
  ON daily_admin_digest_config
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Insert default configuration
INSERT INTO daily_admin_digest_config (enabled, delivery_time, timezone)
VALUES (true, '09:00:00', 'America/New_York')
ON CONFLICT DO NOTHING;

-- Add helpful comments
COMMENT ON TABLE daily_admin_digest_sent_listings IS
  'Tracks which listings have been included in daily admin digest emails within past 7 days to prevent duplicates';

COMMENT ON TABLE daily_admin_digest_logs IS
  'Logs execution history of daily admin digest email sends for monitoring and troubleshooting';

COMMENT ON TABLE daily_admin_digest_config IS
  'Stores adjustable configuration for daily admin digest including enabled status and delivery time';

COMMENT ON COLUMN daily_admin_digest_sent_listings.listing_id IS
  'Foreign key to listings table - which listing was sent in digest';

COMMENT ON COLUMN daily_admin_digest_sent_listings.sent_at IS
  'Timestamp when this listing was included in a digest email';

COMMENT ON COLUMN daily_admin_digest_logs.listings_count IS
  'Number of new listings included in this digest email';

COMMENT ON COLUMN daily_admin_digest_logs.recipients_count IS
  'Number of admin users who received this digest email';

COMMENT ON COLUMN daily_admin_digest_config.delivery_time IS
  'Time of day to send digest email (format: HH:MM:SS)';

COMMENT ON COLUMN daily_admin_digest_config.timezone IS
  'Timezone for delivery_time (e.g., America/New_York for Eastern Time)';