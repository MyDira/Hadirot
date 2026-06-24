/*
  # Add source_url to scraped_listings

  1. New Column
    - `source_url` (text, nullable) - canonical URL of the original online listing
      this scraped row came from (e.g. a luach.com apartment page).

  2. Background
    - The pipeline historically ingested listings from the printed *Luach HaTsibbur*
      publication (source = 'luach_hatsibbur'), which has no per-listing URL.
    - The new luach.com website source (source = 'luach_com') is scraped per-listing,
      so each row has a real URL the admin can click through to verify and call.

  3. Notes
    - Nullable: existing publication rows leave it null; only web-scraped rows set it.
    - No constraint changes to existing columns; safe additive migration.
    - Admin RLS on scraped_listings is row-level, so this column is automatically
      covered by the existing "Admins can read all scraped_listings" policy.
*/

ALTER TABLE scraped_listings ADD COLUMN IF NOT EXISTS source_url text;
