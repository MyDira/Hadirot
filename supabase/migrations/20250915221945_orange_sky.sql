/*
  # Add agency_id to listings table

  1. Changes
    - Add `agency_id` (uuid, optional) - links to agencies.id

  2. Security
    - Update RLS policies to allow agency owners to manage agency listings
    - Maintain existing user ownership policies
*/

-- Add agency_id to listings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'agency_id'
  ) THEN
    ALTER TABLE listings ADD COLUMN agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS listings_agency_id_idx ON listings(agency_id);

-- Update RLS policies for listings to include agency access
-- We need to modify existing policies to include agency owner access

-- Drop and recreate the listings insert policy
DROP POLICY IF EXISTS "Users can create listings" ON listings;

CREATE POLICY "Users can create listings"
  ON listings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uid() = user_id OR
    (
      agency_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = uid() 
        AND profiles.agency_id = listings.agency_id 
        AND profiles.can_manage_agency = true
      )
    )
  );

-- Drop and recreate the listings update policy
DROP POLICY IF EXISTS "Users can update own listings" ON listings;

CREATE POLICY "Users can update own listings"
  ON listings
  FOR UPDATE
  TO authenticated
  USING (
    uid() = user_id OR
    (
      agency_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = uid() 
        AND profiles.agency_id = listings.agency_id 
        AND profiles.can_manage_agency = true
      )
    ) OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = uid() AND profiles.is_admin = true
    )
  );

-- Drop and recreate the listings delete policy
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON listings;

CREATE POLICY "Users can delete own listings"
  ON listings
  FOR DELETE
  TO authenticated
  USING (
    uid() = user_id OR
    (
      agency_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = uid() 
        AND profiles.agency_id = listings.agency_id 
        AND profiles.can_manage_agency = true
      )
    ) OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = uid() AND profiles.is_admin = true
    )
  );