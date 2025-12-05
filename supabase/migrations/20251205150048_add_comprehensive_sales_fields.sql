/*
  # Add Comprehensive Sales Listing Fields

  ## Overview
  This migration adds all remaining fields needed for a complete sales listing system,
  including property dimensions (length/width), building details, heating/cooling systems,
  and expanded property types.

  ## 1. New Enums
    - `driveway_status` - Options for driveway types (private, easement, shared, carport, none)
    - `heating_type` - Heating system types (forced_air, radiator, baseboard, heat_pump, other)
    - `cooling_type` - Cooling system types (central_ac, split_units, window_units, none)
    
  ## 2. Expanded Enums
    - `property_type` - Add new sale property types:
      - detached_house
      - semi_attached_house
      - fully_attached_townhouse
      - condo
      - co_op

  ## 3. New Fields in listings table
    - `year_built` (integer) - Replace property_age with actual year
    - `property_length_ft` (decimal) - Lot length in feet
    - `property_width_ft` (decimal) - Lot width in feet
    - `building_length_ft` (decimal) - Building length in feet
    - `building_width_ft` (decimal) - Building width in feet
    - `building_size_sqft` (integer) - Auto-calculated or manually entered building size
    - `driveway_status` (enum) - Type of driveway
    - `multi_family` (boolean) - Is this a multi-family property
    - `unit_count` (integer) - Number of units for multi-family
    - `number_of_floors` (integer) - Number of floors
    - `heating_type` (enum) - Type of heating system
    - `cooling_type` (enum) - Type of cooling system
    - `appliances` (text array) - Major appliances included

  ## 4. Data Migration
    - No data loss - all new fields are optional
    - Existing listings remain unchanged
    - property_age can coexist with year_built for backwards compatibility

  ## 5. Indexes
    - Add indexes for commonly filtered fields (year_built, driveway_status)
*/

-- Create driveway_status enum
DO $$ BEGIN
  CREATE TYPE driveway_status AS ENUM ('private', 'easement', 'shared', 'carport', 'none');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create heating_type enum
DO $$ BEGIN
  CREATE TYPE heating_type AS ENUM ('forced_air', 'radiator', 'baseboard', 'heat_pump', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create cooling_type enum
DO $$ BEGIN
  CREATE TYPE cooling_type AS ENUM ('central_ac', 'split_units', 'window_units', 'none');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Expand property_type enum with new sale-specific types
-- First, add the new values to the enum
DO $$ 
BEGIN
  -- Add detached_house if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'detached_house' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'property_type')
  ) THEN
    ALTER TYPE property_type ADD VALUE 'detached_house';
  END IF;

  -- Add semi_attached_house if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'semi_attached_house' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'property_type')
  ) THEN
    ALTER TYPE property_type ADD VALUE 'semi_attached_house';
  END IF;

  -- Add fully_attached_townhouse if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'fully_attached_townhouse' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'property_type')
  ) THEN
    ALTER TYPE property_type ADD VALUE 'fully_attached_townhouse';
  END IF;

  -- Add condo if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'condo' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'property_type')
  ) THEN
    ALTER TYPE property_type ADD VALUE 'condo';
  END IF;

  -- Add co_op if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'co_op' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'property_type')
  ) THEN
    ALTER TYPE property_type ADD VALUE 'co_op';
  END IF;
END $$;

-- Add year_built field (replaces/supplements property_age)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'year_built'
  ) THEN
    ALTER TABLE listings ADD COLUMN year_built integer;
    -- Add constraint to ensure year_built is reasonable (1800 to current year + 5)
    ALTER TABLE listings ADD CONSTRAINT year_built_check 
      CHECK (year_built IS NULL OR (year_built >= 1800 AND year_built <= EXTRACT(YEAR FROM CURRENT_DATE)::integer + 5));
  END IF;
END $$;

-- Add property dimension fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'property_length_ft'
  ) THEN
    ALTER TABLE listings ADD COLUMN property_length_ft numeric(10,2);
    -- Add constraint for reasonable values (1 to 10000 feet)
    ALTER TABLE listings ADD CONSTRAINT property_length_check 
      CHECK (property_length_ft IS NULL OR (property_length_ft > 0 AND property_length_ft <= 10000));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'property_width_ft'
  ) THEN
    ALTER TABLE listings ADD COLUMN property_width_ft numeric(10,2);
    ALTER TABLE listings ADD CONSTRAINT property_width_check 
      CHECK (property_width_ft IS NULL OR (property_width_ft > 0 AND property_width_ft <= 10000));
  END IF;
END $$;

