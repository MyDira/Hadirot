/*
  # Admin panel server-side search

  admin_search_listings — one round trip for the admin Listings table:
  comprehensive search (listing fields, owner fields, digits-normalized
  phones, exact UUID), filters, server-side sort incl. owner name,
  accurate total count, first image for thumbnails.

  admin_list_agencies — distinct profile agency names for the Users filter
  (replaces fetching every profile row client-side).

  Both SECURITY DEFINER with an internal is_admin gate, matching the
  pattern in 20260604120000_create_subscription_trial_eligibility_fn.sql.
*/

CREATE OR REPLACE FUNCTION public.admin_search_listings(
  p_search       text DEFAULT NULL,
  p_owner_role   text DEFAULT NULL,   -- 'tenant' | 'landlord' | 'agent'
  p_listing_type text DEFAULT NULL,   -- 'rental' | 'sale'
  p_status       text DEFAULT NULL,   -- 'featured' | 'standard'
  p_active       text DEFAULT NULL,   -- 'yes' | 'no'
  p_date_from    date DEFAULT NULL,
  p_date_to      date DEFAULT NULL,
  p_sort         text DEFAULT 'created_at',  -- title|owner|price|created_at|is_active|featured
  p_dir          text DEFAULT 'desc',
  p_limit        int  DEFAULT 25,
  p_offset       int  DEFAULT 0
)
RETURNS TABLE (listing jsonb, total_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin boolean := false;
  v_term     text := nullif(btrim(coalesce(p_search, '')), '');
  v_digits   text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
BEGIN
  SELECT coalesce(p.is_admin, false) INTO v_is_admin
  FROM profiles p WHERE p.id = auth.uid();
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    to_jsonb(l.*) || jsonb_build_object(
      'owner', CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', o.id, 'full_name', o.full_name, 'role', o.role,
        'agency', o.agency, 'email', o.email, 'phone', o.phone) END,
      'thumbnail_url', (
        SELECT li.image_url FROM listing_images li
        WHERE li.listing_id = l.id
        ORDER BY li.is_featured DESC, li.sort_order ASC, li.created_at ASC
        LIMIT 1)
    ) AS listing,
    count(*) OVER() AS total_count
  FROM listings l
  LEFT JOIN profiles o ON o.id = l.user_id
  WHERE
    (p_owner_role IS NULL OR o.role = p_owner_role)
    AND (p_listing_type IS NULL OR l.listing_type = p_listing_type)
    AND (p_status IS NULL
         OR (p_status = 'featured' AND l.is_featured AND l.featured_expires_at > now())
         OR (p_status = 'standard' AND NOT (l.is_featured AND coalesce(l.featured_expires_at > now(), false))))
    AND (p_active IS NULL OR l.is_active = (p_active = 'yes'))
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR l.created_at < (p_date_to + 1))
    AND (
      v_term IS NULL
      OR l.id::text = lower(v_term)
      OR l.title ILIKE '%' || v_term || '%'
      OR l.location ILIKE '%' || v_term || '%'
      OR l.neighborhood ILIKE '%' || v_term || '%'
      OR coalesce(l.cross_streets, '') ILIKE '%' || v_term || '%'
      OR coalesce(l.full_address, '') ILIKE '%' || v_term || '%'
      OR coalesce(l.contact_name, '') ILIKE '%' || v_term || '%'
      OR coalesce(o.full_name, '') ILIKE '%' || v_term || '%'
      OR coalesce(o.email, '') ILIKE '%' || v_term || '%'
      OR coalesce(o.agency, '') ILIKE '%' || v_term || '%'
      OR (v_digits IS NOT NULL AND length(v_digits) >= 3 AND (
           regexp_replace(coalesce(l.contact_phone, ''), '\D', '', 'g') LIKE '%' || v_digits || '%'
        OR regexp_replace(coalesce(o.phone, ''), '\D', '', 'g') LIKE '%' || v_digits || '%'))
    )
  ORDER BY
    CASE WHEN p_sort = 'title'      AND p_dir = 'asc'  THEN lower(l.title) END ASC,
    CASE WHEN p_sort = 'title'      AND p_dir = 'desc' THEN lower(l.title) END DESC,
    CASE WHEN p_sort = 'owner'      AND p_dir = 'asc'  THEN lower(coalesce(o.full_name, '')) END ASC,
    CASE WHEN p_sort = 'owner'      AND p_dir = 'desc' THEN lower(coalesce(o.full_name, '')) END DESC,
    CASE WHEN p_sort = 'price'      AND p_dir = 'asc'  THEN coalesce(l.price, l.asking_price, 0) END ASC,
    CASE WHEN p_sort = 'price'      AND p_dir = 'desc' THEN coalesce(l.price, l.asking_price, 0) END DESC,
    CASE WHEN p_sort = 'created_at' AND p_dir = 'asc'  THEN l.created_at END ASC,
    CASE WHEN p_sort = 'is_active'  AND p_dir = 'asc'  THEN l.is_active::int END ASC,
    CASE WHEN p_sort = 'is_active'  AND p_dir = 'desc' THEN l.is_active::int END DESC,
    CASE WHEN p_sort = 'featured'   AND p_dir = 'asc'  THEN (l.is_featured AND coalesce(l.featured_expires_at > now(), false))::int END ASC,
    CASE WHEN p_sort = 'featured'   AND p_dir = 'desc' THEN (l.is_featured AND coalesce(l.featured_expires_at > now(), false))::int END DESC,
    l.created_at DESC
  LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_agencies()
RETURNS TABLE (agency text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  SELECT coalesce(p.is_admin, false) INTO v_is_admin
  FROM profiles p WHERE p.id = auth.uid();
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT DISTINCT pr.agency FROM profiles pr
  WHERE pr.agency IS NOT NULL AND btrim(pr.agency) <> ''
  ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_listings(text,text,text,text,text,date,date,text,text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_listings(text,text,text,text,text,date,date,text,text,int,int) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_list_agencies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_agencies() TO authenticated;
