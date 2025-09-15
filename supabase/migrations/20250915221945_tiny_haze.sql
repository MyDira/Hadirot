/*
  # Add agency fields to profiles table

  1. Changes
    - Add `agency_id` (uuid, optional) - links to agencies.id
    - Add `can_manage_agency` (boolean, default false) - controls agency UI access

  2. Security
    - Update RLS policies to allow admins to manage agency fields
    - Prevent regular users from modifying their own agency access
*/

-- Add agency fields to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'agency_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'can_manage_agency'
  ) THEN
    ALTER TABLE profiles ADD COLUMN can_manage_agency boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS profiles_agency_id_idx ON profiles(agency_id);
CREATE INDEX IF NOT EXISTS profiles_can_manage_agency_idx ON profiles(can_manage_agency);

-- Update existing RLS policies to handle agency fields
-- Note: We need to be careful not to break existing policies

-- Drop and recreate the user update policy to include agency field restrictions
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (uid() = id)
  WITH CHECK (
    uid() = id AND
    -- Prevent users from modifying their own agency access unless they're admin
    (
      (agency_id IS NOT DISTINCT FROM (SELECT agency_id FROM profiles WHERE id = uid())) AND
      (can_manage_agency IS NOT DISTINCT FROM (SELECT can_manage_agency FROM profiles WHERE id = uid()))
    ) OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = uid() AND profiles.is_admin = true
    )
  );