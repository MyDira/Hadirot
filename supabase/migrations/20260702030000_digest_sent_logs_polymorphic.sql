/*
  # Digest sent-log tables become polymorphic

  Commercial listings now appear in the WhatsApp digest and the daily admin
  digest. Both dedup logs FK'd listing_id to listings(id), so logging a sent
  COMMERCIAL listing would violate the FK (and abort the whole insert batch,
  losing residential dedup records too).

  Same pattern as 20260630010000 (SMS plumbing): these are append-only log
  tables used for dedup windows; ids are globally unique UUIDs, so referential
  integrity buys nothing here and losing ON DELETE CASCADE just leaves
  harmless stale log rows.
*/

ALTER TABLE daily_admin_digest_sent_listings
  DROP CONSTRAINT IF EXISTS daily_admin_digest_sent_listings_listing_id_fkey;

ALTER TABLE digest_sent_listings
  DROP CONSTRAINT IF EXISTS digest_sent_listings_listing_id_fkey;
