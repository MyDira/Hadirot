/*
  # Fix listing_renewal_conversations state CHECK constraint (SMS audit BUG #1)

  The live constraint only allows the original 7 states. The code has written
  4 more since Jan 2026 (awaiting_report_response, callback_sent,
  awaiting_listing_selection, awaiting_disambiguation) — every report-rented
  and callback conversation insert has been silently rejected since inception
  (0 callback/report conversations exist in prod; 15 report + 397 callback
  SMS were sent in the last 60 days alone).

  The 20260119022052_add_sms_enhancements migration noted "state is TEXT, new
  values work automatically" — true for the type, wrong for this CHECK.

  Verified against prod 2026-07-01: INSERT with state='callback_sent' violates
  listing_renewal_conversations_state_check (rolled back test).
*/

ALTER TABLE listing_renewal_conversations
  DROP CONSTRAINT IF EXISTS listing_renewal_conversations_state_check;

ALTER TABLE listing_renewal_conversations
  ADD CONSTRAINT listing_renewal_conversations_state_check
  CHECK (state = ANY (ARRAY[
    'pending', 'awaiting_availability', 'awaiting_hadirot_question',
    'completed', 'timeout', 'expired_link', 'error',
    -- states introduced by 20260119022052_add_sms_enhancements + later code:
    'awaiting_report_response', 'callback_sent',
    'awaiting_listing_selection', 'awaiting_disambiguation'
  ]::text[]));
