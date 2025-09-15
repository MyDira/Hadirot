/*
  # Create agencies table

  1. New Tables
    - `agencies`
      - `id` (uuid, primary key)
      - `name` (text, required)
      - `slug` (text, unique, required) - for public URLs
      - `tagline` (text, optional)
      - `logo_url` (text, optional)
      - `banner_url` (text, optional)
      - `theme_primary_color` (text, optional) - hex color
      - `theme_accent_color` (text, optional) - hex color
      - `phone` (text, optional)
      - `email` (text, optional)
      - `website` (text, optional)
      - `social_links` (jsonb, optional) - social media links
      - `about_content` (text, optional) - rich text HTML
      - `is_active` (boolean, default true)
      - `owner_user_id` (uuid, unique, optional) - links to profiles.id
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `agencies` table
    - Add policies for public read (active only), admin full access, owner edit access
    - Add indexes for performance
*/

CREATE TABLE IF NOT EXISTS agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  tagline text,
  logo_url text,
  banner_url text,
  theme_primary_color text,
  theme_accent_color text,
  phone text,
  email text,
  website text,
  social_links jsonb DEFAULT '{}'::jsonb,
  about_content text,
  is_active boolean NOT NULL DEFAULT true,
  owner_user_id uuid UNIQUE REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS agencies_slug_idx ON agencies(slug);
CREATE INDEX IF NOT EXISTS agencies_owner_user_id_idx ON agencies(owner_user_id);
CREATE INDEX IF NOT EXISTS agencies_is_active_idx ON agencies(is_active);

-- RLS Policies
-- Public can read active agencies
CREATE POLICY "Public can read active agencies"
  ON agencies
  FOR SELECT
  TO public
  USING (is_active = true);

-- Authenticated users can read active agencies or their own agency
CREATE POLICY "Users can read active agencies or own agency"
  ON agencies
  FOR SELECT
  TO authenticated
  USING (
    is_active = true OR 
    owner_user_id = uid() OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = uid() AND profiles.is_admin = true
    )
  );

-- Only admins can insert agencies
CREATE POLICY "Admins can insert agencies"
  ON agencies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = uid() AND profiles.is_admin = true
    )
  );

-- Admins or agency owners can update agencies
CREATE POLICY "Admins or owners can update agencies"
  ON agencies
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = uid() AND profiles.is_admin = true
    ) OR
    (owner_user_id = uid() AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = uid() AND profiles.can_manage_agency = true
    ))
  );

-- Only admins can delete agencies
CREATE POLICY "Admins can delete agencies"
  ON agencies
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = uid() AND profiles.is_admin = true
    )
  );

-- Add updated_at trigger
CREATE TRIGGER agencies_updated_at
  BEFORE UPDATE ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();