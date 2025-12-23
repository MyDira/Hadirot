/*
  # Fix ac_type Constraint to Allow Empty String
  
  ## Problem
  HTML select elements with an empty "optional" option send empty string '' instead of NULL.
  The current constraint only allows NULL or specific values, causing inserts to fail.
  
  ## Solution
  Update the constraint to:
  1. Allow empty string '' as a valid value
  2. Add a trigger to automatically convert empty string to NULL for consistency
  
  ## Changes
  - Drop and recreate `listings_ac_type_check` constraint to allow empty string
  - Add trigger to normalize empty string to NULL on insert/update
  
  ## Risk Level
  LOW - Only relaxes constraint and adds data normalization
*/

-- Drop the existing constraint
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_ac_type_check;

-- Create updated constraint that allows empty string
ALTER TABLE listings ADD CONSTRAINT listings_ac_type_check 
  CHECK ((ac_type IS NULL) OR (ac_type = '') OR (ac_type = ANY (ARRAY['central'::text, 'split_unit'::text, 'window'::text])));

-- Create function to normalize ac_type (convert empty string to NULL)
CREATE OR REPLACE FUNCTION normalize_ac_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ac_type = '' THEN
    NEW.ac_type := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to normalize ac_type on insert/update
DROP TRIGGER IF EXISTS normalize_ac_type_trigger ON listings;
CREATE TRIGGER normalize_ac_type_trigger
  BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION normalize_ac_type();