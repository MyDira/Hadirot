/*
  # Create Zip Code Polygons Cache Table

  1. New Tables
    - `zip_code_polygons`
      - `zip_code` (text, primary key) - The ZIP code identifier
      - `polygon_geojson` (jsonb) - GeoJSON polygon coordinates for the boundary
      - `center_lat` (numeric) - Center latitude of the polygon
      - `center_lng` (numeric) - Center longitude of the polygon
      - `source` (text) - Where the data came from (e.g., 'mapbox', 'manual')
      - `fetched_at` (timestamptz) - When the polygon was fetched/cached

  2. Security
    - Enable RLS on `zip_code_polygons` table
    - Add policy for public read access (polygon data is public)
    - Add policy for service role to insert/update (for caching from edge functions)

  3. Notes
    - This table caches zip code polygon boundaries fetched from Mapbox
    - Allows for fast lookups without repeated API calls
    - Polygon data stored as GeoJSON for easy integration with Mapbox GL
*/

CREATE TABLE IF NOT EXISTS zip_code_polygons (
  zip_code text PRIMARY KEY,
  polygon_geojson jsonb NOT NULL,
  center_lat numeric NOT NULL,
  center_lng numeric NOT NULL,
  source text NOT NULL DEFAULT 'mapbox',
  fetched_at timestamptz DEFAULT now()
);

ALTER TABLE zip_code_polygons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zip code polygons are publicly readable"
  ON zip_code_polygons
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role can insert zip code polygons"
  ON zip_code_polygons
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update zip code polygons"
  ON zip_code_polygons
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_zip_code_polygons_fetched_at 
  ON zip_code_polygons (fetched_at);

COMMENT ON TABLE zip_code_polygons IS 'Cache for zip code polygon boundaries fetched from Mapbox API';
COMMENT ON COLUMN zip_code_polygons.polygon_geojson IS 'GeoJSON Feature with Polygon geometry';
