-- Surgical fix for the listing-approval 403 caused by
-- 20260427000000_lock_down_anon_callable_functions.sql.
--
-- That migration revoked EXECUTE from authenticated on several trigger
-- functions. Postgres trigger invocation can require EXECUTE on the calling
-- role even though the function runs SECURITY DEFINER, so revoking from
-- authenticated breaks any UPDATE/INSERT path that fires those triggers.
--
-- Re-grant EXECUTE to authenticated for trigger functions only. Destructive
-- admin/cron functions (auto_delete_*, expire_*, cleanup_*, rollup_*,
-- trigger_daily_digest_if_time, activate_pending_featured_purchase) stay
-- locked since those are never called from a normal user flow.

DO $$
DECLARE
  fn_record RECORD;
  trigger_fns text[] := ARRAY[
    'prevent_privileged_profile_inserts',
    'prevent_privileged_profile_updates',
    'sync_profile_is_admin_to_auth',
    'handle_featured_listing_update',
    'set_listing_deactivated_timestamp',
    'trg_fn_listings_call_for_price_null_price'
  ];
BEGIN
  FOR fn_record IN
    SELECT
      n.nspname || '.' || quote_ident(p.proname) ||
      '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = ANY(trigger_fns)
  LOOP
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || fn_record.sig || ' TO authenticated';
    RAISE NOTICE 'Re-granted EXECUTE to authenticated: %', fn_record.sig;
  END LOOP;
END $$;
