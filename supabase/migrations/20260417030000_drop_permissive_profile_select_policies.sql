/*
  # Drop permissive profiles SELECT policies (PR 2c follow-up)

  ## Purpose
  PR 2c (20260417020000) dropped the original "Users can read all profiles"
  policy and added own-profile + admin-read policies. But two other permissive
  SELECT policies on profiles exist that were created ad-hoc (not via
  migration files in this repo):

    - "Allow all SELECTs for authenticated users" — USING (true)
    - "Allow public read of listing owner info"  — USING (true)

  Either one overrides the tightened policies, leaving the leak open. Dropping
  both here to actually close the leak.

  ## After this
  profiles SELECT is gated by:
    - "Users can read own profile"      — authenticated, own row
    - "Admins can read all profiles"    — authenticated, admin check
  Public listing owner info continues to flow through public_profiles view.
*/

DROP POLICY IF EXISTS "Allow all SELECTs for authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Allow public read of listing owner info" ON public.profiles;
