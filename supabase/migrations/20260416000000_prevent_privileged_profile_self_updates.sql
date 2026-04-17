/*
  # Prevent privileged profile column self-changes (INSERT + UPDATE)

  ## Purpose
  Blocks authenticated users from escalating their own privileges via the
  profiles table. Two attack paths are closed here:

  1. UPDATE self-escalation. The UPDATE RLS policy only enforced row ownership
     (auth.uid() = id), so any authenticated user could execute
     `UPDATE profiles SET is_admin = true WHERE id = auth.uid()` and take over.
  2. INSERT race at first login. The INSERT RLS policy only enforces
     auth.uid() = id — an attacker with a fresh JWT but no profile row yet
     (common during OAuth first sign-in) can race and INSERT their own profile
     with is_admin = true before the app's own insert runs.

  ## Scope
  Protects these profiles columns:
    - is_admin
    - is_banned
    - can_feature_listings
    - max_featured_listings_per_user
    - can_manage_agency
    - can_post_sales

  For both INSERT and UPDATE, changes to these columns are only allowed when
  the caller is service_role, an existing admin, or a raw SQL session without
  JWT claims (migrations, superuser).

  ## Implementation
  - BEFORE UPDATE trigger uses IS DISTINCT FROM so benign re-writes of the
    same value pass; only actual value changes trip the guard.
  - BEFORE INSERT trigger coerces privileged columns to safe defaults instead
    of raising — the legitimate signup paths never set these columns anyway,
    so coercion is silent for good actors and neutralizes bad-actor attempts.
  - SECURITY DEFINER on both functions so the admin lookup bypasses RLS.
*/

CREATE OR REPLACE FUNCTION public.prevent_privileged_profile_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  jwt_claims_text text;
  role_claim text;
BEGIN
  jwt_claims_text := current_setting('request.jwt.claims', true);

  IF jwt_claims_text IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    role_claim := jwt_claims_text::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    role_claim := NULL;
  END;

  IF role_claim = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Permission denied: is_admin can only be changed by administrators or service role';
  END IF;

  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    RAISE EXCEPTION 'Permission denied: is_banned can only be changed by administrators or service role';
  END IF;

  IF NEW.can_feature_listings IS DISTINCT FROM OLD.can_feature_listings THEN
    RAISE EXCEPTION 'Permission denied: can_feature_listings can only be changed by administrators or service role';
  END IF;

  IF NEW.max_featured_listings_per_user IS DISTINCT FROM OLD.max_featured_listings_per_user THEN
    RAISE EXCEPTION 'Permission denied: max_featured_listings_per_user can only be changed by administrators or service role';
  END IF;

  IF NEW.can_manage_agency IS DISTINCT FROM OLD.can_manage_agency THEN
    RAISE EXCEPTION 'Permission denied: can_manage_agency can only be changed by administrators or service role';
  END IF;

  IF NEW.can_post_sales IS DISTINCT FROM OLD.can_post_sales THEN
    RAISE EXCEPTION 'Permission denied: can_post_sales can only be changed by administrators or service role';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privileged_updates ON public.profiles;

CREATE TRIGGER profiles_prevent_privileged_updates
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privileged_profile_updates();

COMMENT ON FUNCTION public.prevent_privileged_profile_updates() IS
  'Security barrier: blocks non-admin, non-service-role updates to privileged profile columns (is_admin, is_banned, can_feature_listings, max_featured_listings_per_user, can_manage_agency, can_post_sales). Prevents self-escalation via direct PostgREST UPDATE.';

CREATE OR REPLACE FUNCTION public.prevent_privileged_profile_inserts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  jwt_claims_text text;
  role_claim text;
BEGIN
  jwt_claims_text := current_setting('request.jwt.claims', true);

  IF jwt_claims_text IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    role_claim := jwt_claims_text::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    role_claim := NULL;
  END;

  IF role_claim = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  THEN
    RETURN NEW;
  END IF;

  NEW.is_admin := false;
  NEW.is_banned := false;
  NEW.can_feature_listings := false;
  NEW.max_featured_listings_per_user := NULL;
  NEW.can_manage_agency := false;
  NEW.can_post_sales := false;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privileged_inserts ON public.profiles;

CREATE TRIGGER profiles_prevent_privileged_inserts
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privileged_profile_inserts();

COMMENT ON FUNCTION public.prevent_privileged_profile_inserts() IS
  'Security barrier: coerces privileged profile columns (is_admin, is_banned, can_feature_listings, max_featured_listings_per_user, can_manage_agency, can_post_sales) to safe defaults on INSERT unless caller is service_role, an existing admin, or a raw SQL session. Prevents self-escalation via the first-login INSERT race.';
