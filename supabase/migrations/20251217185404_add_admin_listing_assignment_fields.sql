/*
  # Add Admin Listing Assignment Fields
  
  1. New Columns
    - `admin_custom_agency_name` (varchar 100) - Custom agency name for admin-created listings
    - `admin_listing_type_display` (text) - Display type: 'agent' or 'owner'
  
  2. Purpose
    - Allow admins to assign listings to users with custom display settings
    - Custom agency name appears on listing cards without linking to agency pages
    - Listing type determines "Real Estate Agent" vs "By Owner" display
  
  3. Notes
    - These fields are only used when admin creates/edits listing with custom display
    - Regular user listings continue to use owner profile data for display
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'admin_custom_agency_name'
  ) THEN
    ALTER TABLE listings ADD COLUMN admin_custom_agency_name VARCHAR(100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'admin_listing_type_display'
  ) THEN
    ALTER TABLE listings ADD COLUMN admin_listing_type_display TEXT;
    ALTER TABLE listings ADD CONSTRAINT admin_listing_type_display_check 
      CHECK (admin_listing_type_display IS NULL OR admin_listing_type_display IN ('agent', 'owner'));
  END IF;
END $$;