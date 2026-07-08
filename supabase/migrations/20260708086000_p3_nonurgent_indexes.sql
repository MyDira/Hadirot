/*
  # [P3 / Track-1] Non-urgent supporting indexes (NOT urgent at current volume)

  ## Finding (audit 01-database-rls.md)
  These are performance-only, flagged P3 / "not urgent at current volume"
  (favorites ~197 rows, listings ~1,384 rows). Included so the fix set is
  complete; safe to apply anytime, but there is no urgency.

  1. favorites.listing_id has no leading index — the (user_id, listing_id) unique
     does not cover it, so ON DELETE CASCADE when a listing is removed and any
     "who favorited this listing" query scan favorites. Migration 20251030190000
     claimed to add favorites_listing_id_idx but the index is not present live.

  2. Non-default browse sorts (price / bedrooms) are not covered by
     listings_browse_idx (which only covers created_at DESC), so those sorts do
     an in-memory sort of the active+approved set. Add covering composites for
     the offered price/bedrooms sorts. (Neighborhood-filter index intentionally
     omitted — revisit alongside the neighborhood filter when volume approaches
     ~50k listings, per the audit.)

  ## Note on CONCURRENTLY
  Plain CREATE INDEX (in-transaction migration). At the table sizes above the
  brief lock is negligible. For a zero-lock build at scale, run
  CREATE INDEX CONCURRENTLY by hand outside a transaction instead.

  ## Reversal (spirit)
  DROP INDEX IF EXISTS favorites_listing_id_idx;
  DROP INDEX IF EXISTS idx_listings_browse_price;
  DROP INDEX IF EXISTS idx_listings_browse_bedrooms;
*/

-- 1. FK / lookup support for favorites.listing_id
CREATE INDEX IF NOT EXISTS favorites_listing_id_idx
  ON public.favorites (listing_id);

-- 2. Covering composites for non-default browse sorts (partial: active+approved)
CREATE INDEX IF NOT EXISTS idx_listings_browse_price
  ON public.listings (listing_type, is_active, approved, price)
  WHERE is_active AND approved;

CREATE INDEX IF NOT EXISTS idx_listings_browse_bedrooms
  ON public.listings (listing_type, is_active, approved, bedrooms)
  WHERE is_active AND approved;
