-- Ensure agency ownership via RPC and default trigger
CREATE OR REPLACE FUNCTION public.ensure_agency_for_owner(p_owner uuid)
RETURNS public.agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_requester uuid := auth.uid();
  v_is_admin boolean;
  v_profile public.profiles%ROWTYPE;
  v_name text;
  v_base_slug text;
  v_candidate_slug text;
  v_suffix integer := 0;
  v_result public.agencies%ROWTYPE;
BEGIN
  IF p_owner IS NULL THEN
    RAISE EXCEPTION 'Owner id is required';
  END IF;

  IF v_requester IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF v_requester <> p_owner THEN
    SELECT is_admin
    INTO v_is_admin
    FROM public.profiles
    WHERE id = v_requester;

    IF NOT COALESCE(v_is_admin, FALSE) THEN
      RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT *
  INTO v_result
  FROM public.agencies
  WHERE owner_profile_id = p_owner
  LIMIT 1;

  IF FOUND THEN
    RETURN v_result;
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = p_owner
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile % not found.', p_owner USING ERRCODE = 'P0002';
  END IF;

  v_name := COALESCE(
    NULLIF(TRIM(v_profile.agency), ''),
    NULLIF(TRIM(v_profile.full_name), ''),
    'My Agency'
  );

  v_base_slug := LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          to_ascii(v_name, 'latin'),
          '[^a-zA-Z0-9]+',
          '-',
          'g'
        ),
        '-{2,}',
        '-',
        'g'
      ),
      '(^-|-$)',
      '',
      'g'
    )
  );

  IF v_base_slug IS NULL OR v_base_slug = '' THEN
    v_base_slug := 'agency-' || LEFT(REPLACE(p_owner::text, '-', ''), 8);
  END IF;

  LOOP
    v_candidate_slug := v_base_slug;
    IF v_suffix > 0 THEN
      v_candidate_slug := v_base_slug || '-' || v_suffix::text;
    END IF;

    SELECT *
    INTO v_result
    FROM public.agencies
    WHERE owner_profile_id IS NULL
      AND slug = v_candidate_slug
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.agencies
      SET owner_profile_id = p_owner,
          name = v_name,
          slug = v_candidate_slug,
          is_active = COALESCE(is_active, TRUE)
      WHERE id = v_result.id
      RETURNING * INTO v_result;

      RETURN v_result;
    END IF;

    BEGIN
      INSERT INTO public.agencies (name, slug, owner_profile_id, is_active)
      VALUES (v_name, v_candidate_slug, p_owner, TRUE)
      RETURNING * INTO v_result;

      RETURN v_result;
    EXCEPTION
      WHEN unique_violation THEN
        v_suffix := v_suffix + 1;
        IF v_suffix > 25 THEN
          RAISE EXCEPTION 'Unable to generate unique slug for agency owner %.', p_owner USING ERRCODE = '23505';
        END IF;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_agency_for_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_agency_owner_default()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_profile_id IS NULL THEN
    NEW.owner_profile_id := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agencies_owner_default_trg ON public.agencies;
CREATE TRIGGER agencies_owner_default_trg
BEFORE INSERT ON public.agencies
FOR EACH ROW
EXECUTE FUNCTION public.set_agency_owner_default();
