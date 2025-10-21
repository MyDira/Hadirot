/*
  # Remove Impersonation System

  This migration removes the complete impersonation tracking infrastructure,
  including tables, functions, and policies. The system is being simplified
  to use direct authentication token generation instead.

  1. Tables Dropped
    - `impersonation_audit_log` - Detailed action logging
    - `impersonation_sessions` - Session tracking with expiration

  2. Functions Dropped
    - `cleanup_expired_sessions` - Automatic cleanup cron function
    - `end_impersonation_session` - Session termination function
    - `start_impersonation_session` - Session creation function
    - `is_user_admin` - Helper function for admin validation

  3. Security Changes
    - All RLS policies for impersonation tables are dropped automatically with the tables
    - No impact on existing user authentication or profiles table
    - Admin privileges (is_admin column) remain unchanged in profiles table

  4. Important Notes
    - This does not affect normal user authentication
    - Admin sign-in-as-user functionality will use new simplified Edge Function
    - No audit trail or session tracking after this migration
    - All existing impersonation sessions are immediately invalidated
*/

-- Drop audit log table (must drop first due to foreign key constraints)
DROP TABLE IF EXISTS impersonation_audit_log CASCADE;

-- Drop sessions table
DROP TABLE IF EXISTS impersonation_sessions CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS cleanup_expired_sessions() CASCADE;
DROP FUNCTION IF EXISTS end_impersonation_session(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS start_impersonation_session(uuid, uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS is_user_admin(uuid) CASCADE;
