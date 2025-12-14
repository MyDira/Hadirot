/*
  # Add Sales Property Type Enum Values

  ## Overview
  This migration adds new property type enum values that accurately represent 
  unit count for sales listings (single-family, two-family, three-family, four-family).

  ## Changes
  1. Add new enum values to property_type:
     - single_family - Single-family home (1 unit)
     - two_family - Two-family home (2 units)
     - three_family - Three-family home (3 units)
     - four_family - Four-family home (4 units)
  
  2. These values are semantically correct for describing the number of units
     in a property, while keeping the existing condo and co_op values.

  ## Backwards Compatibility
  - Existing values remain intact
  - No data migration needed as this adds new values only
*/

DO $$ BEGIN
  -- Add single_family if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'single_family' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'property_type')
  ) THEN
    ALTER TYPE property_type ADD VALUE IF NOT EXISTS 'single_family';
  END IF;

  -- Add two_family if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'two_family' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'property_type')
  ) THEN
    ALTER TYPE property_type ADD VALUE IF NOT EXISTS 'two_family';
  END IF;

  -- Add three_family if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'three_family' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'property_type')
  ) THEN
    ALTER TYPE property_type ADD VALUE IF NOT EXISTS 'three_family';
  END IF;

  -- Add four_family if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'four_family' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'property_type')
  ) THEN
    ALTER TYPE property_type ADD VALUE IF NOT EXISTS 'four_family';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE property_type IS 'Property types including rental (apartment_building, apartment_house, full_house, duplex, basement) and sales (single_family, two_family, three_family, four_family, condo, co_op)';
