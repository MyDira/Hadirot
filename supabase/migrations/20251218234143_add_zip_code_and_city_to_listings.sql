/*
  # Add ZIP Code and City Columns to Listings

  1. New Columns
    - `zip_code` (text) - ZIP code derived from reverse geocoding
    - `city` (text) - City name derived from reverse geocoding

  2. Background
    - These fields are auto-derived via reverse geocoding from latitude/longitude coordinates
    - They are read-only display/analytics fields set during listing creation
    - Used for filtering, analytics, and display purposes

  3. Notes
    - Both columns are nullable since existing listings may not have coordinates
    - Values are set automatically when location is geocoded during listing creation
*/

ALTER TABLE listings ADD COLUMN IF NOT EXISTS zip_code text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS city text;

CREATE INDEX IF NOT EXISTS idx_listings_zip_code ON listings(zip_code);
CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city);
