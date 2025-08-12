/*
  # Add broker_fee column to listings table

  1. Schema Changes
    - Add `broker_fee` column to `listings` table
      - Type: BOOLEAN
      - Default: false (no broker fee by default)
      - NOT NULL constraint

  2. Purpose
    - Track whether a listing has a broker fee
    - Enable filtering for "no fee" listings
    - Display broker fee information on listing cards and details
*/

-- Add the broker_fee column to listings table
ALTER TABLE public.listings 
ADD COLUMN IF NOT EXISTS broker_fee BOOLEAN DEFAULT false NOT NULL;

-- Add a comment to document the column
COMMENT ON COLUMN public.listings.broker_fee IS 'Indicates whether a broker fee applies to this listing. false = no fee, true = broker fee applies.';

-- Create an index for efficient filtering on broker_fee
CREATE INDEX IF NOT EXISTS listings_broker_fee_idx ON public.listings(broker_fee);