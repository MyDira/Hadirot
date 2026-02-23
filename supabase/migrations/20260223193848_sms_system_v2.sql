/*
  # SMS System V2 - Phone Normalization, Message Logging, Admin Alerts

  1. Modified Tables
    - `listings`: Add `contact_phone_e164` column (normalized E.164 phone), backfill existing data, add indexes, add auto-normalize trigger
    - `listing_renewal_conversations`: Add `conversation_type` column (renewal, callback, etc.)

  2. New Tables
    - `sms_messages`: Tracks every inbound and outbound SMS for conversation history
      - `id` (uuid, primary key)
      - `conversation_id` (uuid, FK to listing_renewal_conversations)
      - `direction` (text: inbound/outbound)
      - `phone_number` (text)
      - `message_body` (text)
      - `message_sid` (text, Twilio SID)
      - `message_source` (text: callback_notification, report_rented, renewal_reminder, weekly_report, system_response, fallback_response, admin_alert)
      - `listing_id` (uuid, FK to listings)
      - `status` (text)
      - `metadata` (jsonb)
      - `created_at` (timestamptz)
    - `sms_admin_config`: Singleton config for admin email notifications
      - `id` (integer, always 1)
      - `admin_email` (text)
      - `notify_on_errors` (boolean)
      - `notify_on_unrecognized` (boolean)
      - `notify_on_timeouts` (boolean)

  3. Security
    - RLS enabled on both new tables
    - Service role full access policies (edge functions use service role key)

  4. Important Notes
    - Phone normalization handles all common US formats (10-digit, 11-digit with leading 1)
    - Trigger auto-normalizes contact_phone_e164 on every INSERT or UPDATE of contact_phone
    - Backfill runs only where contact_phone_e164 IS NULL to be safe for re-runs
*/

-- ===========================================
-- 1. NORMALIZED PHONE COLUMN ON LISTINGS
-- ===========================================

ALTER TABLE listings ADD COLUMN IF NOT EXISTS contact_phone_e164 text;

UPDATE listings 
SET contact_phone_e164 = 
  CASE 
    WHEN contact_phone IS NULL THEN NULL
    WHEN LENGTH(REGEXP_REPLACE(contact_phone, '[^0-9]', '', 'g')) = 10 
      THEN '+1' || REGEXP_REPLACE(contact_phone, '[^0-9]', '', 'g')
    WHEN LENGTH(REGEXP_REPLACE(contact_phone, '[^0-9]', '', 'g')) = 11 
      AND REGEXP_REPLACE(contact_phone, '[^0-9]', '', 'g') LIKE '1%'
      THEN '+' || REGEXP_REPLACE(contact_phone, '[^0-9]', '', 'g')
    ELSE '+1' || REGEXP_REPLACE(contact_phone, '[^0-9]', '', 'g')
  END
WHERE contact_phone IS NOT NULL AND contact_phone_e164 IS NULL;

CREATE INDEX IF NOT EXISTS idx_listings_phone_e164_active 
  ON listings(contact_phone_e164) 
  WHERE contact_phone_e164 IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_listings_phone_e164_all
  ON listings(contact_phone_e164)
  WHERE contact_phone_e164 IS NOT NULL;

CREATE OR REPLACE FUNCTION normalize_contact_phone()
RETURNS TRIGGER AS $$
DECLARE
  digits text;
BEGIN
  IF NEW.contact_phone IS NOT NULL THEN
    digits := REGEXP_REPLACE(NEW.contact_phone, '[^0-9]', '', 'g');
    IF LENGTH(digits) = 11 AND digits LIKE '1%' THEN
      digits := SUBSTRING(digits FROM 2);
    END IF;
    NEW.contact_phone_e164 := '+1' || digits;
  ELSE
    NEW.contact_phone_e164 := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_contact_phone ON listings;
CREATE TRIGGER trg_normalize_contact_phone
  BEFORE INSERT OR UPDATE OF contact_phone ON listings
  FOR EACH ROW EXECUTE FUNCTION normalize_contact_phone();

-- ===========================================
-- 2. CONVERSATION TYPE ON EXISTING TABLE
-- ===========================================

ALTER TABLE listing_renewal_conversations 
  ADD COLUMN IF NOT EXISTS conversation_type text DEFAULT 'renewal';

-- ===========================================
-- 3. SMS MESSAGE LOG TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES listing_renewal_conversations(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone_number text NOT NULL,
  message_body text NOT NULL,
  message_sid text,
  message_source text,
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  status text DEFAULT 'sent',
  metadata jsonb DEFAULT NULL,
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_phone ON sms_messages(phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_conversation ON sms_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sms_messages_direction ON sms_messages(direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_listing ON sms_messages(listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_messages_source_phone ON sms_messages(message_source, phone_number, created_at DESC);

ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'sms_messages' 
    AND policyname = 'Service role full access on sms_messages'
  ) THEN
    CREATE POLICY "Service role full access on sms_messages" ON sms_messages FOR ALL USING (true);
  END IF;
END $$;

-- ===========================================
-- 4. ADMIN CONFIG TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS sms_admin_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  admin_email text,
  notify_on_errors boolean DEFAULT true,
  notify_on_unrecognized boolean DEFAULT true,
  notify_on_timeouts boolean DEFAULT false,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

ALTER TABLE sms_admin_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'sms_admin_config' 
    AND policyname = 'Service role full access on sms_admin_config'
  ) THEN
    CREATE POLICY "Service role full access on sms_admin_config" ON sms_admin_config FOR ALL USING (true);
  END IF;
END $$;

INSERT INTO sms_admin_config (admin_email) 
VALUES ('admin@hadirot.com')
ON CONFLICT (id) DO NOTHING;