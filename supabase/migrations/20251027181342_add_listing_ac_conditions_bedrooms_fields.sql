/*
  # Add AC Type, Apartment Conditions, and Extended Bedroom Options

  ## Changes
  
  1. New Columns Added to listings table
    - `ac_type` (text, optional) - Type of air conditioning: 'central', 'split_unit', or 'window'
    - `apartment_conditions` (text array, optional) - Multiple condition tags: 'modern', 'renovated', 'large_rooms', 'high_ceilings', 'large_closets'
    - `additional_rooms` (integer, optional) - Additional rooms beyond bedrooms (for formats like 3+1, 4+2)
  
  2. Data Integrity
    - All new fields are optional (NULL allowed) for backward compatibility
    - CHECK constraint on ac_type to ensure only valid values
    - Array type for apartment_conditions allows multiple selections
    - Application-level validation will ensure apartment_conditions contains only valid values
  
  3. Notes
    - Existing listings will continue to work without these fields
    - The bedrooms field remains as integer, but the application will handle display formatting
    - For extended bedroom counts (3+1, 4+2, etc.), the additional_rooms field stores the +1 or +2 portion
*/

-- Add AC type column with constraint
ALTER TABLE listings 
ADD COLUMN IF NOT EXISTS ac_type text;

-- Add check constraint for valid AC types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'listings_ac_type_check'
  ) THEN
    ALTER TABLE listings 
    ADD CONSTRAINT listings_ac_type_check 
    CHECK (ac_type IS NULL OR ac_type IN ('central', 'split_unit', 'window'));
  END IF;
END $$;

-- Add apartment conditions as text array
ALTER TABLE listings 
ADD COLUMN IF NOT EXISTS apartment_conditions text[];

-- Add additional_rooms column to support extended bedroom formats like '3+1', '4+2'
-- This stores the '+1', '+2' portion separately from the main bedroom count
ALTER TABLE listings 
ADD COLUMN IF NOT EXISTS additional_rooms integer;

-- Add check constraint for additional_rooms (valid range 0-2)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'listings_additional_rooms_check'
  ) THEN
    ALTER TABLE listings 
    ADD CONSTRAINT listings_additional_rooms_check 
    CHECK (additional_rooms IS NULL OR (additional_rooms >= 0 AND additional_rooms <= 2));
  END IF;
END $$;

-- Create index on ac_type for filtering performance
CREATE INDEX IF NOT EXISTS idx_listings_ac_type ON listings(ac_type) WHERE ac_type IS NOT NULL;

-- Create GIN index on apartment_conditions for array filtering performance
CREATE INDEX IF NOT EXISTS idx_listings_apartment_conditions ON listings USING GIN(apartment_conditions) WHERE apartment_conditions IS NOT NULL;

-- Add comments to document the fields
COMMENT ON COLUMN listings.ac_type IS 'Air conditioning type: central, split_unit, or window';
COMMENT ON COLUMN listings.apartment_conditions IS 'Array of apartment condition tags: modern, renovated, large_rooms, high_ceilings, large_closets. Validation enforced at application level.';
COMMENT ON COLUMN listings.additional_rooms IS 'Additional rooms beyond bedrooms (for formats like 3+1, 4+2). Range: 0-2';