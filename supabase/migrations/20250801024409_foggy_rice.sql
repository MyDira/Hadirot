/*
  # Add INSERT policy for static_pages table

  1. Security
    - Add policy for authenticated admin users to insert static pages
    - Only users with is_admin = true can create new static pages

  This migration adds the missing INSERT policy that allows admins to create new static pages.
*/

CREATE POLICY "Admins can insert static pages"
  ON static_pages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_admin = true
    )
  );