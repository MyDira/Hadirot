/*
  # Create Daily Listing Cards Email System

  1. New Tables
    - `daily_cards_config`
      - Stores automation settings (enabled, time, recipients, filters)
      - Single row configuration table
    
    - `daily_cards_logs`
      - Logs each execution of the daily cards function
      - Tracks success/failure, counts, errors, timing

  2. Storage
    - Creates storage bucket for daily listing card images
    - Public read access, admin write access
    
  3. Security
    - Enable RLS on both tables
    - Admin-only access policies
*/

-- Create daily cards configuration table
CREATE TABLE IF NOT EXISTS daily_cards_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean DEFAULT true,
  delivery_time text DEFAULT '06:00',
  recipient_emails text[] DEFAULT ARRAY[]::text[],
  max_listings integer DEFAULT 20,
  include_featured_only boolean DEFAULT false,
  days_to_include integer DEFAULT 7,
  timezone text DEFAULT 'America/New_York',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create daily cards execution logs table
CREATE TABLE IF NOT EXISTS daily_cards_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz DEFAULT now(),
  success boolean DEFAULT false,
  listings_count integer DEFAULT 0,
  images_generated integer DEFAULT 0,
  email_sent boolean DEFAULT false,
  error_message text,
  execution_time_ms integer,
  triggered_by text DEFAULT 'cron'
);

-- Enable RLS
ALTER TABLE daily_cards_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_cards_logs ENABLE ROW LEVEL SECURITY;

-- Policies for daily_cards_config (admin only)
CREATE POLICY "Admins can view daily cards config"
  ON daily_cards_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update daily cards config"
  ON daily_cards_config FOR UPDATE
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

CREATE POLICY "Admins can insert daily cards config"
  ON daily_cards_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Policies for daily_cards_logs (admin read only)
CREATE POLICY "Admins can view daily cards logs"
  ON daily_cards_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role can insert logs"
  ON daily_cards_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_cards_logs_run_at ON daily_cards_logs(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_cards_logs_success ON daily_cards_logs(success);

-- Insert default configuration
INSERT INTO daily_cards_config (
  enabled,
  delivery_time,
  recipient_emails,
  max_listings,
  include_featured_only,
  days_to_include,
  timezone
)
VALUES (
  false, -- Disabled by default, admin must enable
  '06:00',
  ARRAY[]::text[], -- Admin must add their email
  20,
  false,
  7,
  'America/New_York'
)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for daily listing cards
INSERT INTO storage.buckets (id, name, public)
VALUES ('daily-listing-cards', 'daily-listing-cards', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for daily-listing-cards bucket
CREATE POLICY "Public can view daily listing card images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'daily-listing-cards');

CREATE POLICY "Service role can upload daily listing cards"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'daily-listing-cards');

CREATE POLICY "Service role can delete old daily listing cards"
  ON storage.objects FOR DELETE
  TO service_role
  USING (bucket_id = 'daily-listing-cards');