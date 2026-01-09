/*
  # Fix Agency-Listing Linkage

  1. Problem
    - Many listings don't have agency_id set
    - Previous backfill only linked listings where user IS the agency owner
    - Agents who WORK FOR agencies (but don't own them) have listings without agency_id
    - This causes listings to not appear on agency pages

  2. Solution
    - Create trigger to auto-set agency_id when listings are created/updated
    - Improved backfill that links listings based on:
      a) User owns the agency (owner_profile_id match)
      b) User's profile.agency text matches an agency's name
    - This ensures all agent listings are properly linked to their agencies

  3. Changes
    - Function: auto_set_listing_agency_id() - automatically sets agency_id
    - Trigger: set_listing_agency_id_trigger - calls function on insert/update
    - Backfill: Links existing listings to agencies via both methods
*/

-- Function to automatically set agency_id based on user's agency relationship
CREATE OR REPLACE FUNCTION auto_set_listing_agency_id()
RETURNS TRIGGER AS $$
DECLARE
  user_agency_id uuid;
  user_agency_name text;
BEGIN
  -- Skip if agency_id is already explicitly set
  IF NEW.agency_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Try to find agency_id via direct ownership (user owns the agency)
  SELECT a.id INTO user_agency_id
  FROM agencies a
  WHERE a.owner_profile_id = NEW.user_id
  LIMIT 1;

  -- If found via ownership, set it and return
  IF user_agency_id IS NOT NULL THEN
    NEW.agency_id = user_agency_id;
    RETURN NEW;
  END IF;

  -- If not found via ownership, try to find via profile.agency text match
  SELECT p.agency INTO user_agency_name
  FROM profiles p
  WHERE p.id = NEW.user_id
  LIMIT 1;

  -- If user has an agency name in their profile, try to match it to an agency
  IF user_agency_name IS NOT NULL AND user_agency_name != '' THEN
    SELECT a.id INTO user_agency_id
    FROM agencies a
    WHERE LOWER(TRIM(a.name)) = LOWER(TRIM(user_agency_name))
    LIMIT 1;

    -- If found via name match, set it
    IF user_agency_id IS NOT NULL THEN
      NEW.agency_id = user_agency_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that automatically sets agency_id on insert/update
DROP TRIGGER IF EXISTS set_listing_agency_id_trigger ON listings;
CREATE TRIGGER set_listing_agency_id_trigger
  BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_listing_agency_id();

-- Backfill Part 1: Link listings where user OWNS the agency
UPDATE listings
SET agency_id = agencies.id
FROM agencies
WHERE listings.user_id = agencies.owner_profile_id
  AND listings.agency_id IS NULL;

-- Backfill Part 2: Link listings where user's profile.agency matches agency name
UPDATE listings
SET agency_id = a.id
FROM profiles p
JOIN agencies a ON LOWER(TRIM(a.name)) = LOWER(TRIM(p.agency))
WHERE listings.user_id = p.id
  AND listings.agency_id IS NULL
  AND p.agency IS NOT NULL
  AND p.agency != '';

-- Create index on agency_id for better query performance
CREATE INDEX IF NOT EXISTS idx_listings_agency_id ON listings(agency_id) WHERE agency_id IS NOT NULL;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION auto_set_listing_agency_id() TO authenticated;
GRANT EXECUTE ON FUNCTION auto_set_listing_agency_id() TO service_role;
