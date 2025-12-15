/*
  # Create Location Search Index Table

  1. New Tables
    - `location_search_index`
      - `id` (uuid, primary key) - Unique identifier
      - `name` (text, required) - Display name of the location
      - `type` (text, required) - Type: 'zip', 'neighborhood', or 'borough'
      - `aliases` (text[], optional) - Alternative names/spellings for fuzzy matching
      - `zip_codes` (text[], optional) - Associated ZIP codes for neighborhoods
      - `bounds_north` (numeric) - Northern boundary latitude
      - `bounds_south` (numeric) - Southern boundary latitude
      - `bounds_east` (numeric) - Eastern boundary longitude
      - `bounds_west` (numeric) - Western boundary longitude
      - `center_lat` (numeric) - Center point latitude
      - `center_lng` (numeric) - Center point longitude
      - `created_at` (timestamptz) - Creation timestamp

  2. Security
    - Enable RLS on `location_search_index` table
    - Add policy for public read access (search data is public)

  3. Indexes
    - Text search index on name for fast lookups
    - GIN index on aliases array for fuzzy matching
*/

CREATE TABLE IF NOT EXISTS location_search_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('zip', 'neighborhood', 'borough')),
  aliases text[] DEFAULT '{}',
  zip_codes text[] DEFAULT '{}',
  bounds_north numeric,
  bounds_south numeric,
  bounds_east numeric,
  bounds_west numeric,
  center_lat numeric NOT NULL,
  center_lng numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE location_search_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Location search index is publicly readable"
  ON location_search_index
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_location_search_name ON location_search_index USING btree (lower(name));
CREATE INDEX IF NOT EXISTS idx_location_search_type ON location_search_index USING btree (type);
CREATE INDEX IF NOT EXISTS idx_location_search_aliases ON location_search_index USING gin (aliases);

CREATE OR REPLACE FUNCTION search_locations(search_query text)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  aliases text[],
  zip_codes text[],
  bounds_north numeric,
  bounds_south numeric,
  bounds_east numeric,
  bounds_west numeric,
  center_lat numeric,
  center_lng numeric,
  match_score integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.name,
    l.type,
    l.aliases,
    l.zip_codes,
    l.bounds_north,
    l.bounds_south,
    l.bounds_east,
    l.bounds_west,
    l.center_lat,
    l.center_lng,
    CASE
      WHEN lower(l.name) = lower(search_query) THEN 100
      WHEN l.name ILIKE search_query THEN 95
      WHEN lower(l.name) LIKE lower(search_query) || '%' THEN 90
      WHEN lower(search_query) ~ '^\d{5}$' AND l.name = search_query THEN 100
      WHEN lower(search_query) ~ '^\d{5}$' AND search_query = ANY(l.zip_codes) THEN 85
      WHEN search_query ILIKE ANY(l.aliases) THEN 80
      WHEN EXISTS (SELECT 1 FROM unnest(l.aliases) alias WHERE alias ILIKE '%' || search_query || '%') THEN 70
      WHEN l.name ILIKE '%' || search_query || '%' THEN 60
      ELSE 0
    END AS match_score
  FROM location_search_index l
  WHERE 
    lower(l.name) LIKE '%' || lower(search_query) || '%'
    OR l.name ILIKE '%' || search_query || '%'
    OR search_query = ANY(l.zip_codes)
    OR EXISTS (SELECT 1 FROM unnest(l.aliases) alias WHERE alias ILIKE '%' || search_query || '%')
  ORDER BY match_score DESC, l.type, l.name
  LIMIT 10;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;