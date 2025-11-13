/*
  # Create Hero Banner System

  1. New Tables
    - `hero_banners`
      - `id` (uuid, primary key)
      - `name` (text) - Admin-friendly name for banner
      - `heading` (text) - Main banner heading
      - `subheading` (text) - Secondary text below heading
      - `background_color` (text) - Hex color code
      - `text_color` (text) - Light or dark theme
      - `is_active` (boolean) - Whether banner is currently displayed
      - `display_order` (integer) - Order in carousel
      - `is_default` (boolean) - Flag for default banner
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `banner_buttons`
      - `id` (uuid, primary key)
      - `banner_id` (uuid, foreign key to hero_banners)
      - `button_text` (text) - Text displayed on button
      - `button_url` (text) - URL or path for button
      - `button_style` (text) - Style type: primary, secondary, outline
      - `icon_name` (text) - Lucide icon name
      - `display_order` (integer) - Order of buttons in banner
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for public read access
    - Add policies for admin-only write access

  3. Default Data
    - Insert default banner matching current homepage design
*/

-- Create hero_banners table
CREATE TABLE IF NOT EXISTS hero_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  heading text NOT NULL,
  subheading text,
  background_color text DEFAULT '#273140',
  text_color text DEFAULT 'light',
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create banner_buttons table
CREATE TABLE IF NOT EXISTS banner_buttons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id uuid NOT NULL REFERENCES hero_banners(id) ON DELETE CASCADE,
  button_text text NOT NULL,
  button_url text NOT NULL,
  button_style text DEFAULT 'primary',
  icon_name text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_hero_banners_active ON hero_banners(is_active);
CREATE INDEX IF NOT EXISTS idx_hero_banners_display_order ON hero_banners(display_order);
CREATE INDEX IF NOT EXISTS idx_banner_buttons_banner_id ON banner_buttons(banner_id);
CREATE INDEX IF NOT EXISTS idx_banner_buttons_display_order ON banner_buttons(display_order);

-- Enable RLS
ALTER TABLE hero_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_buttons ENABLE ROW LEVEL SECURITY;

-- RLS Policies for hero_banners
CREATE POLICY "Anyone can view active banners"
  ON hero_banners FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can view all banners"
  ON hero_banners FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can insert banners"
  ON hero_banners FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update banners"
  ON hero_banners FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete banners"
  ON hero_banners FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- RLS Policies for banner_buttons
CREATE POLICY "Anyone can view buttons for active banners"
  ON banner_buttons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hero_banners
      WHERE hero_banners.id = banner_buttons.banner_id
      AND hero_banners.is_active = true
    )
  );

CREATE POLICY "Admins can view all buttons"
  ON banner_buttons FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can insert buttons"
  ON banner_buttons FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update buttons"
  ON banner_buttons FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete buttons"
  ON banner_buttons FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Insert default banner matching current homepage design
INSERT INTO hero_banners (name, heading, subheading, background_color, text_color, is_active, display_order, is_default)
VALUES (
  'Default Homepage Banner',
  'The Heart of Local Rentals',
  'Where your family finds their next home',
  '#273140',
  'light',
  true,
  0,
  true
);

-- Insert default buttons for the default banner
INSERT INTO banner_buttons (banner_id, button_text, button_url, button_style, icon_name, display_order)
SELECT
  id,
  'Find Yours',
  '/browse',
  'primary',
  'Search',
  0
FROM hero_banners WHERE is_default = true;

INSERT INTO banner_buttons (banner_id, button_text, button_url, button_style, icon_name, display_order)
SELECT
  id,
  'List a Property',
  '/post',
  'secondary',
  'Plus',
  1
FROM hero_banners WHERE is_default = true;
