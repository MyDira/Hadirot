/*
  # [P0 / Track-1 C1] Fix listings SELECT RLS leak

  ## Finding (audit 01-database-rls.md)
  The permissive SELECT policy "Hide listings from banned users (except owners)"
  on public.listings has a USING clause that checks the *viewer's* ban status,
  not the listing owner's:

      USING ( user_id = auth.uid()
              OR NOT EXISTS (SELECT 1 FROM profiles
                             WHERE id = auth.uid() AND is_banned = true) )

  For any non-banned authenticated viewer the second disjunct is TRUE, so the
  whole predicate is TRUE. Because Postgres OR-combines PERMISSIVE SELECT
  policies, this blanket-true policy overrides the intended
  "Anyone can read active rental listings" restriction (is_active AND approved
  AND type). Net effect: every logged-in, non-banned user can read ALL listings
  including drafts, unapproved/rejected, deactivated rows, and owner-only PII
  columns (tenant_notes, rent_roll_data, contact_phone, full_address, ...).

  ## Fix
  1. DROP the broken permissive policy.
  2. Re-implement ban-hiding as a RESTRICTIVE policy that checks the LISTING
     OWNER's ban status. RESTRICTIVE policies are AND-combined with the
     permissive grant policies, so they can only further constrain — they can
     never widen access. The owner can still see their own rows; everyone else
     sees a banned owner's rows only through the normal permissive grants
     (which already require is_active AND approved), and this restrictive policy
     additionally hides them once the owner is banned.

  Kept intact (not touched here): "Users can read own listings",
  "Anyone can read active rental listings", "Admins can manage all listings".

  ## Reversal (spirit)
  To undo: DROP POLICY "hide_banned_owner_listings" ON listings; and recreate
  the old permissive policy (NOT recommended — it is the vulnerability).

  ## Verification (run manually against prod, read-only)
  Connect as a plain authenticated non-admin test user:
    - SELECT count(*) FROM listings;  -- should return only active+approved+own
    - an inactive/unapproved listing owned by another user must return 0 rows.
*/

-- 1. Remove the permissive policy whose USING reduces to TRUE for any viewer.
DROP POLICY IF EXISTS "Hide listings from banned users (except owners)" ON public.listings;

-- 2. Re-add ban-hiding as a RESTRICTIVE policy keyed on the OWNER's ban status.
--    RESTRICTIVE => AND-combined, so it cannot grant access on its own.
DROP POLICY IF EXISTS "hide_banned_owner_listings" ON public.listings;
CREATE POLICY "hide_banned_owner_listings"
  ON public.listings
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.listings.user_id
        AND p.is_banned = true
    )
  );

COMMENT ON POLICY "hide_banned_owner_listings" ON public.listings IS
  'RESTRICTIVE: hides a listing from non-owners once its OWNER is banned. '
  'Replaces the broken permissive "Hide listings from banned users" policy '
  'that checked the viewer instead of the owner and leaked all listings. '
  'Audit Track-1 P0 (C1).';
