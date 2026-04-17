/*
  # Tighten profiles SELECT policy (PR 2c)

  ## Purpose
  Closes the profiles SELECT leak. Until now, the policy "Users can read all
  profiles" has `USING (true)` — any authenticated user can read every row of
  profiles including is_admin, is_banned, email, phone for every user. This
  migration replaces it with own-profile + admin-only access.

  ## Prerequisites already in place
  - public_profiles view grants SELECT to authenticated + anon and bypasses
    RLS (security_invoker = false). All user-facing listing joins already use
    it (PR 2a).
  - get_user_permissions RPC (SECURITY DEFINER) returns permission flags for
    any user. All cross-user permission checks already use it (PR 2b).

  ## What changes
  - Drop "Users can read all profiles" (USING true)
  - Add "Users can read own profile" (USING auth.uid() = id)
  - Add "Admins can read all profiles" (USING is_admin_cached())

  ## After this
  A plain `SELECT * FROM profiles` returns at most 1 row (own) for non-admin
  authenticated users. Admins still see all rows. Public-facing features
  continue working through public_profiles + RPCs.
*/

DROP POLICY IF EXISTS "Users can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can see their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_cached()));
