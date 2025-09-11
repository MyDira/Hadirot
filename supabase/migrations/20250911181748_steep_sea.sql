/*
  # Add slug column to static_pages table

  1. Changes
    - Add `slug` column to `static_pages` table
    - Make it unique to ensure each page has a distinct identifier
    - Add index for better query performance
    - Update existing records with slugs based on their IDs

  2. Security
    - No RLS changes needed as existing policies will apply to the new column
*/

-- Add slug column to static_pages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'static_pages' AND column_name = 'slug'
  ) THEN
    ALTER TABLE static_pages ADD COLUMN slug text;
  END IF;
END $$;

-- Update existing records with slugs based on their IDs
UPDATE static_pages SET slug = id WHERE slug IS NULL;

-- Make slug column NOT NULL after populating existing records
ALTER TABLE static_pages ALTER COLUMN slug SET NOT NULL;

-- Add unique constraint on slug
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'static_pages' AND constraint_name = 'static_pages_slug_key'
  ) THEN
    ALTER TABLE static_pages ADD CONSTRAINT static_pages_slug_key UNIQUE (slug);
  END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS static_pages_slug_idx ON static_pages (slug);