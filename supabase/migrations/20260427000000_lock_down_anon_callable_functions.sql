-- Lock down SECURITY DEFINER functions that should not be callable via the
-- PostgREST API by anon or authenticated roles. Surfaced by the Supabase
-- security advisor (Section 4.1a of the audit report).
--
-- Two categories handled:
--   1. Trigger functions — only ever called by triggers, never by REST.
--      Triggers run as the table owner and don't check EXECUTE privilege on
--      the calling role, so revoking from PUBLIC/anon/authenticated is safe.
--   2. Destructive admin / cron / housekeeping functions — should only be
--      callable via service_role (cron jobs, n8n, edge functions). REST API
--      access risks anonymous callers triggering deletes, expirations, etc.
--
-- Approach: use a DO block with pg_get_function_identity_arguments so we
-- match the actual function signatures regardless of overloads, and skip
-- gracefully if a function isn't present.

DO $$
DECLARE
  fn_record RECORD;
  -- Functions that must NEVER be REST-callable. Trigger fns and destructive
  -- admin/housekeeping operations.
  hard_locked text[] := ARRAY[
    'prevent_privileged_profile_inserts',
    'prevent_privileged_profile_updates',
    'sync_profile_is_admin_to_auth',
    'handle_featured_listing_update',
    'set_listing_deactivated_timestamp',
    'trg_fn_listings_call_for_price_null_price',
    'expire_featured_listings',
    'auto_delete_very_old_listings',
    'auto_delete_very_old_commercial_listings',
    'auto_inactivate_old_listings',
    'auto_inactivate_old_commercial_listings',
    'cleanup_analytics_events',
    'rollup_analytics_events',
    'trigger_daily_digest_if_time',
    'activate_pending_featured_purchase'
  ];
  -- Functions that should be callable by signed-in users (RLS policies, RPCs
  -- the frontend uses) but never by anon. Revoke from anon and PUBLIC, then
  -- explicitly grant to authenticated.
  auth_only text[] := ARRAY[
    'is_admin_cached',
    'require_admin',
    'get_user_permissions',
    'get_listing_inquiries',
    'get_owner_listing_inquiry_counts',
    'get_featured_listings_count_by_user',
    'user_can_post_sales',
    'ensure_agency_for_owner'
  ];
BEGIN
  FOR fn_record IN
    SELECT
      n.nspname || '.' || quote_ident(p.proname) ||
      '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = ANY(hard_locked)
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || fn_record.sig || ' FROM PUBLIC, anon, authenticated';
    RAISE NOTICE 'Locked down (hard): %', fn_record.sig;
  END LOOP;

  FOR fn_record IN
    SELECT
      n.nspname || '.' || quote_ident(p.proname) ||
      '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = ANY(auth_only)
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || fn_record.sig || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || fn_record.sig || ' TO authenticated';
    RAISE NOTICE 'Restricted to authenticated: %', fn_record.sig;
  END LOOP;
END $$;
