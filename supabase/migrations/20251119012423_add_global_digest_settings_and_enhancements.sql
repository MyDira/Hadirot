/*
  # Global Digest Settings and Template Enhancements

  1. Purpose
    - Add global static header/footer settings for all digests
    - Enhance digest templates with header/footer control flags
    - Add template categories for better organization
    - Support flexible collection and listing group configurations

  2. New Tables
    - `digest_global_settings`
      - Singleton table for global digest defaults
      - Static header and footer text that applies to all digests
      - Configurable by admins only

  3. Changes to digest_templates
    - Add header/footer control flags (use global vs custom)
    - Add custom header/footer override fields
    - Add template category field
    - Update collection_configs and listings_filter_config structure

  4. Security
    - Enable RLS on digest_global_settings
    - Only admins can read and update global settings
    - Maintain existing template security policies

  5. Default Data
    - Insert default global settings
    - Preserve existing template configurations
*/

-- Create template category enum
DO $$ BEGIN
  CREATE TYPE digest_template_category AS ENUM (
    'marketing',
    'internal',
    'scheduled',
    'one_time'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create global settings table (singleton pattern)
CREATE TABLE IF NOT EXISTS digest_global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_header_text text NOT NULL DEFAULT 'Here are the latest apartments posted on Hadirot:',
  default_footer_text text NOT NULL DEFAULT E'Join the Hadirot WhatsApp Community:\nhttps://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt',
  whatsapp_character_limit integer NOT NULL DEFAULT 4000,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Add constraint to ensure only one row exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_digest_global_settings_singleton
  ON digest_global_settings ((true));

-- Add new columns to digest_templates
ALTER TABLE digest_templates
ADD COLUMN IF NOT EXISTS use_global_header boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS use_global_footer boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS custom_header_override text,
ADD COLUMN IF NOT EXISTS custom_footer_override text,
ADD COLUMN IF NOT EXISTS category digest_template_category DEFAULT 'marketing';

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_digest_templates_category
  ON digest_templates(category);

CREATE INDEX IF NOT EXISTS idx_digest_templates_header_footer_flags
  ON digest_templates(use_global_header, use_global_footer);

-- Enable Row Level Security on global settings
ALTER TABLE digest_global_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for digest_global_settings
CREATE POLICY "Admins can view global digest settings"
  ON digest_global_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update global digest settings"
  ON digest_global_settings
  FOR UPDATE
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

CREATE POLICY "Admins can insert global digest settings"
  ON digest_global_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Insert default global settings (singleton)
INSERT INTO digest_global_settings (
  id,
  default_header_text,
  default_footer_text,
  whatsapp_character_limit
)
VALUES (
  gen_random_uuid(),
  'Here are the latest apartments posted on Hadirot:',
  E'Join the Hadirot WhatsApp Community:\nhttps://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt',
  4000
)
ON CONFLICT DO NOTHING;

-- Update existing templates to use global header/footer by default
UPDATE digest_templates
SET
  use_global_header = true,
  use_global_footer = true,
  category = 'marketing'
WHERE use_global_header IS NULL;

-- Add helpful comments
COMMENT ON TABLE digest_global_settings IS
  'Global default settings for all digest emails - singleton table with one row';

COMMENT ON COLUMN digest_global_settings.default_header_text IS
  'Default introduction text used in all digests unless template overrides';

COMMENT ON COLUMN digest_global_settings.default_footer_text IS
  'Default conclusion text with WhatsApp community link used unless template overrides';

COMMENT ON COLUMN digest_global_settings.whatsapp_character_limit IS
  'Maximum character count for WhatsApp messages (default 4000)';

COMMENT ON COLUMN digest_templates.use_global_header IS
  'If true, use global default header; if false, use custom_header_override';

COMMENT ON COLUMN digest_templates.use_global_footer IS
  'If true, use global default footer; if false, use custom_footer_override';

COMMENT ON COLUMN digest_templates.custom_header_override IS
  'Custom header text to use when use_global_header is false';

COMMENT ON COLUMN digest_templates.custom_footer_override IS
  'Custom footer text to use when use_global_footer is false';

COMMENT ON COLUMN digest_templates.category IS
  'Template category for organization: marketing, internal, scheduled, one_time';

COMMENT ON COLUMN digest_templates.collection_configs IS
  'Array of collection configurations, each with: enabled, label, filters, cta_format, order';

COMMENT ON COLUMN digest_templates.listings_filter_config IS
  'Array of listing groups, each with: enabled, limit, filters, time_filter';