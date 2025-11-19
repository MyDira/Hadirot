/*
  # Add WhatsApp Digest Fields to Templates

  1. Purpose
    - Add WhatsApp-specific formatting fields to digest_templates
    - Support customizable intro/outro text
    - Enable collection links configuration
    - Add listing selection and sectioning options
    - Support WhatsApp plain-text output format

  2. Changes to digest_templates
    - `whatsapp_intro_text` - Customizable introduction text
    - `whatsapp_outro_text` - Customizable conclusion with WhatsApp link
    - `include_collections` - Toggle for collection links section
    - `collection_configs` - Array of up to 3 collection configurations
    - `listings_time_filter` - Time-based filter for listings
    - `listings_filter_config` - Advanced filter configuration
    - `section_by_filter` - Field to use for sectioning listings
    - `output_format` - Format type (whatsapp or email)

  3. Changes to filter_presets
    - `use_for_collections` - Mark preset as usable for collections
    - `custom_collection_label` - Override label for collection display
    - `collection_url_override` - Optional custom URL (e.g., shortlink)

  4. Default Values
    - Set sensible defaults for existing templates
    - Ensure backward compatibility
*/

-- Add new columns to digest_templates
ALTER TABLE digest_templates
ADD COLUMN IF NOT EXISTS whatsapp_intro_text text DEFAULT 'Here are the latest apartments posted on Hadirot:',
ADD COLUMN IF NOT EXISTS whatsapp_outro_text text DEFAULT E'Join the Hadirot WhatsApp Community:\nhttps://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt',
ADD COLUMN IF NOT EXISTS include_collections boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS collection_configs jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS listings_time_filter text DEFAULT 'all',
ADD COLUMN IF NOT EXISTS listings_filter_config jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS section_by_filter text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS output_format text DEFAULT 'whatsapp';

-- Add constraint for listings_time_filter
ALTER TABLE digest_templates
DROP CONSTRAINT IF EXISTS digest_templates_listings_time_filter_check;

ALTER TABLE digest_templates
ADD CONSTRAINT digest_templates_listings_time_filter_check
CHECK (listings_time_filter IN ('24h', '48h', '3d', '7d', '14d', '30d', 'all'));

-- Add constraint for section_by_filter
ALTER TABLE digest_templates
DROP CONSTRAINT IF EXISTS digest_templates_section_by_filter_check;

ALTER TABLE digest_templates
ADD CONSTRAINT digest_templates_section_by_filter_check
CHECK (section_by_filter IS NULL OR section_by_filter IN ('bedrooms', 'property_type'));

-- Add constraint for output_format
ALTER TABLE digest_templates
DROP CONSTRAINT IF EXISTS digest_templates_output_format_check;

ALTER TABLE digest_templates
ADD CONSTRAINT digest_templates_output_format_check
CHECK (output_format IN ('whatsapp', 'email'));

-- Add new columns to filter_presets
ALTER TABLE filter_presets
ADD COLUMN IF NOT EXISTS use_for_collections boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS custom_collection_label text,
ADD COLUMN IF NOT EXISTS collection_url_override text;

-- Add index for collection-enabled presets
CREATE INDEX IF NOT EXISTS idx_filter_presets_collections
ON filter_presets(use_for_collections, is_active)
WHERE use_for_collections = true AND is_active = true;

-- Add comments for documentation
COMMENT ON COLUMN digest_templates.whatsapp_intro_text IS
  'Customizable introduction text for WhatsApp digest (always included)';

COMMENT ON COLUMN digest_templates.whatsapp_outro_text IS
  'Customizable conclusion text with WhatsApp community link (always included)';

COMMENT ON COLUMN digest_templates.include_collections IS
  'Whether to include collection links section in digest';

COMMENT ON COLUMN digest_templates.collection_configs IS
  'Array of collection configurations (up to 3), each with filters and custom labels';

COMMENT ON COLUMN digest_templates.listings_time_filter IS
  'Time-based filter for listings: 24h, 48h, 3d, 7d, 14d, 30d, or all';

COMMENT ON COLUMN digest_templates.listings_filter_config IS
  'Advanced filter configuration for listing selection (bedrooms, property_type, price, etc.)';

COMMENT ON COLUMN digest_templates.section_by_filter IS
  'Field to use for sectioning listings: null (no sections), bedrooms, or property_type';

COMMENT ON COLUMN digest_templates.output_format IS
  'Output format type: whatsapp (plain text with WhatsApp markdown) or email (HTML)';

COMMENT ON COLUMN filter_presets.use_for_collections IS
  'Whether this preset can be used as a collection link in digests';

COMMENT ON COLUMN filter_presets.custom_collection_label IS
  'Override label for collection display (e.g., "Two-Bedroom Apartments")';

COMMENT ON COLUMN filter_presets.collection_url_override IS
  'Optional custom URL for collection link (e.g., shortlink /l/abc123)';