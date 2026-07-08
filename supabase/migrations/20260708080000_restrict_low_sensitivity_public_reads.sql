/*
  # [P2 / Track-1] Restrict low-sensitivity public reads

  ## Finding (audit 01-database-rls.md)
  Several tables grant anonymous SELECT via USING (true):
    - analytics_sessions          ("as_read_all", public) — leaks
      user_id <-> session_id <-> anon_id linkage + timing (behavioral privacy)
    - modal_user_interactions     ("Anyone can read modal interactions", public)
    - admin_settings              ("Anyone can read admin settings", public)
    - daily_analytics / daily_top_filters / daily_top_listings (pre-aggregated)

  ## What this migration changes — and deliberately does NOT change

  1. analytics_sessions — FIXED here.
     Drop the public "as_read_all" SELECT policy. The client never reads this
     table (no `.from('analytics_sessions')` in src/); admin analytics come from
     SECURITY DEFINER RPCs (analytics_summary, etc.) which bypass RLS. An explicit
     admin-only SELECT policy is added for any future direct admin-UI read.

  2. modal_user_interactions — INTENTIONALLY LEFT PUBLIC (deviates from the audit
     fix-prompt, on purpose).
     Unlike analytics_sessions, the CLIENT reads this table for ANONYMOUS users:
     src/services/modals.ts `getUserModalHistory()` (called by `shouldDisplayModal`)
     and `getModalStatistics()` run `.from('modal_user_interactions').select(...)`
     filtered client-side by user_fingerprint. Anonymous visitors have no
     auth.uid(), so there is no clean RLS predicate that keeps modal
     frequency-capping working while restricting reads (the prior fingerprint-in-
     session-var approach was removed in 20251204195543 precisely because the
     frontend never set it). Dropping the public read here would break modal
     display-frequency logic for all anonymous visitors. Left as-is and flagged;
     a proper fix belongs at the app layer (move reads behind a SECURITY DEFINER
     RPC that filters by fingerprint) and is out of scope for a pure RLS migration.

  3. admin_settings — LEFT ALONE (conservative, per audit guidance).
     The frontend depends on some flags (e.g. sales_feature_enabled). Narrowing
     the row/column exposure safely requires a SECURITY DEFINER getter and
     frontend coordination; not done here to avoid breaking feature flags.

  4. daily_analytics / daily_top_* — LEFT ALONE (pre-aggregated, low risk).

  ## Reversal (spirit)
  Recreate "as_read_all" on analytics_sessions as FOR SELECT TO public USING (true).

  ## Verification (manual)
    - Anon SELECT FROM analytics_sessions => 0 rows / permission denied.
    - Admin analytics dashboards (RPC-backed) still populate.
    - Modal display-frequency behavior unchanged for anonymous visitors.
*/

-- analytics_sessions: remove anonymous read, keep admin-only read ---------------
DROP POLICY IF EXISTS "as_read_all" ON public.analytics_sessions;
DROP POLICY IF EXISTS "analytics_sessions_admin_read" ON public.analytics_sessions;
CREATE POLICY "analytics_sessions_admin_read"
  ON public.analytics_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_admin_cached());
