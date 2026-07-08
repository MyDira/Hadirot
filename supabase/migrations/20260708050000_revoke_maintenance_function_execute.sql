/*
  # [P2 / Track-1] Revoke anon/authenticated EXECUTE on maintenance functions

  ## Finding (audit 01-database-rls.md)
  Several SECURITY DEFINER lifecycle/maintenance functions are EXECUTE-able by
  anon/authenticated and can be invoked on demand via POST /rest/v1/rpc/<fn>:
    - deactivate_old_listings()              (cron cleanup; fixed WHERE clauses)
    - delete_very_old_listings()             (cron cleanup; does storage deletes)
    - reconcile_individual_listing_anchors() (cron reconcile)
    - enforce_subscription_listing_cap()     (trigger fn; must never be RPC-called)
  They take no arbitrary targets, so this is not arbitrary deletion, but a caller
  can force these batch jobs to run (extra write load, premature runs). pg_cron
  runs as the job owner/superuser and is unaffected by these grants. Trigger
  functions run in the context of the triggering statement, so revoking direct
  EXECUTE does not affect trigger firing.

  Migration 20260427000000_lock_down_anon_callable_functions.sql locked some
  functions but missed these four.

  ## Intentionally left public (do NOT revoke — per audit non-findings)
    - Admin-gated analytics RPCs (they call require_admin()/is_admin internally).
    - Genuinely public helpers: search_locations, get_sales_feature_enabled,
      increment_article_views.
  touch_session / increment_listing_views are noted P3 (analytics poisoning) and
  are deliberately NOT changed here to avoid breaking anon analytics ingest.

  ## Reversal (spirit)
  GRANT EXECUTE ON FUNCTION ... TO anon, authenticated;  (reintroduces exposure)

  ## Verification (manual)
  --   SELECT has_function_privilege('anon',
  --     'public.delete_very_old_listings()', 'EXECUTE');   -- expect false
*/

REVOKE EXECUTE ON FUNCTION public.deactivate_old_listings()              FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.delete_very_old_listings()             FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.reconcile_individual_listing_anchors() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_subscription_listing_cap()     FROM anon, authenticated, public;
