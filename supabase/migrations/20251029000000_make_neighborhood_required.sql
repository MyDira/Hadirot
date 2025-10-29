/*
  # Make Neighborhood Field Required

  ## Changes

  1. Data Cleanup
    - Update any listings with NULL neighborhood to empty string

  2. Schema Update
    - Make neighborhood field NOT NULL with empty string default

  3. Notes
    - This ensures all new listings must have a neighborhood value
    - Application-level validation will enforce non-empty values
    - Existing listings with NULL will be set to empty string (to be updated by owners)
*/

-- Update any existing NULL neighborhoods to empty string
UPDATE listings
SET neighborhood = ''
WHERE neighborhood IS NULL;

-- Make neighborhood NOT NULL with default empty string
ALTER TABLE listings
ALTER COLUMN neighborhood SET DEFAULT '';

ALTER TABLE listings
ALTER COLUMN neighborhood SET NOT NULL;

-- Add comment to document the change
COMMENT ON COLUMN listings.neighborhood IS 'Neighborhood name - required field, cannot be NULL. Empty string indicates needs update.';
