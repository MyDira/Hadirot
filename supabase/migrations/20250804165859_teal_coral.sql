/*
  # Create safe public profiles view and update listings view

  1. New Views
    - `public_profiles` - Safe view of profiles with only public fields (id, full_name, role, agency)
    - Updated `listings_with_owner` - Now joins with public_profiles instead of profiles directly

  2. Security
    - Grant SELECT permission on public_profiles to anon role
    - No RLS needed on views - security handled by underlying tables
    - RLS on listings table controls which listings are visible
    - public_profiles only exposes safe, non-sensitive profile fields

  3. Changes
    - Replaces direct profiles join with public_profiles join
    - Ensures anonymous users can access owner info for visible listings
    - Maintains same data structure for application compatibility
*/

-- Create safe public profiles view with only public fields
CREATE OR REPLACE VIEW public_profiles AS
SELECT 
  id, 
  full_name, 
  role, 
  agency
FROM profiles;

-- Grant select permission to anonymous users
GRANT SELECT ON public_profiles TO anon;

-- Recreate listings_with_owner view to use public_profiles
CREATE OR REPLACE VIEW listings_with_owner AS
SELECT
  l.*,
  p.full_name as owner_name,
  p.role as owner_role,
  p.agency as owner_agency
FROM listings l
JOIN public_profiles p ON p.id = l.user_id;