/*
  # Add get_user_permissions RPC (PR 2b)

  ## Purpose
  Replaces direct client-side reads of the profiles table for cross-user
  permission checks. After PR 2c tightens the profiles SELECT RLS policy to
  own-profile + admin-only, these permission checks would break — callers
  cannot see another user's is_admin/can_feature_listings/etc. This RPC is the
  escape hatch: SECURITY DEFINER function that returns only permission flags
  (no PII) for any user, by UUID.

  ## Security tradeoff
  Any caller (authenticated OR anon) can learn the permission flags of any
  user by UUID. This is STRICTLY LESS than the current behavior, where the
  profiles SELECT policy `USING (true)` lets any authenticated user read every
  column of every row. The RPC narrows the exposure to 5 booleans + 1 int by
  UUID, no email/phone/name. UUIDs are not enumerable, so an attacker still
  needs a UUID (obtainable only via listings/agencies joins that already
  expose it) before learning anything.

  ## Call sites this enables
  - services/listings.ts — createListing / updateListing featuring permission
  - services/agencies.ts — getAgencyBySlug owner eligibility check
  - services/sales.ts   — canUserPostSales
*/

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id uuid)
RETURNS TABLE(
  is_admin boolean,
  is_banned boolean,
  can_feature_listings boolean,
  max_featured_listings_per_user integer,
  can_manage_agency boolean,
  can_post_sales boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    COALESCE(p.is_admin, false),
    COALESCE(p.is_banned, false),
    COALESCE(p.can_feature_listings, false),
    p.max_featured_listings_per_user,
    COALESCE(p.can_manage_agency, false),
    COALESCE(p.can_post_sales, false)
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid) TO authenticated, anon;

COMMENT ON FUNCTION public.get_user_permissions(uuid) IS
  'Returns permission flags (is_admin, is_banned, can_feature_listings, max_featured_listings_per_user, can_manage_agency, can_post_sales) for a given user UUID. SECURITY DEFINER so it works after profiles SELECT RLS is tightened. Callers need the UUID; they do not learn PII.';
