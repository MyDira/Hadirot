/*
  # Remove the 10-day residential-rental field lock

  Product decision: owners may edit any field of their own listing at any time.

  The original lock (20260527150300_create_monetization_helper_fns.sql) made
  `is_listing_locked()` return true for non-admin callers on residential rentals
  older than 10 days, which the web client used to strip bedrooms, neighborhood,
  location, full_address, latitude, longitude and contact_phone out of the update
  payload.

  All client callers have been removed. The function itself is redefined to
  always return false rather than dropped, so any lingering caller (an older
  deployed bundle, an edge function, a future RLS policy) degrades to "not
  locked" instead of erroring on a missing function.
*/

CREATE OR REPLACE FUNCTION is_listing_locked(p_listing_id uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT false;
$$;

COMMENT ON FUNCTION is_listing_locked(uuid) IS
  'Deprecated — always returns false. Listing fields are never locked; owners can edit any field at any time. Retained only so stale callers keep working.';

GRANT EXECUTE ON FUNCTION is_listing_locked(uuid) TO authenticated, service_role;
