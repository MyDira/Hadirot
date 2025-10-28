/*
  # Create Daily Digest Email System

  1. Purpose
    - Track listings sent in daily digest emails
    - Prevent duplicate listings in future emails
    - Log email execution history

  2. New Tables
    - `daily_digest_sent_listings`
      - `id` (uuid, primary key)
      - `listing_id` (uuid, foreign key to listings)
      - `sent_at` (timestamptz, when it was included in digest)
      - `digest_date` (date, which day's digest it was in)
      - `created_at` (timestamptz)

    - `daily_digest_logs`
      - `id` (uuid, primary key)
      - `run_at` (timestamptz, when digest ran)
      - `listings_count` (integer, how many listings sent)
      - `recipients_count` (integer, how many admins emailed)
      - `success` (boolean, whether send succeeded)
      - `error_message` (text, if failed)
      - `created_at` (timestamptz)

  3. Security
    - Enable RLS on both tables
    - Only admins can view logs
    - Service role can insert records

  4. Indexes
    - Index on listing_id for deduplication checks
    - Index on digest_date for date-based queries
    - Index on run_at for log queries
*/

-- Create daily_digest_sent_listings table
CREATE TABLE IF NOT EXISTS daily_digest_sent_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  digest_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- Create daily_digest_logs table
CREATE TABLE IF NOT EXISTS daily_digest_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  listings_count integer NOT NULL DEFAULT 0,
  recipients_count integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_digest_sent_listing_id ON daily_digest_sent_listings(listing_id);
CREATE INDEX IF NOT EXISTS idx_digest_sent_date ON daily_digest_sent_listings(digest_date);
CREATE INDEX IF NOT EXISTS idx_digest_logs_run_at ON daily_digest_logs(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_digest_logs_success ON daily_digest_logs(success);

-- Enable RLS
ALTER TABLE daily_digest_sent_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_digest_logs ENABLE ROW LEVEL SECURITY;

-- Policies for daily_digest_sent_listings
CREATE POLICY "Admins can view sent listings"
  ON daily_digest_sent_listings
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
  ON daily_digest_sent_listings
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policies for daily_digest_logs
CREATE POLICY "Admins can view digest logs"
  ON daily_digest_logs
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
  ON daily_digest_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Add helpful comments
COMMENT ON TABLE daily_digest_sent_listings IS
  'Tracks which listings have been included in daily digest emails to prevent duplicates';

COMMENT ON TABLE daily_digest_logs IS
  'Logs execution history of daily digest email sends';

COMMENT ON COLUMN daily_digest_sent_listings.digest_date IS
  'The date of the digest this listing was included in (for grouping by day)';

COMMENT ON COLUMN daily_digest_logs.listings_count IS
  'Number of new listings included in this digest';

COMMENT ON COLUMN daily_digest_logs.recipients_count IS
  'Number of admin users who received the digest';
