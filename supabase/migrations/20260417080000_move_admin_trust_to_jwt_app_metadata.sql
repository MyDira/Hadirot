-- Move admin trust root from profiles.is_admin to auth.users.raw_app_meta_data.
--
-- The profiles.is_admin column stays populated (used for UI display) but is no
-- longer the source of truth. After this migration:
--
--   Authoritative:  auth.users.raw_app_meta_data.is_admin (service-role-only
--                   write, flows into JWT app_metadata claim unforgeably)
--   Derived:        profiles.is_admin (synced by trigger, used for client UI)
--
-- Transition strategy:
--   is_admin_cached() and require_admin() check the JWT claim FIRST, then fall
--   back to profiles.is_admin. This means admins with active sessions keep
--   their access immediately (via the profiles fallback) and automatically
--   upgrade to JWT-based auth on their next login / session refresh.
--
-- After a week or so, the fallback can be removed in a follow-up migration
-- once all live JWTs have the claim.

-- ============================================================================
-- Part A: Backfill existing admins into auth.users.raw_app_meta_data
-- ============================================================================
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('is_admin', true)
FROM public.profiles p
WHERE p.id = u.id
  AND p.is_admin = true
  AND COALESCE(u.raw_app_meta_data->>'is_admin', 'false') <> 'true';

-- ============================================================================
-- Part B: Sync trigger. Keep auth.users.raw_app_meta_data in step with
-- profiles.is_admin for every future INSERT/UPDATE.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_profile_is_admin_to_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE' AND NEW.is_admin IS DISTINCT FROM OLD.is_admin) THEN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('is_admin', COALESCE(NEW.is_admin, false))
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_is_admin_to_auth ON public.profiles;

CREATE TRIGGER profiles_sync_is_admin_to_auth
  AFTER INSERT OR UPDATE OF is_admin ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_is_admin_to_auth();

-- ============================================================================
-- Part C: Replace is_admin_cached() to read the JWT claim first, then fall
-- back to profiles.is_admin during the transition.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_admin_cached()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    -- Preferred path: trust the JWT claim
    NULLIF(
      (current_setting('request.jwt.claims', true))::jsonb
        -> 'app_metadata' ->> 'is_admin',
      ''
    )::boolean,
    -- Fallback: look up profiles (keeps active sessions working until the
    -- JWT they're holding is refreshed with the new claim)
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    ),
    false
  );
$$;

-- ============================================================================
-- Part D: Replace require_admin() similarly. Keep the same public signature
-- and error message so callers don't notice any change.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT public.is_admin_cached() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_cached() TO authenticated;
GRANT EXECUTE ON FUNCTION public.require_admin() TO authenticated;

COMMENT ON FUNCTION public.is_admin_cached() IS
  'Admin check with JWT-first, profiles-fallback resolution. After transition period, drop the profiles fallback in a follow-up migration.';

COMMENT ON FUNCTION public.sync_profile_is_admin_to_auth() IS
  'Mirrors profiles.is_admin changes to auth.users.raw_app_meta_data.is_admin so the JWT claim stays in sync with the display value.';
