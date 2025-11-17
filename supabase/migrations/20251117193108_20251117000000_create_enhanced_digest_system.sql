/*
  # Enhanced Admin Digest System

  1. Purpose
    - Flexible digest templates with multiple delivery modes
    - Reusable filter presets for browse page links
    - Comprehensive tracking and deduplication per template
    - Support for categorized listings and filter links
    - Complete audit trail of all digest sends

  2. New Tables
    - `digest_templates`
      - Stores reusable digest configurations
      - Includes template name, type, filters, and options
      - Allows saving and reusing common digest patterns

    - `digest_sends`
      - Logs each digest execution with full metadata
      - Tracks template used, recipients, and listing counts
      - Provides audit trail for all digest activities

    - `digest_sent_listings`
      - Tracks which listings sent in which digest
      - Enables per-template deduplication rules
      - References both listing and digest send

    - `filter_presets`
      - Stores common filter combinations
      - Used for generating browse page links with counts
      - Includes display labels and URL parameters

  3. Digest Template Types
    - unsent_only: Send only listings never sent before
    - recent_by_category: Group recent listings by bedroom count
    - filter_links: Generate clickable browse page links with counts
    - custom_query: Full control over filters and criteria
    - mixed_layout: Combine listing cards and filter links
    - all_active: Send all active listings regardless of history

  4. Security
    - Enable RLS on all tables
    - Only admins can manage templates and presets
    - Only admins can view digest history
    - Service role can insert send records

  5. Indexes
    - Efficient template lookups by name and type
    - Fast deduplication checks by listing and template
    - Quick retrieval of recent sends
    - Optimized filter preset queries
*/

