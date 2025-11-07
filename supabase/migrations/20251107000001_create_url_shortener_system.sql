/*
  # Create URL Shortening and Click Tracking System

  1. Purpose
    - Enable shortened URLs for cleaner email appearance
    - Track click-through rates for digest emails
    - Provide analytics on admin engagement with digest links

  2. New Tables
    - `short_urls`
      - Stores mappings between short codes and original URLs
      - Tracks listing ID, creation time, and click counts
      - Uses unique short codes for clean URLs (e.g., /l/abc123)

  3. Security
    - Enable RLS on short_urls table
    - Anyone can access short URLs for redirection (public)
    - Only authenticated users can view analytics
    - Service role can create short URLs

  4. Indexes
    - Unique index on short_code for fast lookups
    - Index on listing_id for analytics queries
    - Index on created_at for cleanup queries

  5. Integration
    - Works with existing analytics_events table
    - Click events stored with event_name: 'digest_link_click'
    - Event props include: listing_id, short_code, digest_date
*/

-- Create table for URL shortening and tracking
CREATE TABLE IF NOT EXISTS short_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code text UNIQUE NOT NULL,
  original_url text NOT NULL,
  listing_id uuid REFERENCES listings(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'digest_email',
  click_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  last_clicked_at timestamptz,
  expires_at timestamptz
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_short_urls_short_code
  ON short_urls(short_code);

CREATE INDEX IF NOT EXISTS idx_short_urls_listing_id
  ON short_urls(listing_id);

CREATE INDEX IF NOT EXISTS idx_short_urls_created_at
  ON short_urls(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_short_urls_source
  ON short_urls(source);

-- Enable Row Level Security
ALTER TABLE short_urls ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read short URLs (needed for public redirect)
CREATE POLICY "Anyone can read short URLs for redirection"
  ON short_urls
  FOR SELECT
  USING (true);

-- Policy: Service role can insert short URLs
CREATE POLICY "Service role can insert short URLs"
  ON short_urls
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Service role can update click counts
CREATE POLICY "Service role can update short URLs"
  ON short_urls
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Admins can view all short URL analytics
CREATE POLICY "Admins can view short URL analytics"
  ON short_urls
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Function to generate unique short codes
CREATE OR REPLACE FUNCTION generate_short_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i integer;
  code_exists boolean;
BEGIN
  -- Generate 6-character random code
  FOR attempt IN 1..10 LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;

    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM short_urls WHERE short_code = result) INTO code_exists;

    IF NOT code_exists THEN
      RETURN result;
    END IF;
  END LOOP;

  -- Fallback to UUID if all attempts failed
  RETURN substring(gen_random_uuid()::text, 1, 8);
END;
$$;

-- Function to increment click count atomically
CREATE OR REPLACE FUNCTION increment_short_url_clicks(p_short_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE short_urls
  SET
    click_count = click_count + 1,
    last_clicked_at = now()
  WHERE short_code = p_short_code;
END;
$$;

-- Function to create or get short URL for a listing
CREATE OR REPLACE FUNCTION create_short_url(
  p_listing_id uuid,
  p_original_url text,
  p_source text DEFAULT 'digest_email',
  p_expires_days integer DEFAULT 90
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_short_code text;
  v_existing_code text;
  v_expires_at timestamptz;
BEGIN
  -- Check if a non-expired short URL already exists for this listing and source
  SELECT short_code INTO v_existing_code
  FROM short_urls
  WHERE listing_id = p_listing_id
    AND source = p_source
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_code IS NOT NULL THEN
    RETURN v_existing_code;
  END IF;

  -- Generate new short code
  v_short_code := generate_short_code();

  -- Calculate expiration if specified
  IF p_expires_days IS NOT NULL THEN
    v_expires_at := now() + (p_expires_days || ' days')::interval;
  END IF;

  -- Insert new short URL
  INSERT INTO short_urls (short_code, original_url, listing_id, source, expires_at)
  VALUES (v_short_code, p_original_url, p_listing_id, p_source, v_expires_at);

  RETURN v_short_code;
END;
$$;

-- Function to cleanup expired short URLs (can be called by cron)
CREATE OR REPLACE FUNCTION cleanup_expired_short_urls()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM short_urls
  WHERE expires_at IS NOT NULL
    AND expires_at < now()
    AND click_count = 0;  -- Only delete unused expired URLs

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$;

-- Add helpful comments
COMMENT ON TABLE short_urls IS
  'Stores shortened URLs for digest emails with click tracking and analytics';

COMMENT ON COLUMN short_urls.short_code IS
  'Unique 6-character code used in short URLs (e.g., abc123)';

COMMENT ON COLUMN short_urls.original_url IS
  'Full URL that the short code redirects to';

COMMENT ON COLUMN short_urls.listing_id IS
  'Foreign key to listings table for analytics';

COMMENT ON COLUMN short_urls.source IS
  'Source of the short URL (e.g., digest_email, manual)';

COMMENT ON COLUMN short_urls.click_count IS
  'Number of times this short URL has been clicked';

COMMENT ON COLUMN short_urls.expires_at IS
  'Optional expiration timestamp for short URLs';

COMMENT ON FUNCTION generate_short_code() IS
  'Generates a unique 6-character random code for short URLs';

COMMENT ON FUNCTION increment_short_url_clicks(text) IS
  'Atomically increments click count for a short URL';

COMMENT ON FUNCTION create_short_url(uuid, text, text, integer) IS
  'Creates or retrieves existing short URL for a listing';

COMMENT ON FUNCTION cleanup_expired_short_urls() IS
  'Removes expired short URLs that have not been clicked';

-- Create view for admin analytics
CREATE OR REPLACE VIEW short_url_analytics AS
SELECT
  su.id,
  su.short_code,
  su.listing_id,
  l.title as listing_title,
  su.source,
  su.click_count,
  su.created_at,
  su.last_clicked_at,
  su.expires_at,
  CASE
    WHEN su.expires_at IS NULL THEN 'active'
    WHEN su.expires_at > now() THEN 'active'
    ELSE 'expired'
  END as status
FROM short_urls su
LEFT JOIN listings l ON su.listing_id = l.id
ORDER BY su.created_at DESC;

-- Grant access to the view for authenticated users
GRANT SELECT ON short_url_analytics TO authenticated;

-- Add RLS policy for the view
ALTER VIEW short_url_analytics SET (security_invoker = on);

-- Log success
DO $$
BEGIN
  RAISE NOTICE '✅ URL shortening and click tracking system created successfully';
  RAISE NOTICE 'Short URLs will use format: /l/[6-character-code]';
  RAISE NOTICE 'Default expiration: 90 days';
  RAISE NOTICE 'Click tracking integrated with analytics_events table';
END $$;
