/*
  # Add Enhanced Sales Listing Fields

  ## Overview
  This migration adds comprehensive fields for sales listings including property condition,
  occupancy status, outdoor spaces, interior features, and multi-family rent roll data.

  ## 1. New Enums
    - property_condition - Property condition rating
    - occupancy_status - Current occupancy state
    - delivery_condition - Delivery terms at closing
    - basement_type - Basement finish level
    - laundry_type - Laundry facilities type

  ## 2. New Fields in listings table
    - year_renovated (integer) - Year of last renovation
    - property_condition (enum) - Property condition
    - occupancy_status (enum) - Current occupancy
    - delivery_condition (enum) - Delivery terms
    - outdoor_space (text array) - Types of outdoor space
    - interior_features (text array) - Interior feature list
    - laundry_type (enum) - Laundry facilities
    - basement_type (enum) - Basement type
    - basement_notes (text) - Additional basement details
    - building_type (text) - Building structure classification
    - rent_roll_total (numeric) - Total monthly rent for multi-family
    - rent_roll_data (jsonb) - Per-unit rent breakdown
    - utilities_included (text array) - Utilities included in rent
    - tenant_notes (text) - Notes about current tenants
    - full_address (text) - Complete formatted address for sales

  ## 3. Data Safety
    - All new fields are optional (nullable)
    - No data loss for existing listings
    - Backward compatible with rental listings
*/

-- Create property_condition enum
DO $$ BEGIN
  CREATE TYPE property_condition AS ENUM ('excellent', 'good', 'fair', 'needs_work');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create occupancy_status enum
DO $$ BEGIN
  CREATE TYPE occupancy_status AS ENUM ('owner_occupied', 'tenant_occupied', 'vacant');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create delivery_condition enum
DO $$ BEGIN
  CREATE TYPE delivery_condition AS ENUM ('vacant_at_closing', 'subject_to_lease', 'negotiable');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create basement_type enum
DO $$ BEGIN
  CREATE TYPE basement_type AS ENUM ('finished', 'unfinished', 'partially_finished', 'walkout', 'none');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create laundry_type enum
DO $$ BEGIN
  CREATE TYPE laundry_type AS ENUM ('in_unit', 'hookups_only', 'common_area', 'none');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add year_renovated field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'year_renovated'
  ) THEN
    ALTER TABLE listings ADD COLUMN year_renovated integer;
    -- Add constraint to ensure year_renovated is reasonable
    ALTER TABLE listings ADD CONSTRAINT year_renovated_check
      CHECK (year_renovated IS NULL OR (year_renovated >= 1800 AND year_renovated <= EXTRACT(YEAR FROM CURRENT_DATE)::integer + 5));
  END IF;
END $$;

-- Add property_condition field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'property_condition'
  ) THEN
    ALTER TABLE listings ADD COLUMN property_condition property_condition;
  END IF;
END $$;

-- Add occupancy_status field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'occupancy_status'
  ) THEN
    ALTER TABLE listings ADD COLUMN occupancy_status occupancy_status;
  END IF;
END $$;

-- Add delivery_condition field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'delivery_condition'
  ) THEN
    ALTER TABLE listings ADD COLUMN delivery_condition delivery_condition;
  END IF;
END $$;

-- Add outdoor_space array field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'outdoor_space'
  ) THEN
    ALTER TABLE listings ADD COLUMN outdoor_space text[];
  END IF;
END $$;

-- Add interior_features array field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'interior_features'
  ) THEN
    ALTER TABLE listings ADD COLUMN interior_features text[];
  END IF;
END $$;

-- Add laundry_type field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'laundry_type'
  ) THEN
    ALTER TABLE listings ADD COLUMN laundry_type laundry_type;
  END IF;
END $$;

-- Add basement_type field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'basement_type'
  ) THEN
    ALTER TABLE listings ADD COLUMN basement_type basement_type;
  END IF;
