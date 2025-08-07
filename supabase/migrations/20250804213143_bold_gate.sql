/*
  # Add max_featured_listings_per_user column to profiles table

  1. Schema Changes
    - Add `max_featured_listings_per_user` column to `profiles` table
      - Type: INTEGER
      - Nullable: true (NULL means user inherits global default)
      - Default: NULL

  2. Purpose
    - Allows individual users to have custom featured listing limits
    - If NULL, user inherits the global `max_featured_per_user` setting
    - If 0, user cannot feature any listings
    - If positive number, user can feature up to that many listings
*/

-- Add the max_featured_listings_per_user column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS max_featured_listings_per_user INTEGER DEFAULT NULL;

-- Add a comment to document the column
COMMENT ON COLUMN public.profiles.max_featured_listings_per_user IS 'Custom featured listing limit for this user. NULL means inherit global default.';