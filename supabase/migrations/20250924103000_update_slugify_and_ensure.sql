-- Refine slugify helper and ownership RPC per reviewer plan
CREATE OR REPLACE FUNCTION public.slugify(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_value text := p_text;
BEGIN
  IF v_value IS NULL THEN
    RETURN NULL;
  END IF;

  v_value := trim(v_value);

  IF v_value IS NULL OR v_value = '' THEN
    RETURN '';
  END IF;

  BEGIN
    v_value := extensions.unaccent(v_value);
  EXCEPTION
    WHEN undefined_function OR invalid_schema_name THEN
      -- Extension is unavailable; continue with the original value
      NULL;
  END;

  v_value := lower(v_value);
  v_value := regexp_replace(v_value, '[^a-z0-9]+', '-', 'g');
  v_value := regexp_replace(v_value, '-{2,}', '-', 'g');
  v_value := trim(both '-' FROM v_value);

  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_agency_for_owner(p_owner_id uuid)
RETURNS public.agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_requester uuid := auth.uid();
  v_caller_is_admin boolean := false;
  v_agency public.agencies%ROWTYPE;
  v_profile_agency_name text;
  v_profile_agency_slug text;
  v_profile_full_name text;
  v_default_agency_name text;
  v_default_agency_slug text;
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Owner id is required.' USING ERRCODE = '22004';
  END IF;

  IF v_requester IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF v_requester <> p_owner_id THEN
    SELECT is_admin
      INTO v_caller_is_admin
      FROM public.profiles
     WHERE id = v_requester;

    IF NOT COALESCE(v_caller_is_admin, FALSE) THEN
      RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT *
    INTO v_agency
    FROM public.agencies
   WHERE owner_profile_id = p_owner_id
   LIMIT 1;

  IF FOUND THEN
    RETURN v_agency;
  END IF;

  SELECT NULLIF(trim(agency), '') AS agency_name,
         NULLIF(trim(full_name), '') AS full_name
    INTO v_profile_agency_name,
         v_profile_full_name
    FROM public.profiles
   WHERE id = p_owner_id
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile % not found.', p_owner_id USING ERRCODE = 'P0002';
  END IF;

  IF v_profile_full_name IS NOT NULL THEN
    v_default_agency_name := v_profile_full_name || '''s Agency';
  ELSE
    v_default_agency_name := 'My Agency';
  END IF;

  v_profile_agency_slug := CASE
    WHEN v_profile_agency_name IS NOT NULL THEN public.slugify(v_profile_agency_name)
    ELSE NULL
  END;

  v_default_agency_slug := public.slugify(v_default_agency_name);

  IF v_profile_agency_slug IS NOT NULL AND v_profile_agency_slug <> '' THEN
    UPDATE public.agencies
       SET owner_profile_id = p_owner_id,
           name = v_profile_agency_name,
           slug = v_profile_agency_slug,
           is_active = COALESCE(is_active, TRUE)
     WHERE owner_profile_id IS NULL
       AND slug = v_profile_agency_slug
     RETURNING * INTO v_agency;

    IF FOUND THEN
      RETURN v_agency;
    END IF;
  END IF;

  IF v_default_agency_slug IS NULL OR v_default_agency_slug = '' THEN
    v_default_agency_slug := 'agency-' || LEFT(REPLACE(p_owner_id::text, '-', ''), 8);
  END IF;

  UPDATE public.agencies
     SET owner_profile_id = p_owner_id,
         name = v_default_agency_name,
         slug = v_default_agency_slug,
         is_active = COALESCE(is_active, TRUE)
   WHERE owner_profile_id IS NULL
     AND slug = v_default_agency_slug
   RETURNING * INTO v_agency;

  IF FOUND THEN
    RETURN v_agency;
  END IF;

  BEGIN
    INSERT INTO public.agencies (name, slug, owner_profile_id, is_active)
    VALUES (v_default_agency_name, v_default_agency_slug, p_owner_id, TRUE)
    RETURNING * INTO v_agency;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Unable to ensure agency for owner % due to slug conflict.', p_owner_id USING ERRCODE = '23505';
  END;

  RETURN v_agency;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_agency_for_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_agency_owner_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
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
