/*
  # Seed Neighborhood Polygons from Location Search Index

  1. Data Population
    - Creates polygon boundaries from the bounds data in location_search_index
    - Covers all Brooklyn, Manhattan, Queens, Bronx, and Staten Island neighborhoods
    - Uses rectangular approximations from the existing bounds

  2. Notes
    - These are approximate boundaries based on bounding boxes
    - Can be enhanced later with more accurate polygon data from NYC Open Data
    - Provides immediate functionality for geographic filtering
*/

INSERT INTO neighborhood_polygons (name, display_name, polygon_geojson, center_lat, center_lng, borough, source)
SELECT 
  lower(name) as name,
  name as display_name,
  jsonb_build_object(
    'type', 'Polygon',
    'coordinates', jsonb_build_array(
      jsonb_build_array(
        jsonb_build_array(bounds_west, bounds_south),
        jsonb_build_array(bounds_east, bounds_south),
        jsonb_build_array(bounds_east, bounds_north),
        jsonb_build_array(bounds_west, bounds_north),
        jsonb_build_array(bounds_west, bounds_south)
      )
    )
  ) as polygon_geojson,
  center_lat,
  center_lng,
  CASE 
    WHEN name IN ('Williamsburg', 'Greenpoint', 'Bushwick', 'Bedford-Stuyvesant', 'Crown Heights', 
                  'Park Slope', 'Prospect Heights', 'Flatbush', 'East Flatbush', 'Sunset Park',
                  'Bay Ridge', 'Bensonhurst', 'Borough Park', 'Dyker Heights', 'Sheepshead Bay',
                  'Brighton Beach', 'Coney Island', 'Gravesend', 'Midwood', 'Kensington',
                  'Prospect Lefferts Gardens', 'DUMBO', 'Brooklyn Heights', 'Cobble Hill',
                  'Carroll Gardens', 'Red Hook', 'Gowanus', 'Fort Greene', 'Clinton Hill',
                  'Canarsie', 'East New York', 'Brownsville', 'Ocean Hill', 'Cypress Hills',
                  'Boerum Hill', 'Vinegar Hill', 'Navy Yard', 'Marine Park', 'Mill Basin',
                  'Bergen Beach', 'Gerritsen Beach', 'Manhattan Beach', 'Ditmas Park',
                  'Fiske Terrace', 'Windsor Terrace', 'Brooklyn') THEN 'Brooklyn'
    WHEN name IN ('Lower East Side', 'East Village', 'Greenwich Village', 'SoHo', 'Tribeca',
                  'Chinatown', 'Little Italy', 'Financial District', 'Battery Park City',
                  'Chelsea', 'Flatiron', 'Gramercy Park', 'Murray Hill', 'Midtown',
                  'Hells Kitchen', 'Upper West Side', 'Upper East Side', 'Harlem',
                  'East Harlem', 'Washington Heights', 'Inwood', 'Morningside Heights',
                  'Manhattan') THEN 'Manhattan'
    WHEN name IN ('Astoria', 'Long Island City', 'Sunnyside', 'Woodside', 'Jackson Heights',
                  'Flushing', 'Forest Hills', 'Jamaica', 'Ridgewood', 'Elmhurst', 'Corona',
                  'Rego Park', 'Kew Gardens', 'Bayside', 'Whitestone', 'College Point',
                  'Queens') THEN 'Queens'
    WHEN name IN ('South Bronx', 'Mott Haven', 'Hunts Point', 'Fordham', 'Riverdale',
                  'Kingsbridge', 'Pelham Bay', 'Throgs Neck', 'Morris Park', 'Parkchester',
                  'Bronx') THEN 'Bronx'
    WHEN name IN ('St. George', 'Stapleton', 'Tompkinsville', 'Tottenville', 'New Dorp',
                  'Midland Beach', 'Great Kills', 'Port Richmond', 'Willowbrook',
                  'Staten Island') THEN 'Staten Island'
    ELSE NULL
  END as borough,
  'location_search_index_bounds' as source
FROM location_search_index
WHERE type = 'neighborhood' OR type = 'borough'
  AND bounds_north IS NOT NULL 
  AND bounds_south IS NOT NULL 
  AND bounds_east IS NOT NULL 
  AND bounds_west IS NOT NULL
ON CONFLICT (name) DO NOTHING;
