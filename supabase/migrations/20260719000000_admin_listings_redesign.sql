/*
  # Admin Listings dashboard redesign — richer search RPC + archive support

  Rebuilds `admin_search_listings` for the redesigned /admin listings dashboard
  (expandable cards, inline edit, revamped filters). Changes vs the previous
  version (20260716000000_admin_panel_search.sql):

    - Joins `listing_metrics_v1` so every residential row carries the 5-stat
      counts (impressions, direct_views, phone_reveals, map_pin_clicks) the
      cards now display. Commercial rows default these to 0 (not tracked).
    - Replaces the single `p_status` + `p_active` params with a multi-select
      `p_statuses text[]` covering: active | deactivated | pending | featured
      (OR semantics — a row matches if it satisfies ANY selected status).
      * pending     = NOT approved
      * active      = approved AND is_active
      * deactivated = approved AND NOT is_active
      * featured    = currently featured (implies active + approved)
    - Adds filters: `p_owner_id` (account assigned to), `p_min_bedrooms`
      (bed count), `p_contact_phone` (listing contact phone only — NOT the
      owner account phone, which the free-text search already covers).
    - Adds `bedrooms` as a sort option.
    - Payload now also carries `approved` (already part of to_jsonb) — no change,
      but the UI relies on it for the Pending state.

  Also drops the NOT NULL constraint on `commercial_listings.user_id` so admins
  can Archive a commercial listing (detach owner → user_id NULL), matching what
  residential `listings` already allows (20260116010826) and what the existing
  commercial anonymize-on-delete path already assumes.

  Both functions stay SECURITY DEFINER with an internal is_admin gate.
*/

-- Archive (detach owner) parity for commercial listings. No-op if already nullable.
ALTER TABLE public.commercial_listings ALTER COLUMN user_id DROP NOT NULL;

-- Drop the previous signature so we can recreate with the new parameter list.
DROP FUNCTION IF EXISTS public.admin_search_listings(
  text, text, text, text, text, date, date, text, text, int, int
);

CREATE OR REPLACE FUNCTION public.admin_search_listings(
  p_search        text    DEFAULT NULL,
  p_owner_role    text    DEFAULT NULL,   -- 'tenant' | 'landlord' | 'agent'
  p_listing_type  text    DEFAULT NULL,   -- 'rental' | 'sale'
  p_statuses      text[]  DEFAULT NULL,   -- any of: active|deactivated|pending|featured
  p_date_from     date    DEFAULT NULL,
  p_date_to       date    DEFAULT NULL,
  p_owner_id      uuid    DEFAULT NULL,   -- filter by assigned account
  p_min_bedrooms  int     DEFAULT NULL,   -- bed count (>=)
  p_contact_phone text    DEFAULT NULL,   -- listing contact phone (digits match)
  p_sort          text    DEFAULT 'created_at',  -- title|owner|price|created_at|is_active|featured|bedrooms
  p_dir           text    DEFAULT 'desc',
  p_limit         int     DEFAULT 25,
  p_offset        int     DEFAULT 0
)
RETURNS TABLE (listing jsonb, total_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin     boolean := false;
  v_term         text := nullif(btrim(coalesce(p_search, '')), '');
  v_digits       text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
  v_phone_digits text := nullif(regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g'), '');
  v_has_status   boolean := p_statuses IS NOT NULL AND array_length(p_statuses, 1) > 0;
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
          LIMIT 1),
        'impressions',    coalesce(m.impressions, 0),
        'direct_views',   coalesce(m.direct_views, 0),
        'phone_reveals',  coalesce(m.phone_reveals, 0),
        'map_pin_clicks', coalesce(m.map_pin_clicks, 0),
        'inquiries', (
          SELECT count(*) FROM listing_contact_submissions lcs
          WHERE lcs.listing_id = l.id)
      ) AS payload,
      l.id                                        AS id,
      l.user_id                                   AS user_id,
      o.role::text                                AS owner_role,
      l.listing_type::text                        AS listing_type,
      l.approved                                  AS is_approved,
      l.bedrooms                                  AS bedrooms,
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
        regexp_replace(coalesce(o.phone, ''), '\D', '', 'g'))            AS search_phone,
      regexp_replace(coalesce(l.contact_phone, ''), '\D', '', 'g')       AS contact_phone_digits
    FROM listings l
    LEFT JOIN profiles o ON o.id = l.user_id
    LEFT JOIN listing_metrics_v1 m ON m.listing_id = l.id

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
        'thumbnail_url', NULL,
        'impressions',    0,
        'direct_views',   0,
        'phone_reveals',  0,
        'map_pin_clicks', 0,
        'inquiries',      0
      ) AS payload,
      c.id                                        AS id,
      c.user_id                                   AS user_id,
      co.role::text                               AS owner_role,
      c.listing_type::text                        AS listing_type,
      c.approved                                  AS is_approved,
      c.bedrooms                                  AS bedrooms,
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
        regexp_replace(coalesce(co.phone, ''), '\D', '', 'g'))            AS search_phone,
      regexp_replace(coalesce(c.contact_phone, ''), '\D', '', 'g')       AS contact_phone_digits
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
    AND (p_owner_id IS NULL OR combined.user_id = p_owner_id)
    AND (p_min_bedrooms IS NULL OR combined.bedrooms >= p_min_bedrooms)
    AND (
      NOT v_has_status
      OR ('pending'     = ANY(p_statuses) AND combined.is_approved IS NOT TRUE)
      OR ('active'      = ANY(p_statuses) AND combined.is_approved AND combined.is_active)
      OR ('deactivated' = ANY(p_statuses) AND combined.is_approved AND NOT combined.is_active)
      OR ('featured'    = ANY(p_statuses) AND combined.is_currently_featured)
    )
    AND (p_date_from IS NULL OR combined.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR combined.created_at < (p_date_to + 1))
    AND (
      v_phone_digits IS NULL
      OR combined.contact_phone_digits LIKE '%' || v_phone_digits || '%'
    )
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
    CASE WHEN p_sort = 'bedrooms'   AND p_dir = 'asc'  THEN combined.bedrooms END ASC,
    CASE WHEN p_sort = 'bedrooms'   AND p_dir = 'desc' THEN combined.bedrooms END DESC,
    CASE WHEN p_sort = 'created_at' AND p_dir = 'asc'  THEN combined.created_at END ASC,
    CASE WHEN p_sort = 'is_active'  AND p_dir = 'asc'  THEN combined.is_active::int END ASC,
    CASE WHEN p_sort = 'is_active'  AND p_dir = 'desc' THEN combined.is_active::int END DESC,
    CASE WHEN p_sort = 'featured'   AND p_dir = 'asc'  THEN combined.is_currently_featured::int END ASC,
    CASE WHEN p_sort = 'featured'   AND p_dir = 'desc' THEN combined.is_currently_featured::int END DESC,
    combined.created_at DESC
  LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_listings(text,text,text,text[],date,date,uuid,int,text,text,text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_listings(text,text,text,text[],date,date,uuid,int,text,text,text,int,int) TO authenticated;
