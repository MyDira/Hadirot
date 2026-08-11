/*
  # Keep profiles.email in sync with auth.users.email

  ## Purpose
  Users can now change their email address from Account -> Settings. The change
  goes through Supabase Auth (auth.users.email), but public.profiles.email is a
  mirror that was only ever written once, at signup, by the client. Nothing kept
  the two in step.

  That mirror is not cosmetic. Every transactional email the app sends reads
  profiles.email, not auth.users.email:
    - send-deactivation-emails  (listing deactivation notices)
    - send-enhanced-digest / send-daily-admin-digest
    - the payment + subscription functions
    - the admin panel, concierge, and sales-permission views
  A stale mirror means all of that mail keeps going to an address the user no
  longer controls, while their login moves to the new one.

  ## What this does
  1. Backfills any profiles.email rows that already drifted from auth.users.
  2. Adds an AFTER UPDATE trigger on auth.users that mirrors every future email
     change into profiles.email. This is deliberately the *only* sync point, so
     it fires no matter how the change arrives: the settings form, a
     confirmation link clicked days later on another device, an admin edit in
     the Supabase dashboard, or the GoTrue admin API.
  3. Makes profiles.email derived from the client's point of view. Callers may
     only write a value that already matches auth.users.email for that row, so a
     user cannot repoint their profile at an address they don't own -- which
     would quietly redirect their own transactional mail -- via a direct
     PostgREST UPDATE.

  ## Safety note on the auth.users trigger
  The sync function swallows its own errors. A trigger on auth.users that raised
  would abort the auth write that fired it, which could leave a user unable to
  change their email at all. Mirroring is therefore best-effort; part 3 is what
  actually enforces that profiles.email can never hold a value the user hasn't
  proven they own.
*/

-- ============================================================================
-- Part A: Backfill rows that already drifted
-- ============================================================================
UPDATE public.profiles p
SET email = u.email,
    updated_at = now()
FROM auth.users u
WHERE u.id = p.id
  AND p.email IS DISTINCT FROM u.email;

-- ============================================================================
-- Part B: Mirror all future auth.users email changes into profiles
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_auth_email_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  BEGIN
    UPDATE public.profiles
    SET email = NEW.email,
        updated_at = now()
    WHERE id = NEW.id
      AND email IS DISTINCT FROM NEW.email;
  EXCEPTION WHEN OTHERS THEN
    -- Never abort the auth write. Log and move on.
    RAISE WARNING 'sync_auth_email_to_profile failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_sync_email_to_profile ON auth.users;

CREATE TRIGGER users_sync_email_to_profile
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_auth_email_to_profile();

COMMENT ON FUNCTION public.sync_auth_email_to_profile() IS
  'Mirrors auth.users.email into profiles.email. profiles.email is what every transactional-email path reads, so it must follow the login address. Best-effort: errors are logged, never raised, so a sync failure can never abort the underlying auth write.';

-- ============================================================================
-- Part C: Treat profiles.email as derived -- clients may only write the value
-- that already lives on their auth.users row.
--
-- Rewrites public.prevent_privileged_profile_updates() from
-- 20260416000000_prevent_privileged_profile_self_updates.sql, adding the email
-- check. The existing privileged-column checks are unchanged.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_privileged_profile_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  jwt_claims_text text;
  role_claim text;
  auth_email text;
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

  -- profiles.email is a mirror of auth.users.email, maintained by
  -- users_sync_email_to_profile. Let a write through only when it agrees with
  -- the login address that Supabase Auth has already verified for this row.
  -- Anything else is an attempt to redirect someone's transactional mail.
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    SELECT u.email INTO auth_email FROM auth.users u WHERE u.id = NEW.id;

    IF lower(COALESCE(NEW.email, '')) IS DISTINCT FROM lower(COALESCE(auth_email, '')) THEN
      RAISE EXCEPTION 'Permission denied: email follows the account login address and cannot be set directly. Change it through Account Settings.';
    END IF;
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

COMMENT ON FUNCTION public.prevent_privileged_profile_updates() IS
  'Security barrier: blocks non-admin, non-service-role updates to privileged profile columns (is_admin, is_banned, can_feature_listings, max_featured_listings_per_user, can_manage_agency, can_post_sales), and pins profiles.email to the verified auth.users.email for that row. Prevents self-escalation and mail redirection via direct PostgREST UPDATE.';
