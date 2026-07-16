/*
  # Commercial polymorphic SMS / conversation references

  ## Problem
  The SMS-plumbing tables `listing_renewal_conversations`, `sms_messages`, and
  `short_urls` are already used POLYMORPHICALLY for both residential and commercial
  listings — the edge functions store the listing id in `listing_id` and discriminate
  via `is_commercial` (conversations) or `message_source`/`source`. But each table's
  `listing_id` foreign key still points ONLY at `listings(id)`, so any commercial row
  would violate the FK. Because prod has had 0 commercial listings, this has never
  fired — but it silently blocks the commercial contact callback conversation, renewal
  reminders, RENTED replies, boost-upsell dedup, and SMS short links at launch.

  ## Fix
  Drop the listings-only FK on these three plumbing tables, completing the polymorphic
  design the code already assumes. These are append/log-style or expiry-bounded tables
  (`listing_renewal_conversations.expires_at`, `short_urls.expires_at`), so losing the
  ON DELETE CASCADE / SET NULL cleanup is acceptable; stale rows are harmless and age out.

  NOTE: `listing_contact_submissions` is intentionally NOT changed here — it uses proper
  dual columns (`listing_id` + `commercial_listing_id`) added in the previous migration,
  because analytics reads it and benefits from real referential integrity.
*/

ALTER TABLE listing_renewal_conversations
  DROP CONSTRAINT IF EXISTS listing_renewal_conversations_listing_id_fkey;

ALTER TABLE sms_messages
  DROP CONSTRAINT IF EXISTS sms_messages_listing_id_fkey;

ALTER TABLE short_urls
  DROP CONSTRAINT IF EXISTS short_urls_listing_id_fkey;
