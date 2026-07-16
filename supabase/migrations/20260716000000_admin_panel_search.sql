/*
  # Admin panel server-side search (residential + commercial)

  admin_search_listings — one round trip for the admin Listings table. Unions
  residential `listings` and `commercial_listings` into a single result set so
  the admin can manage every listing (view/edit/activate/feature/delete) from
  one table. Commercial rows are tagged `__commercial: true` in the payload and
  carry synthesized `title`/`location`/`price` so the shared row renderer and
  the feature modal branch to the right table.

  Provides: comprehensive search (listing fields, owner fields,
  digits-normalized phones, exact UUID), filters, server-side sort incl. owner
  name, accurate total count, first image for thumbnails (residential).

  admin_list_agencies — distinct profile agency names for the Users filter.

  Both SECURITY DEFINER with an internal is_admin gate.

  Supersedes the earlier 20260611000000_admin_panel_search.sql (renamed to a
  fresh version to avoid a version collision with
  20260611000000_fix_enable_monetization_safeupdate.sql on main).
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
  WITH combined AS (
    -- Residential
    SELECT
      to_jsonb(l.*) || jsonb_build_object(
        '__commercial', false,
        'owner', CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', o.id, 'full_name', o.full_name, 'role', o.role,
          'agency', o.agency, 'email', o.email, 'phone', o.phone) END,
        'thumbnail_url', (
          SELECT li.image_url FROM listing_images li
          WHERE li.listing_id = l.id
          ORDER BY li.is_featured DESC, li.sort_order ASC, li.created_at ASC
          LIMIT 1)
      ) AS payload,
      l.id                                        AS id,
      o.role                                      AS owner_role,
      l.listing_type                              AS listing_type,
      (l.is_featured AND coalesce(l.featured_expires_at > now(), false)) AS is_currently_featured,
      l.is_active                                 AS is_active,
      l.created_at                                AS created_at,
      lower(coalesce(l.title, ''))                AS sort_title,
      lower(coalesce(o.full_name, ''))            AS sort_owner,
      coalesce(l.price, l.asking_price, 0)::numeric AS sort_price,
      lower(concat_ws(' ',
        l.title, l.location, l.neighborhood, l.cross_streets,
        l.full_address, l.contact_name, o.full_name, o.email, o.agency)) AS search_blob,
      concat(
        regexp_replace(coalesce(l.contact_phone, ''), '\D', '', 'g'), ' ',
        regexp_replace(coalesce(o.phone, ''), '\D', '', 'g'))            AS search_phone
    FROM listings l
    LEFT JOIN profiles o ON o.id = l.user_id

    UNION ALL

    -- Commercial
    SELECT
      to_jsonb(c.*) || jsonb_build_object(
        '__commercial', true,
        'title', coalesce(
          nullif(btrim(c.title), ''),
          replace(coalesce(c.commercial_space_type, 'Commercial'), '_', ' ')
            || ' — ' || coalesce(c.full_address, c.neighborhood, 'No address')),
        'location', coalesce(
          c.full_address,
          nullif(btrim(concat_ws(' & ', c.cross_street_a, c.cross_street_b)), ''),
          c.neighborhood, ''),
        'price', CASE WHEN c.listing_type = 'sale' THEN c.asking_price ELSE c.price END,
        'owner', CASE WHEN co.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', co.id, 'full_name', co.full_name, 'role', co.role,
          'agency', co.agency, 'email', co.email, 'phone', co.phone) END,
        'thumbnail_url', NULL
      ) AS payload,
      c.id                                        AS id,
      co.role                                     AS owner_role,
      c.listing_type                              AS listing_type,
      (c.is_featured AND coalesce(c.featured_expires_at > now(), false)) AS is_currently_featured,
      c.is_active                                 AS is_active,
      c.created_at                                AS created_at,
      lower(coalesce(nullif(btrim(c.title), ''), c.commercial_space_type, '')) AS sort_title,
      lower(coalesce(co.full_name, ''))           AS sort_owner,
      coalesce(CASE WHEN c.listing_type = 'sale' THEN c.asking_price ELSE c.price END, 0)::numeric AS sort_price,
      lower(concat_ws(' ',
        c.title, c.full_address, c.neighborhood, c.cross_street_a, c.cross_street_b,
        c.commercial_space_type, c.contact_name, co.full_name, co.email, co.agency)) AS search_blob,
      concat(
        regexp_replace(coalesce(c.contact_phone, ''), '\D', '', 'g'), ' ',
        regexp_replace(coalesce(co.phone, ''), '\D', '', 'g'))            AS search_phone
    FROM commercial_listings c
    LEFT JOIN profiles co ON co.id = c.user_id
  )
  SELECT
    combined.payload AS listing,
    count(*) OVER()  AS total_count
  FROM combined
  WHERE
    (p_owner_role IS NULL OR combined.owner_role = p_owner_role)
    AND (p_listing_type IS NULL OR combined.listing_type = p_listing_type)
    AND (p_status IS NULL
         OR (p_status = 'featured' AND combined.is_currently_featured)
         OR (p_status = 'standard' AND NOT combined.is_currently_featured))
    AND (p_active IS NULL OR combined.is_active = (p_active = 'yes'))
    AND (p_date_from IS NULL OR combined.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR combined.created_at < (p_date_to + 1))
    AND (
      v_term IS NULL
      OR combined.id::text = lower(v_term)
      OR combined.search_blob ILIKE '%' || v_term || '%'
      OR (v_digits IS NOT NULL AND length(v_digits) >= 3
          AND combined.search_phone LIKE '%' || v_digits || '%')
    )
  ORDER BY
    CASE WHEN p_sort = 'title'      AND p_dir = 'asc'  THEN combined.sort_title END ASC,
    CASE WHEN p_sort = 'title'      AND p_dir = 'desc' THEN combined.sort_title END DESC,
    CASE WHEN p_sort = 'owner'      AND p_dir = 'asc'  THEN combined.sort_owner END ASC,
    CASE WHEN p_sort = 'owner'      AND p_dir = 'desc' THEN combined.sort_owner END DESC,
    CASE WHEN p_sort = 'price'      AND p_dir = 'asc'  THEN combined.sort_price END ASC,
    CASE WHEN p_sort = 'price'      AND p_dir = 'desc' THEN combined.sort_price END DESC,
    CASE WHEN p_sort = 'created_at' AND p_dir = 'asc'  THEN combined.created_at END ASC,
    CASE WHEN p_sort = 'is_active'  AND p_dir = 'asc'  THEN combined.is_active::int END ASC,
    CASE WHEN p_sort = 'is_active'  AND p_dir = 'desc' THEN combined.is_active::int END DESC,
    CASE WHEN p_sort = 'featured'   AND p_dir = 'asc'  THEN combined.is_currently_featured::int END ASC,
    CASE WHEN p_sort = 'featured'   AND p_dir = 'desc' THEN combined.is_currently_featured::int END DESC,
    combined.created_at DESC
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
