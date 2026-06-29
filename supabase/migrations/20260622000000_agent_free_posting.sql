/*
  # Agent-free posting

  Lets agents post residential rentals for free (legacy behavior, normal
  admin-controlled expiration) while landlords keep paying, WITHOUT deleting
  any of the paid Agent/VIP subscription machinery.

  Two new switches + one helper:

    1. admin_settings.charge_agents (default false)
       The "flip a switch later" master control. While false, anyone who
       qualifies as an agent posts free (payment_kind stays NULL, exactly like
       the pre-monetization path). Flip to true and agents fall back into the
       existing subscription / trial / pay-at-posting flow — all that code is
       left intact, just unreachable for agents until this is on.

    2. profiles.free_posting_agent (default false)
       Per-user manual override an admin can set from the user-management
       screen to mark someone as a free-posting agent regardless of role or
       volume.

    3. get_user_lifetime_listing_count(uuid)
       Lifetime listing count for a user across BOTH listing tables
       (listings = rentals + sales, commercial_listings), any status. Used by
       the posting gate's volume rule (>= 3 lifetime listings => treat as
       agent). SECURITY DEFINER so the count is reliable regardless of RLS.

  This migration is purely additive. It does NOT touch the monetization master
  switch, the enable/disable RPCs, or any existing payment logic. If
  charge_agents is left false but the monetization master switch is also off,
  behavior is unchanged (everyone posts legacy).
*/

-- ---------------------------------------------------------------
-- 1. admin_settings.charge_agents — the future "charge agents" switch.
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_settings' AND column_name = 'charge_agents'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN charge_agents boolean NOT NULL DEFAULT false;
  END IF;
END $$;

COMMENT ON COLUMN admin_settings.charge_agents IS
  'When false (default), users who qualify as agents (role=agent OR free_posting_agent OR >=3 lifetime listings) post residential rentals for free with normal expiration. When true, agents fall back into the existing paid subscription/trial/pay flow. Landlords are unaffected by this switch.';

-- ---------------------------------------------------------------
-- 2. profiles.free_posting_agent — per-user admin override.
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'free_posting_agent'
  ) THEN
    ALTER TABLE profiles ADD COLUMN free_posting_agent boolean NOT NULL DEFAULT false;
  END IF;
END $$;

COMMENT ON COLUMN profiles.free_posting_agent IS
  'Admin-set flag marking a user as a free-posting agent. When true (and admin_settings.charge_agents is false), the user posts residential rentals for free regardless of role or listing volume.';

-- ---------------------------------------------------------------
-- 3. get_user_lifetime_listing_count — sum across both listing tables.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_lifetime_listing_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (
    (SELECT COUNT(*) FROM listings WHERE user_id = p_user_id)
    +
    (SELECT COUNT(*) FROM commercial_listings WHERE user_id = p_user_id)
  )::integer;
$function$;

GRANT EXECUTE ON FUNCTION public.get_user_lifetime_listing_count(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_user_lifetime_listing_count(uuid) IS
  'Lifetime count of all listings a user has ever created across listings (rentals + sales) and commercial_listings, any status. Used by the posting gate''s agent volume rule.';
