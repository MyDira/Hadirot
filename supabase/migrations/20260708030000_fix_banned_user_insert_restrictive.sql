/*
  # [P1 / Track-1] Make banned-user INSERT blocks functional (RESTRICTIVE)

  ## Finding (audit 01-database-rls.md)
  The ban-INSERT policies are PERMISSIVE, so they are OR-combined with the normal
  grant policy and cannot enforce a prohibition:
    - listings:            "Prevent banned users from inserting listings"
      (PERMISSIVE, CHECK NOT EXISTS(... is_banned ...)) OR-combined with
      "Users can create rental listings" (CHECK user_id = auth.uid()).
    - commercial_listings: "Banned users cannot insert commercial listings"
      (PERMISSIVE) OR-combined with
      "Authenticated users can insert own commercial listings"
      (CHECK auth.uid() = user_id).
  For a banned user inserting their own row the grant policy's CHECK is TRUE, so
  the INSERT succeeds. A PERMISSIVE policy can only grant; it can never block.

  ## Fix
  Recreate both ban-INSERT policies as RESTRICTIVE so they AND with the grant
  policy: the INSERT now requires (user owns the row) AND (user is not banned).

  ## Reversal (spirit)
  To undo: drop the RESTRICTIVE policies and recreate the original PERMISSIVE
  ones (reintroduces the non-functional block).

  ## Verification (manual)
    - As a banned test user: INSERT into listings / commercial_listings => fails.
    - As a normal user: INSERT succeeds.
*/

-- listings ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Prevent banned users from inserting listings" ON public.listings;
DROP POLICY IF EXISTS "block_banned_listing_inserts" ON public.listings;
CREATE POLICY "block_banned_listing_inserts"
  ON public.listings
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.is_banned = true
    )
  );

COMMENT ON POLICY "block_banned_listing_inserts" ON public.listings IS
  'RESTRICTIVE: prevents banned users from inserting rental listings. Replaces '
  'the non-functional PERMISSIVE "Prevent banned users..." policy. Audit Track-1 P1.';

-- commercial_listings ----------------------------------------------------------
DROP POLICY IF EXISTS "Banned users cannot insert commercial listings" ON public.commercial_listings;
DROP POLICY IF EXISTS "block_banned_commercial_inserts" ON public.commercial_listings;
CREATE POLICY "block_banned_commercial_inserts"
  ON public.commercial_listings
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.is_banned = true
    )
  );

COMMENT ON POLICY "block_banned_commercial_inserts" ON public.commercial_listings IS
  'RESTRICTIVE: prevents banned users from inserting commercial listings. '
  'Replaces the non-functional PERMISSIVE policy. Audit Track-1 P1.';
