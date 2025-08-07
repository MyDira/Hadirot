/*
  # Create footer sections table for dynamic footer management

  1. New Tables
    - `footer_sections`
      - `id` (uuid, primary key)
      - `section_key` (text, unique) - identifier like 'main_info', 'company_links', etc.
      - `title` (text) - heading for columns or main title
      - `content_type` (enum) - 'rich_text' or 'links'
      - `content_data` (jsonb) - stores the actual content
      - `sort_order` (integer) - for ordering columns
      - `is_active` (boolean) - enable/disable sections
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `footer_sections` table
    - Add policies for public read access and admin-only write access

  3. Initial Data
    - Seed with current footer content structure
*/

-- Create enum for content types
CREATE TYPE footer_content_type AS ENUM ('rich_text', 'links');

-- Create footer_sections table
CREATE TABLE IF NOT EXISTS footer_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text UNIQUE NOT NULL,
  title text NOT NULL,
  content_type footer_content_type NOT NULL,
  content_data jsonb NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE footer_sections ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can read active footer sections"
  ON footer_sections
  FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Only admins can manage footer sections"
  ON footer_sections
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Add updated_at trigger
CREATE TRIGGER footer_sections_updated_at
  BEFORE UPDATE ON footer_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Insert initial footer data
INSERT INTO footer_sections (section_key, title, content_type, content_data, sort_order) VALUES
(
  'main_info',
  'MyDyra',
  'rich_text',
  '{
    "tagline": "NYC''s Jewish rental platform",
    "description": "Helping tenants, landlords, and agents find the perfect match — no noise, just homes."
  }',
  0
),
(
  'company_links',
  'Company',
  'links',
  '[
    {"text": "About Us", "url": "/about"},
    {"text": "Contact", "url": "/contact"},
    {"text": "Privacy Policy", "url": "/privacy"},
    {"text": "Terms of Use", "url": "/terms"}
  ]',
  1
),
(
  'explore_links',
  'Explore',
  'links',
  '[
    {"text": "Browse Listings", "url": "/browse"},
    {"text": "Featured Listings", "url": "/browse?featured=true"},
    {"text": "Post a Listing", "url": "/post"}
  ]',
  2
);