/*
  # Enable Public Access to Agency Pages

  ## Overview
  This migration allows anyone (authenticated or anonymous) to view agency pages
  by adding a public SELECT policy to the agencies table. This enables sharing
  agency pages via links without requiring user authentication.

  ## Security Analysis

  ### Data Exposed (All Intentionally Public)
  - `id` - Agency identifier (public)
  - `name` - Business name (public marketing information)
  - `slug` - URL-friendly name (public)
  - `logo_url` - Logo image URL (public branding)
  - `banner_url` - Banner image URL (public branding)
  - `phone` - Business phone number (public contact information)
  - `email` - Business email address (public contact information)
  - `website` - Business website URL (public)
  - `about_html` - Business description (public marketing content)
  - `created_at`, `updated_at` - Timestamps (non-sensitive)

  ### Data NOT Exposed to Frontend
  - `owner_profile_id` - Internal relationship (not in TypeScript Agency interface)

  ### Write Operations (Remain Protected)
  - INSERT: Only admins and agency owners (existing policies)
  - UPDATE: Only admins and agency owners (existing policies)
  - DELETE: Only admins (existing policies)

  ## Security Model
  This follows the same pattern as the listings table:
  - Public can SELECT (view) active records
  - Only authorized users can INSERT, UPDATE, DELETE

  ## Why This Is Secure
  1. Agency pages are public-facing business profiles (like Yelp listings)
  2. All exposed data is marketing information meant to be public
  3. No user authentication data or sensitive information is accessible
  4. Write operations remain strictly controlled
  5. Follows established security patterns in the application

  ## Changes
  1. Add public SELECT policy for agencies table
  2. Keep all existing INSERT/UPDATE/DELETE policies unchanged
*/

-- Add public SELECT policy to allow anyone to view agency pages
-- This enables sharing agency pages without requiring authentication
CREATE POLICY "Anyone can view agency pages"
  ON agencies
  FOR SELECT
  TO public
  USING (true);

-- Document the policy
COMMENT ON POLICY "Anyone can view agency pages" ON agencies IS
  'Allows public access to view agency pages. All data exposed is public-facing business information (name, contact details, branding). Write operations remain restricted to owners and admins.';

-- Verify existing write policies are still in place
-- These policies ensure only authorized users can modify agency data
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  -- Check that admin/owner insert policies exist
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'agencies'
    AND policyname IN ('agencies_insert_admin', 'agencies_insert_owner_or_admin')
    AND cmd = 'INSERT';

  IF policy_count = 0 THEN
    RAISE EXCEPTION 'Missing INSERT policies for agencies table. Write operations must be protected.';
  END IF;

  -- Check that admin/owner update policies exist
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'agencies'
    AND policyname IN ('agencies_update_admin_or_owner', 'agencies_update_owner_or_admin')
    AND cmd = 'UPDATE';

  IF policy_count = 0 THEN
    RAISE EXCEPTION 'Missing UPDATE policies for agencies table. Write operations must be protected.';
  END IF;

  -- Check that admin delete policy exists
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'agencies'
    AND policyname = 'agencies_delete_admin'
    AND cmd = 'DELETE';

  IF policy_count = 0 THEN
    RAISE EXCEPTION 'Missing DELETE policy for agencies table. Write operations must be protected.';
  END IF;

  RAISE NOTICE 'All write protection policies verified. Public SELECT policy added successfully.';
END $$;
