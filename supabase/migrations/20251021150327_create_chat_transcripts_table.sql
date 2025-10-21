/*
  # Create Chat Transcripts System

  ## Overview
  This migration creates a comprehensive system for tracking and analyzing Tawk.to chat interactions
  with visitors and users on the HaDirot real estate platform.

  ## New Tables
  
  ### `chat_transcripts`
  Stores chat session metadata and analytics:
  - `id` (uuid, primary key) - Unique identifier for the chat session
  - `user_id` (uuid, nullable) - Links to auth.users if visitor was authenticated
  - `visitor_name` (text, nullable) - Name provided by visitor
  - `visitor_email` (text, nullable) - Email provided by visitor
  - `started_at` (timestamptz) - When the chat session started
  - `ended_at` (timestamptz, nullable) - When the chat session ended
  - `page_url` (text) - URL where chat was initiated
  - `user_role` (text, nullable) - Role of authenticated user (agent, user, admin)
  - `agency_name` (text, nullable) - Agency name if user is an agent
  - `is_admin` (boolean, default false) - Whether user has admin privileges
  - `chat_rating` (integer, nullable) - Visitor satisfaction rating (1-5)
  - `message_count` (integer, default 0) - Number of messages exchanged
  - `tags` (text[], default []) - Tags applied to the conversation
  - `notes` (text, nullable) - Internal notes about the conversation
  - `metadata` (jsonb, default {}) - Additional flexible metadata
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

  ### `chat_messages`
  Stores individual messages from chat sessions:
  - `id` (uuid, primary key) - Unique identifier for the message
  - `chat_id` (uuid) - Foreign key to chat_transcripts
  - `sender_type` (text) - Either 'visitor' or 'agent'
  - `sender_name` (text) - Name of the sender
  - `message` (text) - The message content
  - `sent_at` (timestamptz, default now()) - When the message was sent
  - `created_at` (timestamptz, default now())

  ## Security
  - Enable RLS on all tables
  - Only admins can view chat transcripts
  - Only admins can view chat messages
  - System can insert chat data without authentication (for webhook)
  - Admins can update notes and tags on transcripts

  ## Indexes
  - Index on user_id for fast user lookup
  - Index on started_at for chronological queries
  - Index on page_url for page-specific analytics
  - Index on tags for filtering by conversation topics
  - Index on chat_id in messages table for fast message retrieval
*/

-- Create chat_transcripts table
CREATE TABLE IF NOT EXISTS chat_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  visitor_name text,
  visitor_email text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  page_url text NOT NULL,
  user_role text,
  agency_name text,
  is_admin boolean DEFAULT false,
  chat_rating integer CHECK (chat_rating >= 1 AND chat_rating <= 5),
  message_count integer DEFAULT 0,
  tags text[] DEFAULT '{}',
  notes text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chat_transcripts(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('visitor', 'agent')),
  sender_name text NOT NULL,
  message text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chat_transcripts_user_id ON chat_transcripts(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_transcripts_started_at ON chat_transcripts(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_transcripts_page_url ON chat_transcripts(page_url);
CREATE INDEX IF NOT EXISTS idx_chat_transcripts_tags ON chat_transcripts USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sent_at ON chat_messages(sent_at DESC);

-- Enable RLS
ALTER TABLE chat_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for chat_transcripts

-- Admins can view all chat transcripts
CREATE POLICY "Admins can view all chat transcripts"
  ON chat_transcripts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Admins can update chat transcripts (notes, tags, ratings)
CREATE POLICY "Admins can update chat transcripts"
  ON chat_transcripts
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

-- Allow system to insert chat transcripts (for webhook or edge function)
CREATE POLICY "System can insert chat transcripts"
  ON chat_transcripts
  FOR INSERT
  WITH CHECK (true);

-- Policies for chat_messages

-- Admins can view all chat messages
CREATE POLICY "Admins can view all chat messages"
  ON chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Allow system to insert chat messages (for webhook or edge function)
CREATE POLICY "System can insert chat messages"
  ON chat_messages
  FOR INSERT
  WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_chat_transcripts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS chat_transcripts_updated_at ON chat_transcripts;
CREATE TRIGGER chat_transcripts_updated_at
  BEFORE UPDATE ON chat_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_transcripts_updated_at();

-- Create view for chat analytics
CREATE OR REPLACE VIEW chat_analytics AS
SELECT
  DATE_TRUNC('day', started_at) as date,
  COUNT(*) as total_chats,
  COUNT(CASE WHEN ended_at IS NOT NULL THEN 1 END) as completed_chats,
  COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as authenticated_chats,
  COUNT(CASE WHEN user_id IS NULL THEN 1 END) as guest_chats,
  AVG(message_count) as avg_messages,
  AVG(chat_rating) as avg_rating,
  AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60) as avg_duration_minutes
FROM chat_transcripts
GROUP BY DATE_TRUNC('day', started_at)
ORDER BY date DESC;

-- Grant access to the view for admins
GRANT SELECT ON chat_analytics TO authenticated;
