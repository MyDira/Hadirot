/*
  # Add Location Coordinates to Listings

  1. New Columns
    - `latitude` (double precision, nullable) - GPS latitude coordinate for map placement
    - `longitude` (double precision, nullable) - GPS longitude coordinate for map placement

  2. Purpose
    - Enable map-based browsing of listings
    - Allow users to set precise location when posting a listing
    - Support geocoding from cross streets to coordinates

  3. Notes
    - Both columns are nullable to support existing listings without location data
    - Listings without coordinates will be silently excluded from map view
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE listings ADD COLUMN latitude double precision;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE listings ADD COLUMN longitude double precision;
  END IF;
END $$;

-- Add an index for efficient queries filtering by location existence
CREATE INDEX IF NOT EXISTS idx_listings_has_coordinates 
  ON listings (latitude, longitude) 
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;