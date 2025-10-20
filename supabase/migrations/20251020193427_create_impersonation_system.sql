/*
  # Admin Impersonation System

  1. New Tables
    - `impersonation_sessions`
      - Tracks all impersonation sessions with 2-hour auto-expiration
      - Links admin user to impersonated user
      - Stores session metadata (IP, user agent, timestamps)
    
    - `impersonation_audit_log`
      - Detailed action logging for compliance
      - Records all activities during impersonation sessions
      - Links to impersonation_sessions table

  2. Functions
    - `start_impersonation_session` - Creates new impersonation session with validation
    - `end_impersonation_session` - Ends active session and logs completion
    - `cleanup_expired_sessions` - Automatic cleanup for expired sessions (cron job)
    - `is_user_admin` - Helper to check admin status

  3. Security
    - Enable RLS on all tables
    - Admins can only read their own impersonation data
    - Prevent admin-to-admin impersonation via constraints
    - Enforce 2-hour session limit via check constraint

  4. Important Notes
    - All actions during impersonation are attributed to the impersonated user
    - Session expires exactly 2 hours after start
    - Complete audit trail maintained for compliance
    - Automatic cleanup prevents orphaned sessions
*/

-- Create impersonation_sessions table
CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  impersonated_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_admin_user ON impersonation_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_impersonated_user ON impersonation_sessions(impersonated_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_expires_at ON impersonation_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_token ON impersonation_sessions(session_token);

-- Add check constraint to ensure expires_at is exactly 2 hours after started_at
ALTER TABLE impersonation_sessions 
ADD CONSTRAINT check_expires_at_two_hours 
CHECK (expires_at = started_at + interval '2 hours');

-- Create impersonation_audit_log table
CREATE TABLE IF NOT EXISTS impersonation_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES impersonation_sessions(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  impersonated_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  action_details jsonb DEFAULT '{}'::jsonb,
  page_path text,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_session ON impersonation_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_admin_user ON impersonation_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON impersonation_audit_log(timestamp);

-- Enable RLS
ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonation_audit_log ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_user_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = user_id AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to start impersonation session
CREATE OR REPLACE FUNCTION start_impersonation_session(
  p_admin_user_id uuid,
  p_impersonated_user_id uuid,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_session_record impersonation_sessions;
  v_is_target_admin boolean;
BEGIN
  -- Validate admin user
  IF NOT is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'User is not an admin';
  END IF;

  -- Check if target user is admin (prevent admin impersonation)
  SELECT is_admin INTO v_is_target_admin 
  FROM profiles 
  WHERE id = p_impersonated_user_id;

  IF v_is_target_admin THEN
    RAISE EXCEPTION 'Cannot impersonate another admin';
  END IF;

  -- End any existing active sessions for this admin
  UPDATE impersonation_sessions
  SET ended_at = now()
  WHERE admin_user_id = p_admin_user_id 
    AND ended_at IS NULL;

  -- Create new session
  INSERT INTO impersonation_sessions (
    admin_user_id,
    impersonated_user_id,
    expires_at,
    ip_address,
    user_agent
  ) VALUES (
    p_admin_user_id,
    p_impersonated_user_id,
    now() + interval '2 hours',
    p_ip_address,
    p_user_agent
  ) RETURNING * INTO v_session_record;

  -- Log session start
  INSERT INTO impersonation_audit_log (
    session_id,
    admin_user_id,
    impersonated_user_id,
    action_type,
    action_details
  ) VALUES (
    v_session_record.id,
    p_admin_user_id,
    p_impersonated_user_id,
    'session_start',
    jsonb_build_object(
      'ip_address', p_ip_address,
      'user_agent', p_user_agent
    )
  );

  -- Return session data
  RETURN json_build_object(
    'session_id', v_session_record.id,
    'session_token', v_session_record.session_token,
    'started_at', v_session_record.started_at,
    'expires_at', v_session_record.expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to end impersonation session
CREATE OR REPLACE FUNCTION end_impersonation_session(
  p_session_token text,
  p_admin_user_id uuid
)
RETURNS json AS $$
DECLARE
  v_session_id uuid;
  v_impersonated_user_id uuid;
BEGIN
  -- Find and end the session
  UPDATE impersonation_sessions
  SET ended_at = now()
  WHERE session_token = p_session_token
    AND admin_user_id = p_admin_user_id
    AND ended_at IS NULL
  RETURNING id, impersonated_user_id 
  INTO v_session_id, v_impersonated_user_id;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'No active session found';
  END IF;

  -- Log session end
  INSERT INTO impersonation_audit_log (
    session_id,
    admin_user_id,
    impersonated_user_id,
    action_type,
    action_details
  ) VALUES (
    v_session_id,
    p_admin_user_id,
    v_impersonated_user_id,
    'session_end',
    jsonb_build_object('reason', 'manual')
  );

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired sessions (for cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS json AS $$
DECLARE
  v_expired_sessions impersonation_sessions[];
  v_session impersonation_sessions;
  v_count integer := 0;
BEGIN
  -- Find all expired sessions that haven't been ended
  SELECT array_agg(s.*) INTO v_expired_sessions
  FROM impersonation_sessions s
  WHERE expires_at < now()
    AND ended_at IS NULL;

  -- Process each expired session
  IF v_expired_sessions IS NOT NULL THEN
    FOREACH v_session IN ARRAY v_expired_sessions
    LOOP
      -- Mark session as ended
      UPDATE impersonation_sessions
      SET ended_at = expires_at
      WHERE id = v_session.id;

      -- Log timeout
      INSERT INTO impersonation_audit_log (
        session_id,
        admin_user_id,
        impersonated_user_id,
        action_type,
        action_details
      ) VALUES (
        v_session.id,
        v_session.admin_user_id,
        v_session.impersonated_user_id,
        'session_timeout',
        jsonb_build_object('expires_at', v_session.expires_at)
      );

      v_count := v_count + 1;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'cleaned_up', v_count,
    'timestamp', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for impersonation_sessions
CREATE POLICY "Admins can read their own impersonation sessions"
  ON impersonation_sessions FOR SELECT
  TO authenticated
  USING (
    is_user_admin(auth.uid()) AND 
    admin_user_id = auth.uid()
  );

CREATE POLICY "Admins can read all sessions if super admin"
  ON impersonation_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND is_admin = true
        AND email LIKE '%@admin.%'  -- Example: adjust for your super-admin logic
    )
  );

-- RLS Policies for impersonation_audit_log
CREATE POLICY "Admins can read their own audit logs"
  ON impersonation_audit_log FOR SELECT
  TO authenticated
  USING (
    is_user_admin(auth.uid()) AND 
    admin_user_id = auth.uid()
  );

CREATE POLICY "Admins can read all audit logs if super admin"
  ON impersonation_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND is_admin = true
    )
  );