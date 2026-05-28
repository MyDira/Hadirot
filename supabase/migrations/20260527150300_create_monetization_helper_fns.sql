/*
  # Monetization helper functions

  1. `is_phone_trial_eligible(p_phone_e164 text) RETURNS boolean`
     - Returns true if the phone has NO active rental listing and NO rental
       listing deactivated within the last 30 days.
     - Used by:
        - Wizard pre-post to decide whether to show "Free 14-day trial" or
          "Pay $25" branch.
        - The grandfather migration's edge cases.
     - Called from RLS-aware authenticated contexts AND from service_role
       (webhook + cron). Marked SECURITY DEFINER + STABLE.

  2. `is_listing_locked(p_listing_id uuid) RETURNS boolean`
     - Returns true if the residential rental listing is older than 10 days
       AND the calling user is NOT an admin. Used by the listings service
       to gate edits to bedrooms, neighborhood, location, full_address, lat/long,
       and contact_phone.
     - Returns false for non-rental listings (lock is rentals-only).
*/

CREATE OR REPLACE FUNCTION is_phone_trial_eligible(p_phone_e164 text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM listings
    WHERE contact_phone_e164 = p_phone_e164
      AND listing_type = 'rental'
      AND (
        is_active = true
        OR (deactivated_at IS NOT NULL AND deactivated_at > NOW() - INTERVAL '30 days')
      )
  );
$$;

COMMENT ON FUNCTION is_phone_trial_eligible(text) IS
  'Returns true if the phone has no rental listing active or deactivated within the last 30 days. Drives the 14-day free trial gate.';

GRANT EXECUTE ON FUNCTION is_phone_trial_eligible(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION is_listing_locked(p_listing_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing_type text;
  v_created_at timestamptz;
  v_is_admin boolean;
BEGIN
  -- Caller is admin? Locks don't apply.
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF v_is_admin THEN
    RETURN false;
  END IF;

  SELECT listing_type::text, created_at INTO v_listing_type, v_created_at
    FROM listings WHERE id = p_listing_id;

  -- Listing not found OR not a rental → not locked.
  IF NOT FOUND OR v_listing_type <> 'rental' THEN
    RETURN false;
  END IF;

  RETURN v_created_at IS NOT NULL AND v_created_at < NOW() - INTERVAL '10 days';
END;
$$;

COMMENT ON FUNCTION is_listing_locked(uuid) IS
  'Returns true if a residential-rental listing is >10 days old and the caller is not an admin. Used to gate edits to bedrooms, location, phone.';

GRANT EXECUTE ON FUNCTION is_listing_locked(uuid) TO authenticated, service_role;
