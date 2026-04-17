-- Hot-path index for listing browse queries.
--
-- Today's browse queries (getListings, getSaleListings, getCommercialListings,
-- getCommercialSaleListings, homepage) all share this shape:
--   WHERE listing_type = X AND is_active = true AND approved = true
--   ORDER BY created_at DESC
--   LIMIT N
--
-- None of the 17 existing indexes on listings include "approved". The closest
-- (idx_listings_type_active) covers the first two filters but Postgres then
-- heap-scans to evaluate approved + sort.
--
-- New index lets the planner satisfy filter + order + limit from the index
-- alone. Larger payoff as the table grows (currently ~817 rows).

CREATE INDEX IF NOT EXISTS listings_browse_idx
  ON public.listings (listing_type, is_active, approved, created_at DESC);

COMMENT ON INDEX public.listings_browse_idx IS
  'Hot-path covering index for public browse queries: filter by listing_type+is_active+approved and order by created_at DESC.';

-- Drop a redundant duplicate agency index. The partial index
-- idx_listings_agency_id (WHERE agency_id IS NOT NULL) handles every lookup
-- of the form WHERE agency_id = X equally well and is smaller.
DROP INDEX IF EXISTS public.listings_agency_id_idx;