-- Create enum for digest template types
DO $$ BEGIN
  CREATE TYPE digest_template_type AS ENUM (
    'unsent_only',
    'recent_by_category',
    'filter_links',
    'custom_query',
    'mixed_layout',
    'all_active'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create enum for sorting options
DO $$ BEGIN
  CREATE TYPE digest_sort_option AS ENUM (
    'newest_first',
    'price_asc',
    'price_desc',
    'featured_first'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create digest templates table
CREATE TABLE IF NOT EXISTS digest_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  template_type digest_template_type NOT NULL,

  -- Filter configuration (stored as JSONB for flexibility)
  filter_config jsonb DEFAULT '{}'::jsonb,
  -- Example structure:
  -- {
  --   "bedrooms": [1, 2, 3],
  --   "price_min": 2000,
  --   "price_max": 4000,
  --   "locations": ["Brooklyn", "Queens"],
  --   "property_types": ["apartment", "duplex"],
  --   "broker_fee": false,
  --   "date_range_days": 7
  -- }

  -- Category and display options
  category_limits jsonb DEFAULT '{}'::jsonb,
  -- Example: {"studio": 3, "1bed": 5, "2bed": 5, "3bed": 3, "4plus": 2}

  sort_preference digest_sort_option DEFAULT 'newest_first',

  -- Deduplication settings
  allow_resend boolean DEFAULT false,
  resend_after_days integer DEFAULT 7,
  ignore_send_history boolean DEFAULT false,

  -- Email customization
  subject_template text DEFAULT 'Daily Listing Digest - {{date}}',
  include_filter_links boolean DEFAULT false,
  filter_preset_ids uuid[] DEFAULT ARRAY[]::uuid[],

  -- Metadata
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_default boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create digest sends table (audit log)
CREATE TABLE IF NOT EXISTS digest_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES digest_templates(id) ON DELETE SET NULL,
  template_name text NOT NULL, -- Denormalized for history
  template_type digest_template_type NOT NULL,

  -- Send metadata
  sent_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_emails text[] NOT NULL,
  recipient_count integer NOT NULL,

  -- Listing counts by category
  total_listings_sent integer NOT NULL DEFAULT 0,
  listings_by_category jsonb DEFAULT '{}'::jsonb,
  -- Example: {"studio": 2, "1bed": 5, "2bed": 8, "3bed": 4}

  -- Filter links included
  filter_links_included jsonb DEFAULT '[]'::jsonb,
  -- Example: [{"label": "2BR Under $3K", "count": 23, "url": "/browse?..."}]

  -- Execution details
  execution_time_ms integer,
  success boolean NOT NULL DEFAULT true,
  error_message text,

  -- Configuration snapshot (for audit purposes)
  config_snapshot jsonb DEFAULT '{}'::jsonb,

  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create digest sent listings table (detailed tracking)
CREATE TABLE IF NOT EXISTS digest_sent_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_send_id uuid NOT NULL REFERENCES digest_sends(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  template_id uuid REFERENCES digest_templates(id) ON DELETE SET NULL,

  -- Categorization at time of send
  category_label text, -- e.g., "2bed", "under_3k", etc.
  listing_price integer,
  listing_bedrooms integer,

  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create filter presets table
CREATE TABLE IF NOT EXISTS filter_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text, -- e.g., "by_bedrooms", "by_price", "by_neighborhood", "popular"

  -- Filter parameters (stored as JSONB)
  filter_params jsonb NOT NULL,
  -- Example: {"bedrooms": 2, "price_max": 3000, "broker_fee": false}

  -- Display configuration
  display_label text NOT NULL, -- e.g., "2BR Under $3K - No Fee"
  display_order integer DEFAULT 0,

  -- Short URL for this filter
  short_code text UNIQUE,

  -- Usage tracking
  usage_count integer DEFAULT 0,
  last_used_at timestamptz,

  -- Metadata
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_digest_templates_type
  ON digest_templates(template_type);

CREATE INDEX IF NOT EXISTS idx_digest_templates_default
  ON digest_templates(is_default) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_digest_templates_created_by
  ON digest_templates(created_by);

CREATE INDEX IF NOT EXISTS idx_digest_sends_sent_at
  ON digest_sends(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_digest_sends_template_id
  ON digest_sends(template_id);

CREATE INDEX IF NOT EXISTS idx_digest_sends_sent_by
  ON digest_sends(sent_by);

CREATE INDEX IF NOT EXISTS idx_digest_sent_listings_digest_send
  ON digest_sent_listings(digest_send_id);

CREATE INDEX IF NOT EXISTS idx_digest_sent_listings_listing_template
  ON digest_sent_listings(listing_id, template_id);

CREATE INDEX IF NOT EXISTS idx_digest_sent_listings_sent_at
  ON digest_sent_listings(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_filter_presets_category
  ON filter_presets(category) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_filter_presets_short_code
  ON filter_presets(short_code) WHERE short_code IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE digest_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_sent_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE filter_presets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for digest_templates
CREATE POLICY "Admins can view all digest templates"
  ON digest_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can create digest templates"
  ON digest_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update digest templates"
  ON digest_templates
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

CREATE POLICY "Admins can delete digest templates"
  ON digest_templates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- RLS Policies for digest_sends
CREATE POLICY "Admins can view all digest sends"
  ON digest_sends
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role can insert digest sends"
  ON digest_sends
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admins can insert digest sends"
  ON digest_sends
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- RLS Policies for digest_sent_listings
CREATE POLICY "Admins can view digest sent listings"
  ON digest_sent_listings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role can insert digest sent listings"
  ON digest_sent_listings
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admins can insert digest sent listings"
  ON digest_sent_listings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- RLS Policies for filter_presets
CREATE POLICY "Admins can view all filter presets"
  ON filter_presets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can create filter presets"
  ON filter_presets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update filter presets"
  ON filter_presets
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

CREATE POLICY "Admins can delete filter presets"
  ON filter_presets
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Insert default digest templates
INSERT INTO digest_templates (name, description, template_type, filter_config, is_default)
VALUES
  (
    'Unsent Listings Only',
    'Send only listings that have never been included in any previous digest',
    'unsent_only',
    '{"date_range_days": 30}'::jsonb,
    true
  ),
  (
    'Recent by Bedrooms',
    'Group recent listings by bedroom count with 5 listings per category',
    'recent_by_category',
    '{"date_range_days": 7}'::jsonb,
    true
  ),
  (
    'Filter Links Digest',
    'Send browse page links with live counts for popular filters',
    'filter_links',
    '{}'::jsonb,
    true
  )
ON CONFLICT DO NOTHING;

-- Insert default filter presets
INSERT INTO filter_presets (name, category, filter_params, display_label, display_order)
VALUES
  -- By Bedrooms
  ('Studio Apartments', 'by_bedrooms', '{"bedrooms": 0}'::jsonb, 'Studio Apartments', 1),
  ('1 Bedroom', 'by_bedrooms', '{"bedrooms": 1}'::jsonb, '1 Bedroom Apartments', 2),
  ('2 Bedrooms', 'by_bedrooms', '{"bedrooms": 2}'::jsonb, '2 Bedroom Apartments', 3),
  ('3 Bedrooms', 'by_bedrooms', '{"bedrooms": 3}'::jsonb, '3 Bedroom Apartments', 4),
  ('4+ Bedrooms', 'by_bedrooms', '{"bedrooms": 4}'::jsonb, '4+ Bedroom Apartments', 5),

  -- By Price Range
  ('Under $2000', 'by_price', '{"price_max": 2000}'::jsonb, 'Apartments Under $2,000', 10),
  ('$2000-$3000', 'by_price', '{"price_min": 2000, "price_max": 3000}'::jsonb, 'Apartments $2,000-$3,000', 11),
  ('$3000-$4000', 'by_price', '{"price_min": 3000, "price_max": 4000}'::jsonb, 'Apartments $3,000-$4,000', 12),
  ('Over $4000', 'by_price', '{"price_min": 4000}'::jsonb, 'Apartments Over $4,000', 13),

  -- Popular Combinations
  ('2BR Under $3K', 'popular', '{"bedrooms": 2, "price_max": 3000}'::jsonb, '2BR Under $3K', 20),
  ('No Fee Apartments', 'popular', '{"broker_fee": false}'::jsonb, 'No Fee Apartments', 21),
  ('2BR No Fee', 'popular', '{"bedrooms": 2, "broker_fee": false}'::jsonb, '2BR No Fee', 22),
  ('3BR Under $4K', 'popular', '{"bedrooms": 3, "price_max": 4000}'::jsonb, '3BR Under $4K', 23)
ON CONFLICT DO NOTHING;

-- Add helpful comments
COMMENT ON TABLE digest_templates IS
  'Reusable digest configurations with filters, deduplication rules, and email options';

COMMENT ON TABLE digest_sends IS
  'Audit log of all digest sends with metadata, counts, and execution details';

COMMENT ON TABLE digest_sent_listings IS
  'Detailed tracking of which listings were sent in which digests for deduplication';

COMMENT ON TABLE filter_presets IS
  'Common filter combinations for generating browse page links with counts in digest emails';

COMMENT ON COLUMN digest_templates.filter_config IS
  'JSONB object containing filter criteria like bedrooms, price range, locations, etc.';

COMMENT ON COLUMN digest_templates.category_limits IS
  'JSONB object defining how many listings to show per category (e.g., bedroom count)';

COMMENT ON COLUMN digest_templates.allow_resend IS
  'Whether to allow sending listings that were previously sent';

COMMENT ON COLUMN digest_templates.resend_after_days IS
  'Minimum days before a listing can be sent again (only if allow_resend is true)';

COMMENT ON COLUMN digest_templates.ignore_send_history IS
  'If true, completely ignore deduplication and send all matching listings';

COMMENT ON COLUMN digest_sends.config_snapshot IS
  'Snapshot of the template configuration at time of send for audit purposes';

COMMENT ON COLUMN digest_sent_listings.category_label IS
  'Category this listing was displayed under (e.g., "2bed", "under_3k")';

COMMENT ON COLUMN filter_presets.filter_params IS
  'JSONB object with filter parameters that map to browse page URL query string';

COMMENT ON COLUMN filter_presets.short_code IS
  'Optional short URL code for cleaner email links with click tracking';
