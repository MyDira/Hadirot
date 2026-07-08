/*
  # Commercial support for featured_purchases (B7 — commercial boost)

  Makes featured_purchases polymorphic so commercial boost purchases can be tracked
  alongside residential ones, mirroring the SMS-plumbing approach: the listing id is
  stored in `listing_id` and discriminated by `is_commercial`.

  - Adds `is_commercial` (default false → residential rows unchanged).
  - Drops the listings-only FK so `listing_id` can hold a commercial_listings id.
    The unique partial index `idx_featured_purchases_one_active_per_listing`
    (on listing_id WHERE status in pending/paid/active) still enforces one active
    boost per listing for both types, since ids are globally unique.

  Residential behavior is unchanged. featured_purchases are financial/audit records,
  so losing ON DELETE CASCADE (rows persisting after a listing delete) is acceptable.
*/

ALTER TABLE featured_purchases
  ADD COLUMN IF NOT EXISTS is_commercial boolean NOT NULL DEFAULT false;

ALTER TABLE featured_purchases
  DROP CONSTRAINT IF EXISTS featured_purchases_listing_id_fkey;
