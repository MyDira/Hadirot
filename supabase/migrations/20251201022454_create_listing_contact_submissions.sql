/*
  # Create listing contact submissions tracking system

  1. New Tables
    - `listing_contact_submissions`
      - `id` (uuid, primary key)
      - `listing_id` (uuid, foreign key to listings)
      - `user_name` (text, name of person contacting)
      - `user_phone` (text, phone number of person contacting)
      - `consent_to_followup` (boolean, WhatsApp consent)
      - `session_id` (text, analytics session tracking)
      - `ip_address` (text, for spam prevention)
      - `user_agent` (text, browser info)
      - `created_at` (timestamptz, submission timestamp)

  2. Security
    - Enable RLS on `listing_contact_submissions` table
    - Admins can view all submissions
    - Users cannot directly insert (only via Edge Function)

  3. Indexes
    - Index on `listing_id` for quick lookup
    - Index on `created_at` for time-based queries
    - Composite index on `(listing_id, created_at)` for analytics

  4. Analytics Function
    - RPC function to retrieve contact submissions with listing details
    - Admin-only access
*/

-- Create listing contact submissions table
CREATE TABLE IF NOT EXISTS listing_contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  user_name text NOT NULL,
  user_phone text NOT NULL,
  consent_to_followup boolean DEFAULT false NOT NULL,
  session_id text,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE listing_contact_submissions ENABLE ROW LEVEL SECURITY;

-- Only admins can view all submissions
CREATE POLICY "Admins can view all contact submissions"
  ON listing_contact_submissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- No public insert policy - only Edge Function with service role can insert

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS listing_contact_submissions_listing_id_idx
  ON listing_contact_submissions (listing_id);

CREATE INDEX IF NOT EXISTS listing_contact_submissions_created_at_desc_idx
  ON listing_contact_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS listing_contact_submissions_listing_created_idx
  ON listing_contact_submissions (listing_id, created_at DESC);

-- Create analytics RPC function for contact submissions
CREATE OR REPLACE FUNCTION analytics_contact_submissions(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 100,
  tz text DEFAULT 'UTC'
)
RETURNS TABLE (
  submission_id uuid,
  submission_date timestamptz,
  user_name text,
  user_phone text,
  consent_to_followup boolean,
  listing_id uuid,
  listing_title text,
  listing_location text,
  listing_neighborhood text,
  bedrooms integer,
  price integer,
  contact_name text,
  contact_phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow admins to access this function
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT
    lcs.id AS submission_id,
    lcs.created_at AS submission_date,
    lcs.user_name,
    lcs.user_phone,
    lcs.consent_to_followup,
    l.id AS listing_id,
    l.title AS listing_title,
    l.location AS listing_location,
    l.neighborhood AS listing_neighborhood,
    l.bedrooms,
    l.price,
    l.contact_name,
    l.contact_phone
  FROM listing_contact_submissions lcs
  INNER JOIN listings l ON lcs.listing_id = l.id
  WHERE
    CASE
      WHEN days_back = 0 THEN
        DATE(lcs.created_at AT TIME ZONE tz) = CURRENT_DATE AT TIME ZONE tz
      ELSE
        lcs.created_at >= (CURRENT_DATE AT TIME ZONE tz - (days_back || ' days')::interval)
    END
  ORDER BY lcs.created_at DESC
  LIMIT limit_count;
END;
$$;

-- Create analytics summary function for contact submissions
CREATE OR REPLACE FUNCTION analytics_contact_submissions_summary(
  days_back integer DEFAULT 0,
  tz text DEFAULT 'UTC'
)
RETURNS TABLE (
  total_submissions bigint,
  submissions_with_consent bigint,
  unique_listings bigint,
  consent_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow admins to access this function
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) AS total_submissions,
    COUNT(*) FILTER (WHERE consent_to_followup = true) AS submissions_with_consent,
    COUNT(DISTINCT listing_id) AS unique_listings,
    ROUND(
      (COUNT(*) FILTER (WHERE consent_to_followup = true)::numeric / NULLIF(COUNT(*), 0) * 100),
      1
    ) AS consent_rate
  FROM listing_contact_submissions
  WHERE
    CASE
      WHEN days_back = 0 THEN
        DATE(created_at AT TIME ZONE tz) = CURRENT_DATE AT TIME ZONE tz
      ELSE
        created_at >= (CURRENT_DATE AT TIME ZONE tz - (days_back || ' days')::interval)
    END;
END;
$$;