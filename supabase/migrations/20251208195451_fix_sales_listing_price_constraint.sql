/*
  # Fix Sales Listing Price Constraint
  
  ## Problem
  The existing constraint `ck_listings_price_callforprice` enforces that:
  - If call_for_price is TRUE, price must be NULL
  - If call_for_price is FALSE, price must be NOT NULL and > 0
  
  This breaks sale listings because they use `asking_price` instead of `price`.
  
  ## Solution
  Replace the constraint with one that:
  - For rental listings: apply the existing price/call_for_price rules
  - For sale listings: exempt from price constraint, apply to asking_price instead
  
  ## Changes
  1. Drop the existing constraint
  2. Add new listing-type-aware constraint
*/

-- Drop the existing constraint
ALTER TABLE listings 
DROP CONSTRAINT IF EXISTS ck_listings_price_callforprice;

-- Add new constraint that handles both rental and sale listings
ALTER TABLE listings 
ADD CONSTRAINT ck_listings_price_callforprice CHECK (
  -- For rental listings: enforce price/call_for_price relationship
  (listing_type = 'rental' AND (
    (call_for_price IS TRUE AND price IS NULL) OR
    (call_for_price IS FALSE AND price IS NOT NULL AND price > 0)
  ))
  OR
  -- For sale listings: allow any price value, enforce asking_price/call_for_price relationship
  (listing_type = 'sale' AND (
    (call_for_price IS TRUE AND asking_price IS NULL) OR
    (call_for_price IS FALSE AND asking_price IS NOT NULL AND asking_price > 0)
  ))
);

-- Add helpful comment
COMMENT ON CONSTRAINT ck_listings_price_callforprice ON listings IS 
  'Ensures price fields are consistent with call_for_price flag. For rentals, validates price field. For sales, validates asking_price field.';
