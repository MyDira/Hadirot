/*
  # Allow Admins to Edit All Listing Images

  1. New Policies
    - Add policy to allow admins to manage listing images for any listing
    - Enables admins to edit listings owned by other users

  2. Security
    - Maintains existing user permissions
    - Only affects admin users (is_admin = true)
    - Required for admin panel edit functionality
*/

-- Add policy to allow admins to manage all listing images
CREATE POLICY "Admins can manage all listing images"
  ON listing_images FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Add comment for documentation
COMMENT ON POLICY "Admins can manage all listing images" ON listing_images IS
'Allows admin users to manage listing images for any listing, enabling them to edit listings owned by other users through the admin panel.';
