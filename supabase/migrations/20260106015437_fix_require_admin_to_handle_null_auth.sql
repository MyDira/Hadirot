/*
  # Fix require_admin() to Handle Null Auth Context
  
  1. Problem
    - require_admin() was raising 'forbidden' even for admin users
    - auth.uid() may return NULL in certain contexts
    
  2. Solution
    - Make require_admin() more robust
    - Add explicit NULL check for auth.uid()
    - Keep security tight but handle edge cases
*/

-- Update require_admin to be more robust
CREATE OR REPLACE FUNCTION require_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid uuid;
  is_user_admin boolean;
BEGIN
  current_uid := auth.uid();
  
  IF current_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden: not authenticated';
  END IF;
  
  SELECT is_admin INTO is_user_admin
  FROM profiles
  WHERE id = current_uid;
  
  IF is_user_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'forbidden: not admin';
  END IF;
END;
$$;

-- Also create a softer version that returns boolean instead of raising
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid uuid;
BEGIN
  current_uid := auth.uid();
  
  IF current_uid IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = current_uid AND is_admin = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
