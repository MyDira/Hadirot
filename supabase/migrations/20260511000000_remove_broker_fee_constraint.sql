-- Remove any DB-level constraint that blocks listings with broker_fee = true.
-- The column itself (broker_fee BOOLEAN DEFAULT false NOT NULL) was added in
-- 20250812235627_fancy_spark.sql and is fine — we only want to drop any
-- CHECK constraint, trigger, or trigger-function that rejects true values.

-- Drop the confirmed constraint (found via live DB query)
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_broker_fee_must_be_false;

-- Drop any other common names just in case
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_no_broker_fee;
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS check_no_broker_fee;
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS check_broker_fee;
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_broker_fee_check;
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS broker_fee_false_only;

-- Drop any trigger that enforces broker_fee = false
DROP TRIGGER IF EXISTS enforce_no_broker_fee ON public.listings;
DROP TRIGGER IF EXISTS no_broker_fee_trigger ON public.listings;
DROP TRIGGER IF EXISTS broker_fee_guard ON public.listings;

-- Drop the backing trigger-function if it exists
DROP FUNCTION IF EXISTS public.enforce_no_broker_fee();
DROP FUNCTION IF EXISTS public.enforce_no_broker_fee_trigger();
DROP FUNCTION IF EXISTS public.check_broker_fee_allowed();
