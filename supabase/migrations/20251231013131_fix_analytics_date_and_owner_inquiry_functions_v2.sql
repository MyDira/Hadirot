/*
  # Fix Analytics Date Filtering and Owner Inquiry Functions

  ## Bug Fixes
  1. **analytics_contact_submissions**: Fixed date comparison bug where 
     `DATE(lcs.created_at AT TIME ZONE tz) = CURRENT_DATE AT TIME ZONE tz`
     was comparing a DATE type to a TIMESTAMPTZ type, causing zero results.
     Now uses proper casting: `(lcs.created_at AT TIME ZONE tz)::date = CURRENT_DATE`

  2. **analytics_contact_submissions_summary**: Same date comparison fix applied.

  ## Updated Functions
  1. **get_owner_listing_inquiry_counts()**: Returns inquiry counts for all listings
     owned by the authenticated user. Returns integer (not bigint) for consistency.
     - Returns: listing_id, inquiry_count (always 0 or positive integer, never null)

  2. **get_listing_inquiries(p_listing_id uuid)**: Returns inquiry details for a 
     specific listing after verifying ownership. Simplified return type.
     - Returns: user_name, user_phone, created_at
     - Raises exception if user does not own the listing

  ## Security
  - Both functions use SECURITY DEFINER with ownership checks via auth.uid()
  - No direct table access needed - all access through RPC
*/

-- Fix analytics_contact_submissions date comparison bug
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
        (lcs.created_at AT TIME ZONE tz)::date = CURRENT_DATE
      ELSE
        lcs.created_at >= (CURRENT_DATE - (days_back || ' days')::interval)
    END
  ORDER BY lcs.created_at DESC
  LIMIT limit_count;
END;
$$;

-- Fix analytics_contact_submissions_summary date comparison bug
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
    COUNT(*) FILTER (WHERE lcs.consent_to_followup = true) AS submissions_with_consent,
    COUNT(DISTINCT lcs.listing_id) AS unique_listings,
    ROUND(
      (COUNT(*) FILTER (WHERE lcs.consent_to_followup = true)::numeric / NULLIF(COUNT(*), 0) * 100),
      1
    ) AS consent_rate
  FROM listing_contact_submissions lcs
  WHERE
    CASE
      WHEN days_back = 0 THEN
        (lcs.created_at AT TIME ZONE tz)::date = CURRENT_DATE
      ELSE
        lcs.created_at >= (CURRENT_DATE - (days_back || ' days')::interval)
    END;
END;
$$;

-- Drop existing functions to recreate with correct return types
DROP FUNCTION IF EXISTS get_owner_listing_inquiry_counts();
DROP FUNCTION IF EXISTS get_listing_inquiries(uuid);

-- Create function to get inquiry counts for the authenticated user's listings
CREATE FUNCTION get_owner_listing_inquiry_counts()
RETURNS TABLE (
  listing_id uuid,
  inquiry_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id AS listing_id,
    COALESCE(COUNT(lcs.id)::integer, 0) AS inquiry_count
  FROM listings l
  LEFT JOIN listing_contact_submissions lcs ON lcs.listing_id = l.id
  WHERE l.user_id = auth.uid()
  GROUP BY l.id;
END;
$$;

-- Create function to get inquiry details for a specific listing (with ownership check)
CREATE FUNCTION get_listing_inquiries(p_listing_id uuid)
RETURNS TABLE (
  user_name text,
  user_phone text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT l.user_id INTO v_owner_id
  FROM listings l
  WHERE l.id = p_listing_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  IF v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied. You do not own this listing.';
  END IF;

  RETURN QUERY
  SELECT
    lcs.user_name,
    lcs.user_phone,
    lcs.created_at
  FROM listing_contact_submissions lcs
  WHERE lcs.listing_id = p_listing_id
  ORDER BY lcs.created_at DESC;
END;
$$;
