/*
  # Remove Polygon Cache Tables

  1. Tables Dropped
    - `zip_code_polygons` - Cache for ZIP code polygon geometries (no longer used)
    - `neighborhood_polygons` - Cache for neighborhood polygon geometries (no longer used)

  2. Background
    - The application has pivoted from polygon-based filtering to bounding-box-based filtering
    - Location searches now use Mapbox geocoding for center points and bounding boxes
    - Listing filtering uses geographic coordinates with map viewport bounds
    - These polygon cache tables are no longer needed

  3. Notes
    - The edge functions `get-zipcode-polygon` and `get-neighborhood-polygon` should also be removed manually
*/

DROP TABLE IF EXISTS neighborhood_polygons;
DROP TABLE IF EXISTS zip_code_polygons;
