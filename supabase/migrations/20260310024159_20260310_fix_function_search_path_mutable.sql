/*
  # Fix Function Search Path Mutable

  Sets `search_path = ''` on 4 functions that have a mutable search_path.
  A mutable search_path is a security risk because it allows search_path
  injection attacks. Setting it to empty string forces fully-qualified
  object references and prevents this attack vector.

  Affected functions:
  - public.update_updated_at_column
  - public.update_scraped_updated_at
  - public.normalize_contact_phone
  - public.auto_set_listing_agency_id
*/

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_scraped_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_contact_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  digits text;
BEGIN
  IF NEW.contact_phone IS NOT NULL THEN
    digits := REGEXP_REPLACE(NEW.contact_phone, '[^0-9]', '', 'g');
    IF LENGTH(digits) = 11 AND digits LIKE '1%' THEN
      digits := SUBSTRING(digits FROM 2);
    END IF;
    NEW.contact_phone_e164 := '+1' || digits;
  ELSE
    NEW.contact_phone_e164 := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_set_listing_agency_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  user_agency_id uuid;
  user_agency_name text;
BEGIN
  IF NEW.agency_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.id INTO user_agency_id
  FROM public.agencies a
  WHERE a.owner_profile_id = NEW.user_id
  LIMIT 1;

  IF user_agency_id IS NOT NULL THEN
    NEW.agency_id = user_agency_id;
    RETURN NEW;
  END IF;

  SELECT p.agency INTO user_agency_name
  FROM public.profiles p
  WHERE p.id = NEW.user_id
  LIMIT 1;

  IF user_agency_name IS NOT NULL AND user_agency_name != '' THEN
    SELECT a.id INTO user_agency_id
    FROM public.agencies a
    WHERE LOWER(TRIM(a.name)) = LOWER(TRIM(user_agency_name))
    LIMIT 1;

    IF user_agency_id IS NOT NULL THEN
      NEW.agency_id = user_agency_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
