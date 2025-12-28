/*
  # Update Lease Length Enum Values

  1. Changes
    - Drop existing lease_length_type enum values
    - Create new enum with updated values: short_term, long_term_annual, summer_rental, winter_rental
    - Migrate existing data to new enum values
    - Preserve all existing listings with appropriate mapping

  2. New Enum Values
    - 'short_term' - Short term leases (unchanged)
    - 'long_term_annual' - Long term/annual leases (replaces 1_year, 18_months, 2_years)
    - 'summer_rental' - Summer rental leases (new)
    - 'winter_rental' - Winter rental leases (new)

  3. Data Migration
    - short_term → short_term (no change)
    - 1_year → long_term_annual
    - 18_months → long_term_annual
    - 2_years → long_term_annual
    - NULL values remain NULL

  4. Notes
    - Field remains optional (nullable)
    - All existing listings are preserved
    - No data loss during migration
*/

-- Step 1: Create a temporary column to hold the new values
ALTER TABLE listings ADD COLUMN IF NOT EXISTS lease_length_temp text;

-- Step 2: Migrate existing data to temporary column with new mappings
UPDATE listings
SET lease_length_temp = CASE
  WHEN lease_length = 'short_term' THEN 'short_term'
  WHEN lease_length IN ('1_year', '18_months', '2_years') THEN 'long_term_annual'
  ELSE NULL
END
WHERE lease_length IS NOT NULL;

-- Step 3: Drop the old enum column (which drops the foreign key to the enum type)
ALTER TABLE listings DROP COLUMN IF EXISTS lease_length;

-- Step 4: Drop the old enum type (now safe since no columns reference it)
DROP TYPE IF EXISTS lease_length_type;

-- Step 5: Create the new enum type with updated values
CREATE TYPE lease_length_type AS ENUM (
  'short_term',
  'long_term_annual',
  'summer_rental',
  'winter_rental'
);

-- Step 6: Add back the lease_length column with the new enum type
ALTER TABLE listings ADD COLUMN lease_length lease_length_type;

-- Step 7: Copy data from temp column to new enum column
UPDATE listings
SET lease_length = lease_length_temp::lease_length_type
WHERE lease_length_temp IS NOT NULL;

-- Step 8: Drop the temporary column
ALTER TABLE listings DROP COLUMN IF EXISTS lease_length_temp;

-- Step 9: Add comment documenting the enum values
COMMENT ON TYPE lease_length_type IS 'Lease length options: short_term (Short Term), long_term_annual (Long Term/Annual), summer_rental (Summer Rental), winter_rental (Winter Rental)';
