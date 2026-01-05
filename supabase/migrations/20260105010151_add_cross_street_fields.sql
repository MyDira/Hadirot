/*
  # Add Structured Cross Street Fields

  1. New Columns
    - `cross_street_a` (text, nullable) - First cross street from Mapbox autocomplete
    - `cross_street_b` (text, nullable) - Second cross street from Mapbox autocomplete

  2. Purpose
    - Enable structured two-field cross street input
    - Support Mapbox autocomplete validation
    - Improve geocoding reliability by using validated street names

  3. Notes
    - Both columns are nullable for backward compatibility with existing listings
    - Existing listings with only `location` field will continue to work
    - New listings should use cross_street_a and cross_street_b
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'cross_street_a'
  ) THEN
    ALTER TABLE listings ADD COLUMN cross_street_a text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'cross_street_b'
  ) THEN
    ALTER TABLE listings ADD COLUMN cross_street_b text;
  END IF;
END $$;
