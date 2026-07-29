/*
  # Landlord SMS outreach + admin SMS inbox

  ## What this enables
  1. Admin texts vetted intake leads a "can we post your apartment — first 2
     weeks free" offer (edge fn `send-intake-outreach-sms`).
  2. A YES reply auto-publishes the lead to the house account and the
     conversation machinery needs a new state for that
     (`awaiting_outreach_response`, handled in `handle-renewal-sms-webhook`).
  3. A new admin Messages inbox reads `sms_messages` directly, so admins get
     SELECT access (RLS) plus an UPDATE path for read receipts, and a thread
     summary RPC.

  ## Changes
  - `scraped_listings`: `outreach_status` (NULL = never texted; sent / replied /
    confirmed / declined / error), `outreach_sent_at`, `outreach_conversation_id`.
  - `listing_renewal_conversations` state CHECK: + 'awaiting_outreach_response'
    (the constraint is an explicit list — see 20260702000000 for why forgetting
    this silently breaks inserts).
  - `sms_messages`: `read_by_admin_at` + partial index for the unread badge.
  - RLS: admin SELECT on `sms_messages` + `listing_renewal_conversations`,
    admin UPDATE on `sms_messages` (read receipts). Writes of actual messages
    stay service-role-only (edge functions).
  - RPC `admin_sms_threads`: one row per phone number with last message,
    unread count, and a best-effort contact name from intake/live listings.
    SECURITY INVOKER — row access rides on the new admin RLS policies.
*/

-- 1. scraped_listings outreach tracking ------------------------------------

ALTER TABLE scraped_listings
  ADD COLUMN IF NOT EXISTS outreach_status text
    CHECK (outreach_status IN ('sent', 'replied', 'confirmed', 'declined', 'error')),
  ADD COLUMN IF NOT EXISTS outreach_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS outreach_conversation_id uuid;

COMMENT ON COLUMN scraped_listings.outreach_status IS
  'SMS offer workflow: NULL = never texted, sent = offer out, replied = landlord answered something else (see Messages), confirmed = YES -> auto-published, declined = NO, error = send/publish failed.';

CREATE INDEX IF NOT EXISTS idx_scraped_listings_outreach_conv
  ON scraped_listings(outreach_conversation_id)
  WHERE outreach_conversation_id IS NOT NULL;

-- 2. Conversation state for outreach ---------------------------------------

ALTER TABLE listing_renewal_conversations
  DROP CONSTRAINT IF EXISTS listing_renewal_conversations_state_check;

ALTER TABLE listing_renewal_conversations
  ADD CONSTRAINT listing_renewal_conversations_state_check
  CHECK (state = ANY (ARRAY[
    'pending', 'awaiting_availability', 'awaiting_hadirot_question',
    'completed', 'timeout', 'expired_link', 'error',
    'awaiting_report_response', 'callback_sent',
    'awaiting_listing_selection', 'awaiting_disambiguation',
    -- landlord outreach: offer sent, waiting for YES / NO / questions
    'awaiting_outreach_response'
  ]::text[]));

-- 3. Read receipts for the admin inbox --------------------------------------

ALTER TABLE sms_messages
  ADD COLUMN IF NOT EXISTS read_by_admin_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sms_messages_admin_unread
  ON sms_messages(created_at DESC)
  WHERE direction = 'inbound' AND read_by_admin_at IS NULL;

-- 4. Admin RLS for the inbox -------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sms_messages' AND policyname = 'Admins can read sms messages'
  ) THEN
    CREATE POLICY "Admins can read sms messages" ON sms_messages
      FOR SELECT TO authenticated
      USING ((SELECT public.is_admin_cached()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sms_messages' AND policyname = 'Admins can update sms messages'
  ) THEN
    CREATE POLICY "Admins can update sms messages" ON sms_messages
      FOR UPDATE TO authenticated
      USING ((SELECT public.is_admin_cached()))
      WITH CHECK ((SELECT public.is_admin_cached()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'listing_renewal_conversations'
      AND policyname = 'Admins can read renewal conversations'
  ) THEN
    CREATE POLICY "Admins can read renewal conversations" ON listing_renewal_conversations
      FOR SELECT TO authenticated
      USING ((SELECT public.is_admin_cached()));
  END IF;
END $$;

-- 5. Thread summary RPC -------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_sms_threads(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  phone_number text,
  last_message_at timestamptz,
  last_message_body text,
  last_direction text,
  unread_count bigint,
  message_count bigint,
  contact_name text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH threads AS (
    SELECT
      m.phone_number,
      max(m.created_at) AS last_message_at,
      count(*) AS message_count,
      count(*) FILTER (WHERE m.direction = 'inbound' AND m.read_by_admin_at IS NULL) AS unread_count
    FROM sms_messages m
    GROUP BY m.phone_number
  ),
  enriched AS (
    SELECT
      t.phone_number,
      t.last_message_at,
      t.message_count,
      t.unread_count,
      lm.message_body AS last_message_body,
      lm.direction AS last_direction,
      COALESCE(sl.contact_name, sl.agency_name, l.contact_name) AS contact_name
    FROM threads t
    CROSS JOIN LATERAL (
      SELECT message_body, direction
      FROM sms_messages
      WHERE sms_messages.phone_number = t.phone_number
      ORDER BY created_at DESC
      LIMIT 1
    ) lm
    LEFT JOIN LATERAL (
      SELECT contact_name, agency_name
      FROM scraped_listings
      WHERE right(regexp_replace(COALESCE(scraped_listings.contact_phone, ''), '\D', '', 'g'), 10)
          = right(regexp_replace(t.phone_number, '\D', '', 'g'), 10)
        AND length(regexp_replace(COALESCE(scraped_listings.contact_phone, ''), '\D', '', 'g')) >= 10
      ORDER BY updated_at DESC
      LIMIT 1
    ) sl ON true
    LEFT JOIN LATERAL (
      SELECT contact_name
      FROM listings
      WHERE listings.contact_phone_e164 = t.phone_number
      ORDER BY created_at DESC
      LIMIT 1
    ) l ON true
  )
  SELECT
    phone_number, last_message_at, last_message_body, last_direction,
    unread_count, message_count, contact_name
  FROM enriched
  WHERE (
    p_search IS NULL OR p_search = ''
    OR phone_number ILIKE '%' || p_search || '%'
    OR contact_name ILIKE '%' || p_search || '%'
  )
  ORDER BY last_message_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION admin_sms_threads(text, integer, integer) TO authenticated;
