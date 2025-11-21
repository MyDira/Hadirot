/*
  # Fix short_urls RLS policies for admin users

  1. Security Changes
    - Add policy to allow authenticated admin users to INSERT short URLs
    - This enables the WhatsApp Digest Manager to create short URLs for collections
    - Maintains security by restricting INSERT to admin users only

  2. Important Notes
    - The existing SELECT policy allows anyone to read short URLs (needed for public redirects)
    - Service role policies remain unchanged
    - This fix enables client-side short URL creation from the DigestManager interface
*/

-- Drop the restrictive service_role-only INSERT policy
DROP POLICY IF EXISTS "Service role can insert short URLs" ON short_urls;

-- Create new policy: Authenticated admin users can insert short URLs
CREATE POLICY "Authenticated admins can insert short URLs"
  ON short_urls
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Also allow service role to insert (for edge functions)
CREATE POLICY "Service role can insert short URLs"
  ON short_urls
  FOR INSERT
  TO service_role
  WITH CHECK (true);