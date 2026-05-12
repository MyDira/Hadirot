-- Drop the CHECK constraint that was blocking broker_fee = true inserts.
-- Constraint name confirmed via live DB query: listings_broker_fee_must_be_false
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_broker_fee_must_be_false;
