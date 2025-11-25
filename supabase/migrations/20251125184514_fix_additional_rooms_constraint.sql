/*
  # Fix Additional Rooms Constraint to Support UI Range

  ## Problem
  The existing constraint on `listings.additional_rooms` only allows values 0-2,
  but the UI dropdown in PostListing.tsx and EditListing.tsx offers options for
  +1, +2, +3, and +4 (values 1-4). This causes a constraint violation error
  (23514) when users select +3 or +4.

  ## Changes
  1. Drop the existing `listings_additional_rooms_check` constraint
  2. Add new constraint allowing values 0-4 (matching UI capabilities)
  3. Maintain NULL as a valid value for backward compatibility

  ## Valid Values After Migration
  - NULL (field is optional)
  - 0 (no additional rooms)
  - 1 (+1 additional room)
  - 2 (+2 additional rooms)
  - 3 (+3 additional rooms)
  - 4 (+4 additional rooms)

  ## Rollback Instructions
  To rollback this migration, run:
  ```sql
  ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_additional_rooms_check;
  ALTER TABLE listings ADD CONSTRAINT listings_additional_rooms_check
    CHECK (additional_rooms IS NULL OR (additional_rooms >= 0 AND additional_rooms <= 2));
  ```
*/

-- Drop the existing constraint that only allows 0-2
ALTER TABLE listings
DROP CONSTRAINT IF EXISTS listings_additional_rooms_check;

-- Add new constraint allowing 0-4 to match UI dropdown options
ALTER TABLE listings
ADD CONSTRAINT listings_additional_rooms_check
CHECK (additional_rooms IS NULL OR (additional_rooms >= 0 AND additional_rooms <= 4));

-- Update column comment to reflect new valid range
COMMENT ON COLUMN listings.additional_rooms IS 'Additional rooms beyond bedrooms (for formats like 3+1, 4+2). Range: 0-4. NULL indicates no additional rooms.';