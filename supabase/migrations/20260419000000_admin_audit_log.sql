-- Admin audit log. Persists security-sensitive admin actions (impersonation,
-- user deletion, etc.) so an admin can't cover tracks by clearing their own
-- console logs. Ephemeral Edge Function logs are not sufficient for audit.
--
-- Admins who are party to an action (actor or target) should not be able to
-- delete these rows, so the table grants only INSERT/SELECT to authenticated
-- admins. Service role (used by edge functions) can write.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action      text        NOT NULL,
  actor_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  details     jsonb,
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor_id ON public.admin_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_id ON public.admin_audit_log (target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read audit history.
CREATE POLICY "Admins can read audit log"
  ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin_cached());

-- No UPDATE or DELETE policies: rows are immutable after insert. Service
-- role bypasses RLS, so edge functions can still insert.

COMMENT ON TABLE public.admin_audit_log IS
  'Immutable audit trail for security-sensitive admin actions. Written only by edge functions via service role; read-only for admins via RLS.';
