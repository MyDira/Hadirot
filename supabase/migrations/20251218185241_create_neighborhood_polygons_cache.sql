/*
  # Create Neighborhood Polygons Cache Table

  1. New Tables
    - `neighborhood_polygons`
      - `name` (text, primary key) - The neighborhood name (normalized lowercase)
      - `display_name` (text) - Original display name
      - `polygon_geojson` (jsonb) - GeoJSON polygon coordinates for the boundary
      - `center_lat` (numeric) - Center latitude of the polygon
      - `center_lng` (numeric) - Center longitude of the polygon
      - `borough` (text) - Borough the neighborhood belongs to (Brooklyn, Manhattan, etc.)
      - `source` (text) - Where the data came from (e.g., 'nyc_open_data', 'manual')
      - `created_at` (timestamptz) - When the polygon was added

  2. Security
    - Enable RLS on `neighborhood_polygons` table
    - Add policy for public read access (polygon data is public)
    - Add policy for service role to insert/update (for seeding and updates)

  3. Notes
    - This table stores neighborhood polygon boundaries for geographic filtering
    - Polygon data stored as GeoJSON for easy integration with Mapbox GL
    - Used in conjunction with zip_code_polygons for complete coverage
*/

CREATE TABLE IF NOT EXISTS neighborhood_polygons (
  name text PRIMARY KEY,
  display_name text NOT NULL,
  polygon_geojson jsonb NOT NULL,
  center_lat numeric NOT NULL,
  center_lng numeric NOT NULL,
  borough text,
  source text NOT NULL DEFAULT 'nyc_open_data',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE neighborhood_polygons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Neighborhood polygons are publicly readable"
  ON neighborhood_polygons
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role can insert neighborhood polygons"
  ON neighborhood_polygons
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update neighborhood polygons"
  ON neighborhood_polygons
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_neighborhood_polygons_borough 
  ON neighborhood_polygons (borough);

CREATE INDEX IF NOT EXISTS idx_neighborhood_polygons_display_name 
  ON neighborhood_polygons USING btree (lower(display_name));

COMMENT ON TABLE neighborhood_polygons IS 'Cache for neighborhood polygon boundaries from NYC Open Data';
COMMENT ON COLUMN neighborhood_polygons.polygon_geojson IS 'GeoJSON geometry (Polygon or MultiPolygon)';
