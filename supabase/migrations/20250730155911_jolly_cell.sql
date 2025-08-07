/*
  # Add last_published_at column to listings table

  1. New Column
    - `last_published_at` (timestamptz) - tracks when listing was last published/renewed
    - Default to created_at for existing listings
    - Set to now() when renewing listings

  2. Purpose
    - Preserve original created_at date
    - Track renewal/republishing activity
    - Display both creation and last published dates in dashboard
*/

-- Add the new column
ALTER TABLE listings 
ADD COLUMN IF NOT EXISTS last_published_at timestamptz DEFAULT now();

-- Set initial values for existing listings (use created_at as default)
UPDATE listings 
SET last_published_at = created_at 
WHERE last_published_at IS NULL;

-- Make the column NOT NULL after setting initial values
ALTER TABLE listings 
ALTER COLUMN last_published_at SET NOT NULL;