-- Add building dimension fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'building_length_ft'
  ) THEN
    ALTER TABLE listings ADD COLUMN building_length_ft numeric(10,2);
    ALTER TABLE listings ADD CONSTRAINT building_length_check 
      CHECK (building_length_ft IS NULL OR (building_length_ft > 0 AND building_length_ft <= 1000));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'building_width_ft'
  ) THEN
    ALTER TABLE listings ADD COLUMN building_width_ft numeric(10,2);
    ALTER TABLE listings ADD CONSTRAINT building_width_check 
      CHECK (building_width_ft IS NULL OR (building_width_ft > 0 AND building_width_ft <= 1000));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'building_size_sqft'
  ) THEN
    ALTER TABLE listings ADD COLUMN building_size_sqft integer;
    ALTER TABLE listings ADD CONSTRAINT building_size_check 
      CHECK (building_size_sqft IS NULL OR (building_size_sqft > 0 AND building_size_sqft <= 50000));
  END IF;
END $$;

-- Add driveway_status field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'driveway_status'
  ) THEN
    ALTER TABLE listings ADD COLUMN driveway_status driveway_status;
  END IF;
END $$;

-- Add multi-family fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'multi_family'
  ) THEN
    ALTER TABLE listings ADD COLUMN multi_family boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'unit_count'
  ) THEN
    ALTER TABLE listings ADD COLUMN unit_count integer;
    ALTER TABLE listings ADD CONSTRAINT unit_count_check 
      CHECK (unit_count IS NULL OR (unit_count >= 2 AND unit_count <= 100));
  END IF;
END $$;

-- Add number_of_floors field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'number_of_floors'
  ) THEN
    ALTER TABLE listings ADD COLUMN number_of_floors integer;
    ALTER TABLE listings ADD CONSTRAINT number_of_floors_check 
      CHECK (number_of_floors IS NULL OR (number_of_floors >= 1 AND number_of_floors <= 10));
  END IF;
END $$;

-- Add heating and cooling system fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'heating_type'
  ) THEN
    ALTER TABLE listings ADD COLUMN heating_type heating_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'cooling_type'
  ) THEN
    ALTER TABLE listings ADD COLUMN cooling_type cooling_type;
  END IF;
END $$;

-- Add appliances array field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'appliances'
  ) THEN
    ALTER TABLE listings ADD COLUMN appliances text[];
  END IF;
END $$;

-- Add cross_streets field if it doesn't exist (needed for dual purpose address field)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'cross_streets'
  ) THEN
    ALTER TABLE listings ADD COLUMN cross_streets text;
  END IF;
END $$;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_listings_year_built ON listings(year_built) WHERE year_built IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_driveway_status ON listings(driveway_status) WHERE driveway_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_multi_family ON listings(multi_family) WHERE multi_family = true;
CREATE INDEX IF NOT EXISTS idx_listings_building_size ON listings(building_size_sqft) WHERE building_size_sqft IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN listings.year_built IS 'Year the property was built. Replaces property_age with more precise data.';
COMMENT ON COLUMN listings.property_length_ft IS 'Length of property lot in feet. Used with property_width_ft to calculate lot_size_sqft.';
COMMENT ON COLUMN listings.property_width_ft IS 'Width of property lot in feet. Used with property_length_ft to calculate lot_size_sqft.';
COMMENT ON COLUMN listings.building_length_ft IS 'Length of building in feet. Used with building_width_ft to calculate building_size_sqft.';
COMMENT ON COLUMN listings.building_width_ft IS 'Width of building in feet. Used with building_length_ft to calculate building_size_sqft.';
COMMENT ON COLUMN listings.building_size_sqft IS 'Total building size in square feet. Can be calculated from length/width or entered manually.';
COMMENT ON COLUMN listings.driveway_status IS 'Type of driveway or parking arrangement for sale listings.';
COMMENT ON COLUMN listings.multi_family IS 'Indicates if this is a multi-family property with multiple units.';
COMMENT ON COLUMN listings.unit_count IS 'Number of units in a multi-family property. Only relevant when multi_family is true.';
COMMENT ON COLUMN listings.number_of_floors IS 'Number of floors/stories in the building.';
COMMENT ON COLUMN listings.heating_type IS 'Type of heating system installed in the property.';
COMMENT ON COLUMN listings.cooling_type IS 'Type of cooling/AC system installed in the property.';
COMMENT ON COLUMN listings.appliances IS 'Array of major appliances included with the property (e.g., refrigerator, stove, dishwasher, washer, dryer).';
COMMENT ON COLUMN listings.cross_streets IS 'For rentals: cross streets for privacy. For sales: exact property address.';
