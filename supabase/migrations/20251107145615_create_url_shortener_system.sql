-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_short_urls_short_code ON short_urls(short_code);
CREATE INDEX IF NOT EXISTS idx_short_urls_listing_id ON short_urls(listing_id);
CREATE INDEX IF NOT EXISTS idx_short_urls_created_at ON short_urls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_short_urls_source ON short_urls(source);

-- Enable Row Level Security
ALTER TABLE short_urls ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read short URLs (needed for public redirect)
CREATE POLICY "Anyone can read short URLs for redirection" ON short_urls FOR SELECT USING (true);

-- Policy: Service role can insert short URLs
CREATE POLICY "Service role can insert short URLs" ON short_urls FOR INSERT TO service_role WITH CHECK (true);

-- Policy: Service role can update click counts
CREATE POLICY "Service role can update short URLs" ON short_urls FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- Function to generate unique short codes
CREATE OR REPLACE FUNCTION generate_short_code() RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text;
  i integer;
  code_exists boolean;
BEGIN
  FOR attempt IN 1..10 LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM short_urls WHERE short_code = result) INTO code_exists;
    IF NOT code_exists THEN RETURN result; END IF;
  END LOOP;
  RETURN substring(gen_random_uuid()::text, 1, 8);
END;
$$;

-- Function to increment click count
CREATE OR REPLACE FUNCTION increment_short_url_clicks(p_short_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE short_urls SET click_count = click_count + 1, last_clicked_at = now() WHERE short_code = p_short_code;
END;
$$;

-- Function to create or get short URL for a listing
CREATE OR REPLACE FUNCTION create_short_url(p_listing_id uuid, p_original_url text, p_source text DEFAULT 'digest_email', p_expires_days integer DEFAULT 90) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_short_code text;
  v_existing_code text;
  v_expires_at timestamptz;
BEGIN
  SELECT short_code INTO v_existing_code FROM short_urls WHERE listing_id = p_listing_id AND source = p_source AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC LIMIT 1;
  IF v_existing_code IS NOT NULL THEN RETURN v_existing_code; END IF;
  v_short_code := generate_short_code();
  IF p_expires_days IS NOT NULL THEN v_expires_at := now() + (p_expires_days || ' days')::interval; END IF;
  INSERT INTO short_urls (short_code, original_url, listing_id, source, expires_at) VALUES (v_short_code, p_original_url, p_listing_id, p_source, v_expires_at);
  RETURN v_short_code;
END;
$$;

-- Create view for admin analytics
CREATE OR REPLACE VIEW short_url_analytics AS SELECT su.id, su.short_code, su.listing_id, l.title as listing_title, su.source, su.click_count, su.created_at, su.last_clicked_at, su.expires_at, CASE WHEN su.expires_at IS NULL THEN 'active' WHEN su.expires_at > now() THEN 'active' ELSE 'expired' END as status FROM short_urls su LEFT JOIN listings l ON su.listing_id = l.id ORDER BY su.created_at DESC;

GRANT SELECT ON short_url_analytics TO authenticated;