/*
  # Revamp Daily Cards System to Text-Only Format

  1. Configuration Updates
    - Add whatsapp_group_url column to store WhatsApp group link
    - Update default delivery_time from 06:00 to 17:00 (5 PM)
    - Update default days_to_include from 7 to 1 (past 24 hours)
    - Set WhatsApp group URL to provided link

  2. Notes
    - Image generation will be removed from edge function
    - System will generate text-only emails optimized for WhatsApp
    - Storage bucket for daily-listing-cards will remain but won't be actively used
*/

-- Add whatsapp_group_url column to daily_cards_config
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_cards_config' AND column_name = 'whatsapp_group_url'
  ) THEN
    ALTER TABLE daily_cards_config ADD COLUMN whatsapp_group_url text DEFAULT 'https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt';
  END IF;
END $$;

-- Update existing configuration with new defaults
UPDATE daily_cards_config
SET
  delivery_time = '17:00',
  days_to_include = 1,
  whatsapp_group_url = 'https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt',
  updated_at = now()
WHERE id IN (SELECT id FROM daily_cards_config LIMIT 1);

-- If no config exists, insert default configuration
INSERT INTO daily_cards_config (
  enabled,
  delivery_time,
  recipient_emails,
  max_listings,
  include_featured_only,
  days_to_include,
  timezone,
  whatsapp_group_url
)
SELECT
  false,
  '17:00',
  ARRAY[]::text[],
  20,
  false,
  1,
  'America/New_York',
  'https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt'
WHERE NOT EXISTS (SELECT 1 FROM daily_cards_config LIMIT 1);
