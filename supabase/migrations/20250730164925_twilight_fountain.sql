/*
  # Fix Favorites RLS Policies

  1. Security Updates
    - Enable RLS on favorites table if not already enabled
    - Add comprehensive RLS policies for favorites CRUD operations
    - Ensure users can only manage their own favorites

  2. Policy Details
    - Users can insert their own favorites
    - Users can select their own favorites
    - Users can delete their own favorites
    - All operations restricted to authenticated users only
*/

-- Enable RLS on favorites table
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can manage own favorites" ON favorites;
DROP POLICY IF EXISTS "Users can insert own favorites" ON favorites;
DROP POLICY IF EXISTS "Users can read own favorites" ON favorites;
DROP POLICY IF EXISTS "Users can delete own favorites" ON favorites;

-- Create comprehensive RLS policies for favorites
CREATE POLICY "Users can insert own favorites"
  ON favorites
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own favorites"
  ON favorites
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
  ON favorites
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Ensure the favorites table has proper indexes for performance
CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON favorites(user_id);
CREATE INDEX IF NOT EXISTS favorites_listing_id_idx ON favorites(listing_id);
CREATE INDEX IF NOT EXISTS favorites_user_listing_idx ON favorites(user_id, listing_id);