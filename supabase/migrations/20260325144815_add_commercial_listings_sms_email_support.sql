/*
  # Commercial Listings SMS & Email Support

  ## Summary
  Extends the SMS and email notification systems to handle commercial listings
  from the `commercial_listings` table alongside residential listings.

  ## Changes

  ### 1. listing_renewal_conversations
  - Adds `is_commercial` boolean column (default false, not null)
  - Allows the SMS webhook handler to know which table (listings vs commercial_listings)
    a conversation's listing_id belongs to, without ambiguous cross-table lookups

  ### 2. commercial_listings
  - Adds `contact_phone_e164` column (text, nullable)
  - Backfills existing rows from `contact_phone` using the same normalization
    logic as the residential listings trigger
  - Creates a partial index on `contact_phone_e164` for active listings
    (mirrors the pattern on `listings` table for fast unsolicited-RENTED lookups)
  - Attaches the existing `normalize_contact_phone()` trigger function so that
    future INSERT/UPDATE of `contact_phone` automatically populates `contact_phone_e164`

  ## Security
  No RLS changes — existing policies on both tables remain unchanged.

  ## Notes
  - The `normalize_contact_phone` function is generic (operates on NEW.contact_phone →
    NEW.contact_phone_e164) and does not hardcode any table name, so it is safe to
    attach to commercial_listings without modification.
  - Both `auto_inactivate_old_commercial_listings` and `auto_delete_very_old_commercial_listings`
    RPCs already exist — no new RPCs needed in this migration.
*/

-- ============================================================
-- 1. Add is_commercial to listing_renewal_conversations
-- ============================================================
ALTER TABLE listing_renewal_conversations
  ADD COLUMN IF NOT EXISTS is_commercial boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. Add contact_phone_e164 to commercial_listings
-- ============================================================
ALTER TABLE commercial_listings
  ADD COLUMN IF NOT EXISTS contact_phone_e164 text;

-- ============================================================
-- 3. Backfill contact_phone_e164 from contact_phone
--    Uses the same normalization: strip non-digits, prepend +1
--    Handles both 10-digit and 11-digit (1XXXXXXXXXX) inputs
-- ============================================================
UPDATE commercial_listings
SET contact_phone_e164 = CASE
  WHEN regexp_replace(contact_phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
    THEN '+' || regexp_replace(contact_phone, '[^0-9]', '', 'g')
  WHEN regexp_replace(contact_phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
    THEN '+1' || regexp_replace(contact_phone, '[^0-9]', '', 'g')
  ELSE NULL
END
WHERE contact_phone IS NOT NULL
  AND contact_phone_e164 IS NULL;

-- ============================================================
-- 4. Create partial index for fast phone lookups on active rows
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_commercial_listings_phone_e164
  ON commercial_listings(contact_phone_e164)
  WHERE contact_phone_e164 IS NOT NULL AND is_active = true;

-- ============================================================
-- 5. Attach normalize_contact_phone trigger to commercial_listings
--    The function already exists and is generic (no table hardcoding)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_normalize_contact_phone'
      AND tgrelid = 'commercial_listings'::regclass
  ) THEN
    CREATE TRIGGER trg_normalize_contact_phone
      BEFORE INSERT OR UPDATE OF contact_phone
      ON commercial_listings
      FOR EACH ROW
      EXECUTE FUNCTION public.normalize_contact_phone();
  END IF;
END $$;
