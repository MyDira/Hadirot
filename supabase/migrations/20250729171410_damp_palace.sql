/*
  # Add increment views function

  1. New Functions
    - `increment_listing_views`: Safely increments the views count for a listing
    
  2. Security
    - Function can be called by anyone to increment view counts
    - Uses atomic increment to prevent race conditions
*/

CREATE OR REPLACE FUNCTION increment_listing_views(listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE listings 
  SET views = COALESCE(views, 0) + 1 
  WHERE id = listing_id AND is_active = true;
END;
$$;