/*
  # SMS Renewal System - listing_renewal_conversations table and cron jobs
  
  ## Overview
  Enables SMS-based listing renewal with 14-day extensions. Agents receive SMS
  reminders 5 days before their listings expire and can reply YES to extend
  or NO to deactivate.
  
  ## 1. New Table: listing_renewal_conversations
    - Tracks SMS conversations for listing renewals
    - Supports batch processing for agents with multiple expiring listings
    - Includes state machine for conversation flow
  
  ## 2. Modified Tables
    - `listings` - Added hadirot_conversion column for tracking
  
  ## 3. Indexes
    - State + expires_at for finding active/expired conversations
    - Phone + state for finding conversations by phone number
    - Batch_id + listing_index for batch processing
    - Listing_id for finding conversations by listing
    - Created_at for duplicate prevention checks
  
  ## 4. Cron Jobs
    - send-renewal-reminders: Runs daily at 10 AM ET (14:00 UTC)
    - cleanup-expired-renewals: Runs daily at midnight UTC
  
  ## 5. Security
    - RLS enabled with service role full access
    - No user-facing access needed (all server-side)
  
  ## 6. Conversation States
    - pending: Waiting to be sent (for batched listings after first)
    - awaiting_availability: Waiting for YES/NO reply about listing
    - awaiting_hadirot_question: Waiting for Hadirot conversion answer
    - completed: Conversation finished successfully
    - timeout: No reply received before expiration
    - expired_link: Reply received after expiration
    - error: SMS send failed
*/

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create listing_renewal_conversations table
CREATE TABLE IF NOT EXISTS listing_renewal_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id),
  phone_number text NOT NULL,
  
  batch_id uuid,
  listing_index integer,
  total_in_batch integer,
  
  message_sent_at timestamptz DEFAULT NOW(),
  message_sid text,
  expires_at timestamptz NOT NULL,
  
  state text DEFAULT 'awaiting_availability' CHECK (state IN (
    'pending',
    'awaiting_availability', 
    'awaiting_hadirot_question', 
    'completed', 
    'timeout', 
    'expired_link',
    'error'
  )),
  
  reply_received_at timestamptz,
  reply_text text,
  action_taken text,
  
  hadirot_conversion boolean,
  
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_renewal_conv_state ON listing_renewal_conversations(state, expires_at);
CREATE INDEX IF NOT EXISTS idx_renewal_conv_phone ON listing_renewal_conversations(phone_number, state);
CREATE INDEX IF NOT EXISTS idx_renewal_conv_batch ON listing_renewal_conversations(batch_id, listing_index);
CREATE INDEX IF NOT EXISTS idx_renewal_conv_listing ON listing_renewal_conversations(listing_id);
CREATE INDEX IF NOT EXISTS idx_renewal_conv_created ON listing_renewal_conversations(created_at);

-- Enable RLS
ALTER TABLE listing_renewal_conversations ENABLE ROW LEVEL SECURITY;

-- Service role full access policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'listing_renewal_conversations' 
    AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON listing_renewal_conversations
      FOR ALL USING (true);
  END IF;
END $$;

-- Add hadirot_conversion column to listings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'hadirot_conversion'
  ) THEN
    ALTER TABLE listings ADD COLUMN hadirot_conversion boolean;
  END IF;
END $$;

COMMENT ON COLUMN listings.hadirot_conversion IS 'Whether the tenant/buyer found the listing through Hadirot. Tracked via SMS renewal conversation.';

COMMENT ON TABLE listing_renewal_conversations IS 'Tracks SMS conversations for listing renewal reminders. Supports batch processing for agents with multiple expiring listings.';

-- Unschedule existing jobs if they exist
DO $$
BEGIN
  PERFORM cron.unschedule('send-renewal-reminders');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-expired-renewals');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Schedule send-renewal-reminders cron job
-- 10 AM Eastern = 14:00 UTC (during EDT) or 15:00 UTC (during EST)
-- Using 14:00 UTC as default
SELECT cron.schedule(
  'send-renewal-reminders',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url:='https://[PROJECT-REF].supabase.co/functions/v1/send-renewal-reminders',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE-ROLE-KEY]"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Schedule cleanup-expired-renewals cron job
-- Run at midnight UTC
SELECT cron.schedule(
  'cleanup-expired-renewals',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url:='https://[PROJECT-REF].supabase.co/functions/v1/cleanup-expired-renewals',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE-ROLE-KEY]"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Verification and instructions
DO $$
DECLARE
  job_count integer;
BEGIN
  SELECT COUNT(*) INTO job_count
  FROM cron.job
  WHERE jobname IN ('send-renewal-reminders', 'cleanup-expired-renewals');

  IF job_count = 2 THEN
    RAISE NOTICE 'SMS Renewal System cron jobs scheduled successfully';
  ELSE
    RAISE WARNING 'Expected 2 cron jobs, found %', job_count;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: Update cron job URLs with your project details:';
  RAISE NOTICE '  1. Go to Supabase Dashboard > Database > Extensions > pg_cron';
  RAISE NOTICE '  2. Find jobs: send-renewal-reminders, cleanup-expired-renewals';
  RAISE NOTICE '  3. Replace [PROJECT-REF] with your project reference';
  RAISE NOTICE '  4. Replace [SERVICE-ROLE-KEY] with your service role key';
  RAISE NOTICE '';
  RAISE NOTICE 'Configure Twilio webhook:';
  RAISE NOTICE '  Set incoming SMS webhook URL to:';
  RAISE NOTICE '  https://[PROJECT-REF].supabase.co/functions/v1/handle-renewal-sms-webhook';
END $$;
