/*
  # Create analytics_events table for first-party analytics

  1. New Tables
    - `analytics_events`
      - `id` (uuid, primary key)
      - `ts` (timestamptz, default now())
      - `session_id` (text, required)
      - `user_id` (uuid, optional)
      - `event_name` (text, required)
      - `page` (text, optional)
      - `referrer` (text, optional)
      - `user_agent` (text, optional)
      - `ip` (text, optional - truncated for privacy)
      - `props` (jsonb, default {})

  2. Security
    - Enable RLS on `analytics_events` table
    - No public insert policies (only Edge Function can insert)
    - Public can read their own events if needed

  3. Indexes
    - Primary key on `id`
    - Index on `ts` (descending for time-based queries)
    - Composite index on `(event_name, ts)`
    - Index on `session_id`
    - Index on `user_id`
    - GIN index on `props` for JSONB queries
*/

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz DEFAULT now() NOT NULL,
  session_id text NOT NULL,
  user_id uuid,
  event_name text NOT NULL,
  page text,
  referrer text,
  user_agent text,
  ip text,
  props jsonb DEFAULT '{}' NOT NULL
);

-- Enable RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- No insert policies for public/authenticated users
-- Only the Edge Function with service role can insert

-- Optional: Allow users to read their own events (for future analytics dashboard)
CREATE POLICY "Users can read own events"
  ON analytics_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS analytics_events_ts_desc_idx ON analytics_events (ts DESC);
CREATE INDEX IF NOT EXISTS analytics_events_event_name_ts_idx ON analytics_events (event_name, ts DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS analytics_events_user_id_idx ON analytics_events (user_id);
CREATE INDEX IF NOT EXISTS analytics_events_props_gin_idx ON analytics_events USING GIN (props);

-- Add foreign key constraint to profiles table
ALTER TABLE analytics_events 
ADD CONSTRAINT analytics_events_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;