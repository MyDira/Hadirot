/*
  # Create Modal Popup System

  1. New Tables
    - `modal_popups`
      - `id` (uuid, primary key)
      - `name` (text, admin reference name)
      - `heading` (text, modal title)
      - `subheading` (text, modal subtitle)
      - `additional_text_lines` (jsonb, array of text strings)
      - `button_text` (text, CTA button label)
      - `button_url` (text, external link URL)
      - `is_active` (boolean, enable/disable modal)
      - `trigger_pages` (jsonb, array of page paths)
      - `display_frequency` (text, frequency type)
      - `custom_interval_hours` (integer, hours for custom interval)
      - `delay_seconds` (integer, delay before showing)
      - `priority` (integer, display order priority)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `modal_user_interactions`
      - `id` (uuid, primary key)
      - `modal_id` (uuid, foreign key to modal_popups)
      - `user_fingerprint` (text, browser fingerprint)
      - `user_id` (uuid, nullable foreign key to profiles)
      - `interaction_type` (text, 'shown', 'dismissed', 'clicked')
      - `interaction_timestamp` (timestamptz)
      - `session_id` (text, session identifier)
      - `page_path` (text, where interaction occurred)

  2. Security
    - Enable RLS on both tables
    - Public can read active modals
    - Admins can manage all modals
    - Users can insert their own interactions
    - Admins can read all interactions

  3. Performance
    - Index on modal_id and user_fingerprint
    - Index on interaction_timestamp
    - Index on is_active for filtering

  4. Example Data
    - Insert sample modal for testing
*/

-- Create modal_popups table
CREATE TABLE IF NOT EXISTS modal_popups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  heading text NOT NULL,
  subheading text,
  additional_text_lines jsonb DEFAULT '[]'::jsonb,
  button_text text NOT NULL,
  button_url text NOT NULL,
  is_active boolean DEFAULT false,
  trigger_pages jsonb DEFAULT '[]'::jsonb,
  display_frequency text NOT NULL DEFAULT 'once_per_session',
  custom_interval_hours integer,
  delay_seconds integer DEFAULT 0,
  priority integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_display_frequency CHECK (
    display_frequency IN ('once_per_session', 'once_per_day', 'once_per_lifetime', 'until_clicked', 'custom_interval')
  ),
  CONSTRAINT valid_custom_interval CHECK (
    (display_frequency = 'custom_interval' AND custom_interval_hours > 0) OR
    (display_frequency != 'custom_interval')
  ),
  CONSTRAINT valid_delay CHECK (delay_seconds >= 0),
  CONSTRAINT valid_priority CHECK (priority >= 0)
);

-- Create modal_user_interactions table
CREATE TABLE IF NOT EXISTS modal_user_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modal_id uuid NOT NULL REFERENCES modal_popups(id) ON DELETE CASCADE,
  user_fingerprint text NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  interaction_type text NOT NULL,
  interaction_timestamp timestamptz DEFAULT now(),
  session_id text NOT NULL,
  page_path text NOT NULL,
  CONSTRAINT valid_interaction_type CHECK (
    interaction_type IN ('shown', 'dismissed', 'clicked')
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_modal_interactions_modal_fingerprint 
  ON modal_user_interactions(modal_id, user_fingerprint);

CREATE INDEX IF NOT EXISTS idx_modal_interactions_timestamp 
  ON modal_user_interactions(interaction_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_modal_interactions_user_id 
  ON modal_user_interactions(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_modal_popups_active 
  ON modal_popups(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_modal_popups_priority 
  ON modal_popups(priority DESC) WHERE is_active = true;

-- Enable RLS
ALTER TABLE modal_popups ENABLE ROW LEVEL SECURITY;
ALTER TABLE modal_user_interactions ENABLE ROW LEVEL SECURITY;

-- Modal Popups Policies
CREATE POLICY "Public can read active modals"
  ON modal_popups FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can read all modals"
  ON modal_popups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admins can insert modals"
  ON modal_popups FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admins can update modals"
  ON modal_popups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admins can delete modals"
  ON modal_popups FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Modal User Interactions Policies
CREATE POLICY "Users can insert own interactions"
  ON modal_user_interactions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can read own interactions"
  ON modal_user_interactions FOR SELECT
  USING (
    user_fingerprint = current_setting('app.user_fingerprint', true) OR
    user_id = auth.uid()
  );

CREATE POLICY "Admins can read all interactions"
  ON modal_user_interactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Create trigger for updated_at
CREATE TRIGGER modal_popups_updated_at
  BEFORE UPDATE ON modal_popups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Insert sample modal for testing
INSERT INTO modal_popups (
  name,
  heading,
  subheading,
  additional_text_lines,
  button_text,
  button_url,
  is_active,
  trigger_pages,
  display_frequency,
  delay_seconds,
  priority
) VALUES (
  'Welcome Modal',
  'Welcome to HADIROT!',
  'Your premier destination for rental listings',
  '["Browse thousands of available rentals", "Post your property for free", "Connect directly with landlords and tenants"]'::jsonb,
  'Get Started',
  '/browse',
  false,
  '["/"]'::jsonb,
  'once_per_day',
  3,
  100
) ON CONFLICT (name) DO NOTHING;