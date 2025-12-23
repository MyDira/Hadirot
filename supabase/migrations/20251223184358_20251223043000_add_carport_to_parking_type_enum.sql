/*
  # Add 'carport' to parking_type Enum

  ## Problem
  The frontend sales listing form includes 'carport' as a parking option, but this value
  is not included in the parking_type enum in the database.

  ## Solution
  Add 'carport' as a valid enum value for parking_type.

  ## Changes
  - Add 'carport' to the parking_type enum using ALTER TYPE

  ## Risk Level
  LOW - Only adds a new enum value, no existing data is affected
*/

-- Add 'carport' to parking_type enum
ALTER TYPE parking_type ADD VALUE IF NOT EXISTS 'carport';
