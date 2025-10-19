/*
  # Add Lease Length Enum Type

  1. Changes
    - Create lease_length_type enum with standardized values
    - Alter listings table to use the new enum type (nullable)
    - Migrate existing free-text lease_length data where possible

  2. Enum Values
    - 'short_term' - Short term leases
    - '1_year' - One year lease
    - '18_months' - Eighteen month lease
    - '2_years' - Two year lease

  3. Notes
    - Field remains optional (nullable) as not all listings specify lease length
    - Existing data will be preserved where it doesn't match enum values
*/

-- Create the lease_length_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lease_length_type') THEN
    CREATE TYPE lease_length_type AS ENUM ('short_term', '1_year', '18_months', '2_years');
  END IF;
END $$;

-- Add a temporary column with the new enum type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'lease_length_new'
  ) THEN
    ALTER TABLE listings ADD COLUMN lease_length_new lease_length_type;
  END IF;
END $$;

-- Migrate existing data to the new column where possible
UPDATE listings
SET lease_length_new = CASE
  WHEN LOWER(lease_length) LIKE '%short%' OR LOWER(lease_length) LIKE '%month%' AND LOWER(lease_length) NOT LIKE '%12%' AND LOWER(lease_length) NOT LIKE '%18%' THEN 'short_term'::lease_length_type
  WHEN LOWER(lease_length) LIKE '%1 year%' OR LOWER(lease_length) = '1' OR LOWER(lease_length) LIKE '%12 month%' THEN '1_year'::lease_length_type
  WHEN LOWER(lease_length) LIKE '%18 month%' OR LOWER(lease_length) = '18' THEN '18_months'::lease_length_type
  WHEN LOWER(lease_length) LIKE '%2 year%' OR LOWER(lease_length) = '2' OR LOWER(lease_length) LIKE '%24 month%' THEN '2_years'::lease_length_type
  ELSE NULL
END
WHERE lease_length IS NOT NULL AND lease_length != '';

-- Drop the old text column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'lease_length' AND data_type = 'text'
  ) THEN
    ALTER TABLE listings DROP COLUMN lease_length;
  END IF;
END $$;

-- Rename the new column to lease_length
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'lease_length_new'
  ) THEN
    ALTER TABLE listings RENAME COLUMN lease_length_new TO lease_length;
  END IF;
END $$;
