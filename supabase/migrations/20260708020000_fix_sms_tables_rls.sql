/*
  # [P0 / Track-1 C5] Lock down SMS/renewal tables (world read + write)

  ## Finding (audit 01-database-rls.md)
  Three tables carry ALL policies named for service_role but actually created
  TO public (or role-less, defaulting to public) with USING (true):
    - sms_messages                    -> "Service role full access on sms_messages"
    - listing_renewal_conversations   -> "Service role full access"
    - sms_admin_config                -> "Service role full access on sms_admin_config"

  Supabase grants anon/authenticated full DML on these tables, and RLS is the
  only gate. A `FOR ALL TO public USING (true)` policy therefore lets ANY anon
  or authenticated caller (with the public anon key) read phone numbers +
  message bodies and INSERT/UPDATE/DELETE rows via the public REST API:
    - read sms_messages(phone_number, message_body, message_sid)
    - read/flip listing_renewal_conversations(phone_number, reply_text, state,
      action_taken, hadirot_conversion) which the renewal flow acts on
    - rewrite sms_admin_config(admin_email, notify_on_errors) to blind the operator

  The client never reads these tables (no `.from('sms_messages' | ...)` in src/),
  confirming the public grant is unintended. service_role bypasses RLS entirely,
  so restricting the policy to service_role costs the Twilio edge functions
  nothing — they use the service-role key.

  ## Fix
  Drop each mislabeled public policy and recreate it scoped TO service_role.
  This denies anon/authenticated (no policy => default deny under RLS) while the
  edge functions continue to read/write normally via the service-role key.
  No admin-read policy is added: the app admin UI does not read these tables
  from the client (verified by grep); add one later via is_admin_cached() only
  if an admin surface needs it.

  ## Reversal (spirit)
  To undo: recreate the policies `FOR ALL USING (true)` (reintroduces the leak).

  ## Verification (manual, read-only)
    - With the anon key, GET each table => expect permission denied / 0 rows.
    - Confirm the Twilio edge functions (service-role) still read/write.
*/

-- sms_messages -----------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access on sms_messages" ON public.sms_messages;
DROP POLICY IF EXISTS "sms_messages_service_role" ON public.sms_messages;
CREATE POLICY "sms_messages_service_role"
  ON public.sms_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- listing_renewal_conversations ------------------------------------------------
DROP POLICY IF EXISTS "Service role full access" ON public.listing_renewal_conversations;
DROP POLICY IF EXISTS "listing_renewal_conversations_service_role" ON public.listing_renewal_conversations;
CREATE POLICY "listing_renewal_conversations_service_role"
  ON public.listing_renewal_conversations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- sms_admin_config -------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access on sms_admin_config" ON public.sms_admin_config;
DROP POLICY IF EXISTS "sms_admin_config_service_role" ON public.sms_admin_config;
CREATE POLICY "sms_admin_config_service_role"
  ON public.sms_admin_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
