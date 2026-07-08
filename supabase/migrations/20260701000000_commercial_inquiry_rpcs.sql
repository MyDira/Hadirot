/*
  # Commercial-aware inquiry RPCs (M10)

  Makes the two owner-facing inquiry RPCs count/return commercial contact
  submissions in addition to residential ones, so commercial owners see an
  inquiry count + list on their dashboard (parity with residential).

  Both changes are additive: the residential branches are byte-for-byte the same,
  so residential behavior is unchanged. Commercial submissions live in
  listing_contact_submissions.commercial_listing_id (added in the launch migration).
*/

-- Owner inquiry counts: union residential + commercial, keyed by each listing id.
CREATE OR REPLACE FUNCTION public.get_owner_listing_inquiry_counts()
 RETURNS TABLE(listing_id uuid, inquiry_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT l.id AS listing_id, COALESCE(COUNT(lcs.id)::integer, 0) AS inquiry_count
  FROM listings l
  LEFT JOIN listing_contact_submissions lcs ON lcs.listing_id = l.id
  WHERE l.user_id = auth.uid()
  GROUP BY l.id
  UNION ALL
  SELECT cl.id AS listing_id, COALESCE(COUNT(lcs.id)::integer, 0) AS inquiry_count
  FROM commercial_listings cl
  LEFT JOIN listing_contact_submissions lcs ON lcs.commercial_listing_id = cl.id
  WHERE cl.user_id = auth.uid()
  GROUP BY cl.id;
END;
$function$;

-- Inquiries for one listing: resolve the id in either table, enforce ownership,
-- then return submissions from the matching column.
CREATE OR REPLACE FUNCTION public.get_listing_inquiries(p_listing_id uuid)
 RETURNS TABLE(user_name text, user_phone text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id uuid;
  v_is_commercial boolean := false;
BEGIN
  SELECT l.user_id INTO v_owner_id FROM listings l WHERE l.id = p_listing_id;

  IF v_owner_id IS NULL THEN
    SELECT cl.user_id INTO v_owner_id FROM commercial_listings cl WHERE cl.id = p_listing_id;
    v_is_commercial := true;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  IF v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied. You do not own this listing.';
  END IF;

  RETURN QUERY
  SELECT lcs.user_name, lcs.user_phone, lcs.created_at
  FROM listing_contact_submissions lcs
  WHERE (NOT v_is_commercial AND lcs.listing_id = p_listing_id)
     OR (v_is_commercial AND lcs.commercial_listing_id = p_listing_id)
  ORDER BY lcs.created_at DESC;
END;
$function$;
