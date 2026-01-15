/*
  # Update ensure_agency_for_owner to Check Permission

  1. Changes
    - Update the ensure_agency_for_owner RPC function to check can_manage_agency permission
    - Only users with can_manage_agency=true or admins can create/ensure agencies
    - This prevents users without permission from creating agencies

  2. Security
    - Enforces permission checks at the database level
    - Prevents unauthorized agency creation
*/

CREATE OR REPLACE FUNCTION public.ensure_agency_for_owner(p_owner uuid)
RETURNS agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_agency public.agencies;
  v_prof   public.profiles;
  v_name   text;
  v_slug   text;
BEGIN
  -- caller must be self or admin
  IF p_owner IS DISTINCT FROM auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles ap
      WHERE ap.id = auth.uid() AND COALESCE(ap.is_admin, FALSE) = TRUE
    ) THEN
      RAISE EXCEPTION 'not allowed';
    END IF;
  END IF;

  -- Check if user has permission to manage agencies
  SELECT * INTO v_prof FROM public.profiles WHERE id = p_owner;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  -- User must have can_manage_agency permission OR be an admin
  IF NOT (COALESCE(v_prof.can_manage_agency, FALSE) = TRUE OR COALESCE(v_prof.is_admin, FALSE) = TRUE) THEN
    RAISE EXCEPTION 'user does not have permission to manage agencies';
  END IF;

  -- already owns?
  SELECT * INTO v_agency
  FROM public.agencies
  WHERE owner_profile_id = p_owner
  LIMIT 1;
  IF FOUND THEN RETURN v_agency; END IF;

  -- choose a display name (prefer profile.agency)
  v_name := NULLIF(btrim(COALESCE(v_prof.agency, '')), '');
  IF v_name IS NULL THEN
    v_name := COALESCE(NULLIF(btrim(v_prof.full_name), ''), 'My Agency');
  END IF;

  v_slug := public.slugify(v_name);

  -- claim ownerless row by slug if present
  SELECT * INTO v_agency
  FROM public.agencies
  WHERE owner_profile_id IS NULL
    AND slug = v_slug
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.agencies
    SET owner_profile_id = p_owner,
        name = v_name,
        slug = v_slug
    WHERE id = v_agency.id
    RETURNING * INTO v_agency;
    RETURN v_agency;
  END IF;

  -- else create
  INSERT INTO public.agencies (name, slug, owner_profile_id, is_active)
  VALUES (v_name, v_slug, p_owner, TRUE)
  RETURNING * INTO v_agency;

  RETURN v_agency;
END;
$function$;

COMMENT ON FUNCTION public.ensure_agency_for_owner(uuid) IS
  'Creates or returns an agency for the given owner. Requires can_manage_agency permission or admin status.';