END $$;

-- Add basement_notes field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'basement_notes'
  ) THEN
    ALTER TABLE listings ADD COLUMN basement_notes text;
  END IF;
END $$;

-- Add building_type field (separate from property_type for structure classification)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'building_type'
  ) THEN
    ALTER TABLE listings ADD COLUMN building_type text;
  END IF;
END $$;

-- Add rent_roll_total field for multi-family properties
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'rent_roll_total'
  ) THEN
    ALTER TABLE listings ADD COLUMN rent_roll_total numeric(10,2);
    ALTER TABLE listings ADD CONSTRAINT rent_roll_total_check
      CHECK (rent_roll_total IS NULL OR rent_roll_total >= 0);
  END IF;
END $$;

-- Add rent_roll_data JSONB field for per-unit breakdown
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'rent_roll_data'
  ) THEN
    ALTER TABLE listings ADD COLUMN rent_roll_data jsonb;
  END IF;
END $$;

-- Add utilities_included array field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'utilities_included'
  ) THEN
    ALTER TABLE listings ADD COLUMN utilities_included text[];
  END IF;
END $$;

-- Add tenant_notes field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'tenant_notes'
  ) THEN
    ALTER TABLE listings ADD COLUMN tenant_notes text;
  END IF;
END $$;

-- Add full_address field for sales listings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'full_address'
  ) THEN
    ALTER TABLE listings ADD COLUMN full_address text;
  END IF;
END $$;

-- Create indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_listings_property_condition ON listings(property_condition) WHERE property_condition IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_occupancy_status ON listings(occupancy_status) WHERE occupancy_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_laundry_type ON listings(laundry_type) WHERE laundry_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_basement_type ON listings(basement_type) WHERE basement_type IS NOT NULL AND basement_type != 'none';

-- Comments for documentation
COMMENT ON COLUMN listings.year_renovated IS 'Year of last major renovation. Must be >= year_built if both are set.';
COMMENT ON COLUMN listings.property_condition IS 'Overall condition of the property: excellent, good, fair, or needs_work.';
COMMENT ON COLUMN listings.occupancy_status IS 'Current occupancy: owner_occupied, tenant_occupied, or vacant.';
COMMENT ON COLUMN listings.delivery_condition IS 'Delivery terms at closing: vacant_at_closing, subject_to_lease, or negotiable.';
COMMENT ON COLUMN listings.outdoor_space IS 'Array of outdoor space types (e.g., balcony, terrace, patio, backyard, roof_deck, shared_yard).';
COMMENT ON COLUMN listings.interior_features IS 'Array of interior features (e.g., hardwood_floors, crown_molding, high_ceilings, fireplace).';
COMMENT ON COLUMN listings.laundry_type IS 'Type of laundry facilities: in_unit, hookups_only, common_area, or none.';
COMMENT ON COLUMN listings.basement_type IS 'Type of basement: finished, unfinished, partially_finished, walkout, or none.';
COMMENT ON COLUMN listings.basement_notes IS 'Additional details about the basement (ceiling height, features, etc.).';
COMMENT ON COLUMN listings.building_type IS 'Building structure type: detached, semi_attached, fully_attached, or apartment.';
COMMENT ON COLUMN listings.rent_roll_total IS 'Total monthly rent collected from all units (multi-family only).';
COMMENT ON COLUMN listings.rent_roll_data IS 'JSONB array of unit rent details: [{unit: string, bedrooms: number, rent: number}].';
COMMENT ON COLUMN listings.utilities_included IS 'Array of utilities included in rent (heat, hot_water, gas, electric, water_sewer, internet).';
COMMENT ON COLUMN listings.tenant_notes IS 'Notes about current tenants, lease terms, etc. (multi-family).';
COMMENT ON COLUMN listings.full_address IS 'Complete formatted address for sales listings (street, city, state, zip). Rentals use cross_streets for privacy.';