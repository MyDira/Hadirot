/*
  # Harden public_profiles view for cross-user reads (PR 2a)

  ## Purpose
  Prepare the public_profiles view to be the canonical path for any client-side
  join that reads another user's profile data. After this change, all safe
  public-facing reads go through public_profiles and stay functional even when
  we later tighten profiles RLS (PR 2c) to own-profile + admin-only.

  ## What changes
  - Explicitly set security_invoker = false so the view always bypasses profiles
    RLS (previously implicit, now explicit and version-proof).
  - GRANT SELECT to the authenticated role (previously only granted to anon).

  ## What does NOT change
  - The view columns (id, full_name, role, agency) — same as before.
  - Profiles table RLS — still "Users can read all profiles" USING (true).
    The tightening happens in a later PR once client reads are migrated.
*/

ALTER VIEW public.public_profiles SET (security_invoker = false);

GRANT SELECT ON public.public_profiles TO authenticated;

COMMENT ON VIEW public.public_profiles IS
  'Safe public view of profiles exposing only id, full_name, role, agency. Bypasses profiles RLS via security_invoker=false. Granted to anon and authenticated. Use for any client-side join that needs another user''s display info — never join against profiles directly for user-facing reads.';
