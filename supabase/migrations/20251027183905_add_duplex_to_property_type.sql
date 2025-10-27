/*
  # Add Duplex to Property Type Enum

  ## Changes
  
  1. Updates to property_type enum
    - Add 'duplex' as a new valid property type option
    - Existing values remain: 'apartment_building', 'apartment_house', 'full_house'
  
  2. Data Integrity
    - Backward compatible - existing listings are unaffected
    - New option allows for more accurate property categorization
  
  3. Notes
    - Duplex represents a two-unit residential building
    - This is a non-destructive change to the enum type
*/

-- Add 'duplex' to the property_type enum
ALTER TYPE property_type ADD VALUE IF NOT EXISTS 'duplex';

-- Add comment to document the new value
COMMENT ON TYPE property_type IS 'Property type classification: apartment_building, apartment_house, full_house, duplex';