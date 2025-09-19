/*
  # Fix Agency Management Issues

  1. Database Functions
    - Update `public.slugify` to be IMMUTABLE and encoding-agnostic
    - Update `public.ensure_agency_for_owner` with security guard and legacy claim expansion
    - Ensure insert trigger hygiene

  2. Security
    - Add admin verification for cross-user operations
    - Maintain proper search_path settings
    - Remove all 'latin' encoding references

  3. Legacy Claim Logic
    - Try to claim ownerless agency by profile.agency slug first
    - Fall back to default naming convention
    - Only create new row if neither exists
*/

-- Update slugify function to be IMMUTABLE and encoding-agnostic
CREATE OR REPLACE FUNCTION public.slugify(text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    slug TEXT;
BEGIN
    -- Try to use unaccent extension if available
    BEGIN
        slug := extensions.unaccent(text);
    EXCEPTION
        WHEN undefined_function THEN
            slug := text; -- Fallback if unaccent is not available
    END;

    -- Lowercase, replace non-alphanumeric with hyphens, collapse multiple hyphens, trim edges
    slug := lower(slug);
    slug := regexp_replace(slug, '[^a-z0-9]+', '-', 'g');
    slug := regexp_replace(slug, '-+', '-', 'g'); -- Collapse multiple hyphens
    slug := trim(both '-' from slug);

    RETURN slug;
END;
$$;

-- Update ensure_agency_for_owner with security guard and expanded legacy claim logic
CREATE OR REPLACE FUNCTION public.ensure_agency_for_owner(p_owner_id UUID)
RETURNS public.agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_agency public.agencies;
    v_profile_name TEXT;
    v_profile_agency_name TEXT;
    v_default_agency_name TEXT;
    v_default_agency_slug TEXT;
    v_profile_agency_slug TEXT;
    v_caller_is_admin BOOLEAN;
BEGIN
    -- Security Guard: If p_owner_id is not the current user, verify caller is admin
    IF p_owner_id != auth.uid() THEN
        SELECT is_admin INTO v_caller_is_admin FROM public.profiles WHERE id = auth.uid();
        IF NOT FOUND OR v_caller_is_admin IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'Permission denied: Only admins can ensure agency for other users.';
        END IF;
    END IF;

    -- Check if the profile already owns an agency
    SELECT * INTO v_agency FROM public.agencies WHERE owner_profile_id = p_owner_id;

    IF FOUND THEN
        RETURN v_agency;
    END IF;

    -- Get profile details for potential agency name derivation
    SELECT full_name, agency INTO v_profile_name, v_profile_agency_name
    FROM public.profiles
    WHERE id = p_owner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile with ID % not found', p_owner_id;
    END IF;

    -- Attempt to claim an existing ownerless agency based on profile.agency (if present)
    IF v_profile_agency_name IS NOT NULL AND trim(v_profile_agency_name) != '' THEN
        v_profile_agency_slug := public.slugify(v_profile_agency_name);
        
        UPDATE public.agencies
        SET owner_profile_id = p_owner_id
        WHERE slug = v_profile_agency_slug
          AND owner_profile_id IS NULL
        RETURNING * INTO v_agency;

        IF FOUND THEN
            RETURN v_agency;
        END IF;
    END IF;

    -- Attempt to claim an existing ownerless agency based on default naming convention
    v_default_agency_name := coalesce(v_profile_name, 'User') || '''s Agency';
    v_default_agency_slug := public.slugify(v_default_agency_name);

    UPDATE public.agencies
    SET owner_profile_id = p_owner_id
    WHERE slug = v_default_agency_slug
      AND owner_profile_id IS NULL
    RETURNING * INTO v_agency;

    IF FOUND THEN
        RETURN v_agency;
    END IF;

    -- If no agency found or claimed, create a new one
    INSERT INTO public.agencies (name, slug, owner_profile_id, is_active)
    VALUES (v_default_agency_name, v_default_agency_slug, p_owner_id, TRUE)
    RETURNING * INTO v_agency;

    RETURN v_agency;
END;
$$;

-- Ensure the insert trigger function is properly defined (hygiene check)
CREATE OR REPLACE FUNCTION public.set_agency_owner_default()
RETURNS TRIGGER
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

-- Ensure the trigger exists (this should already exist but we'll make sure)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'agencies_owner_default_trg' 
        AND event_object_table = 'agencies'
    ) THEN
        CREATE TRIGGER agencies_owner_default_trg
        BEFORE INSERT ON public.agencies
        FOR EACH ROW
        EXECUTE FUNCTION public.set_agency_owner_default();
    END IF;
END $$;