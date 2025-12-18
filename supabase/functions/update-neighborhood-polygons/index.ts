import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NTAFeature {
  type: "Feature";
  properties: {
    ntaname: string;
    boroname: string;
    nta2020: string;
    ntaabbrev?: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

interface GeoJSONResponse {
  type: "FeatureCollection";
  features: NTAFeature[];
}

function normalizeNeighborhoodName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ")
    .replace(/-/g, "-");
}

function calculateCenter(geometry: NTAFeature["geometry"]): { lat: number; lng: number } {
  let sumLat = 0;
  let sumLng = 0;
  let count = 0;

  const processRing = (ring: number[][]) => {
    for (const coord of ring) {
      sumLng += coord[0];
      sumLat += coord[1];
      count++;
    }
  };

  if (geometry.type === "Polygon") {
    processRing((geometry.coordinates as number[][][])[0]);
  } else {
    for (const polygon of geometry.coordinates as number[][][][]) {
      processRing(polygon[0]);
    }
  }

  return {
    lat: count > 0 ? sumLat / count : 0,
    lng: count > 0 ? sumLng / count : 0,
  };
}

const NEIGHBORHOOD_MAPPINGS: Record<string, string[]> = {
  "williamsburg": ["williamsburg", "south williamsburg", "east williamsburg"],
  "greenpoint": ["greenpoint"],
  "bushwick": ["bushwick west", "bushwick east"],
  "bedford-stuyvesant": ["bedford", "stuyvesant heights"],
  "crown heights": ["crown heights north", "crown heights south"],
  "park slope": ["park slope-gowanus"],
  "prospect heights": ["prospect heights"],
  "flatbush": ["flatbush", "east flatbush-erasmus", "east flatbush-farragut", "east flatbush-remsen village"],
  "east flatbush": ["east flatbush-erasmus", "east flatbush-farragut", "east flatbush-remsen village"],
  "sunset park": ["sunset park west", "sunset park east"],
  "bay ridge": ["bay ridge"],
  "bensonhurst": ["bensonhurst west", "bensonhurst east"],
  "borough park": ["borough park"],
  "sheepshead bay": ["sheepshead bay-gerritsen beach-manhattan beach"],
  "brighton beach": ["brighton beach"],
  "coney island": ["coney island"],
  "brooklyn heights": ["brooklyn heights-cobble hill"],
  "cobble hill": ["brooklyn heights-cobble hill"],
  "carroll gardens": ["carroll gardens-columbia street-red hook"],
  "red hook": ["carroll gardens-columbia street-red hook"],
  "gowanus": ["park slope-gowanus"],
  "fort greene": ["fort greene"],
  "clinton hill": ["clinton hill"],
  "dumbo": ["dumbo-vinegar hill-downtown brooklyn-boerum hill"],
  "boerum hill": ["dumbo-vinegar hill-downtown brooklyn-boerum hill"],
  "prospect lefferts gardens": ["prospect lefferts gardens-wingate"],
  "kensington": ["kensington-ocean parkway"],
  "midwood": ["midwood"],
  "canarsie": ["canarsie"],
  "east new york": ["east new york", "east new york (pennsylvania ave)"],
  "brownsville": ["brownsville"],
  "ocean hill": ["ocean hill"],
  "lower east side": ["lower east side", "chinatown"],
  "east village": ["east village"],
  "greenwich village": ["west village"],
  "soho": ["soho-tribeca-civic center-little italy"],
  "tribeca": ["soho-tribeca-civic center-little italy"],
  "chinatown": ["chinatown"],
  "chelsea": ["chelsea-flatiron-union square"],
  "flatiron": ["chelsea-flatiron-union square"],
  "gramercy park": ["gramercy park"],
  "murray hill": ["murray hill-kips bay"],
  "midtown": ["midtown-midtown south"],
  "hells kitchen": ["hudson yards-chelsea-flatiron-union square"],
  "upper west side": ["upper west side", "lincoln square"],
  "upper east side": ["upper east side-carnegie hill", "yorkville", "lenox hill-roosevelt island"],
  "harlem": ["central harlem north-polo grounds", "central harlem south"],
  "east harlem": ["east harlem north", "east harlem south"],
  "washington heights": ["washington heights north", "washington heights south"],
  "inwood": ["inwood"],
  "morningside heights": ["morningside heights"],
  "astoria": ["astoria"],
  "long island city": ["long island city-hunters point", "queensbridge-ravenswood-long island city"],
  "sunnyside": ["sunnyside"],
  "woodside": ["woodside"],
  "jackson heights": ["jackson heights"],
  "flushing": ["flushing", "flushing-willets point"],
  "forest hills": ["forest hills"],
  "jamaica": ["jamaica", "jamaica estates-holliswood"],
  "ridgewood": ["ridgewood"],
  "elmhurst": ["elmhurst"],
  "corona": ["north corona", "corona"],
  "south bronx": ["mott haven-port morris"],
  "mott haven": ["mott haven-port morris"],
  "fordham": ["fordham south", "university heights-morris heights"],
  "riverdale": ["riverdale-spuyten duyvil-kingsbridge"],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const nycDataUrl = "https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=500";

    console.log("Fetching NYC Open Data NTA boundaries...");
    const response = await fetch(nycDataUrl);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch NYC Open Data", status: response.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data: GeoJSONResponse = await response.json();
    console.log(`Fetched ${data.features.length} NTA features`);

    const updates: Array<{
      name: string;
      display_name: string;
      polygon_geojson: object;
      center_lat: number;
      center_lng: number;
      borough: string;
      source: string;
    }> = [];

    const processedNeighborhoods = new Set<string>();

    for (const [targetName, ntaMatches] of Object.entries(NEIGHBORHOOD_MAPPINGS)) {
      const matchingFeatures = data.features.filter(f =>
        ntaMatches.some(match =>
          normalizeNeighborhoodName(f.properties.ntaname).includes(normalizeNeighborhoodName(match))
        )
      );

      if (matchingFeatures.length === 0) continue;

      let mergedGeometry: NTAFeature["geometry"];

      if (matchingFeatures.length === 1) {
        mergedGeometry = matchingFeatures[0].geometry;
      } else {
        const allPolygons: number[][][][] = [];

        for (const feature of matchingFeatures) {
          if (feature.geometry.type === "Polygon") {
            allPolygons.push(feature.geometry.coordinates as number[][][]);
          } else {
            allPolygons.push(...(feature.geometry.coordinates as number[][][][]));
          }
        }

        mergedGeometry = {
          type: "MultiPolygon",
          coordinates: allPolygons,
        };
      }

      const center = calculateCenter(mergedGeometry);
      const borough = matchingFeatures[0].properties.boroname;

      updates.push({
        name: normalizeNeighborhoodName(targetName),
        display_name: targetName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        polygon_geojson: mergedGeometry,
        center_lat: center.lat,
        center_lng: center.lng,
        borough: borough,
        source: "nyc_open_data_nta",
      });

      processedNeighborhoods.add(normalizeNeighborhoodName(targetName));
    }

    for (const feature of data.features) {
      const ntaName = normalizeNeighborhoodName(feature.properties.ntaname);

      if (ntaName.includes("park") && ntaName !== "park slope" && !ntaName.includes("slope")) continue;
      if (ntaName.includes("cemetery")) continue;
      if (ntaName.includes("airport")) continue;

      const simpleNames = [
        "greenpoint", "bushwick", "williamsburg", "astoria", "flushing",
        "jamaica", "corona", "elmhurst", "woodside", "sunnyside",
        "ridgewood", "midwood", "canarsie", "brownsville", "inwood",
        "fordham", "riverdale"
      ];

      for (const simple of simpleNames) {
        if (ntaName.startsWith(simple) && !processedNeighborhoods.has(simple)) {
          const center = calculateCenter(feature.geometry);

          updates.push({
            name: simple,
            display_name: simple.charAt(0).toUpperCase() + simple.slice(1),
            polygon_geojson: feature.geometry,
            center_lat: center.lat,
            center_lng: center.lng,
            borough: feature.properties.boroname,
            source: "nyc_open_data_nta",
          });

          processedNeighborhoods.add(simple);
          break;
        }
      }
    }

    console.log(`Prepared ${updates.length} neighborhood updates`);

    let successCount = 0;
    let errorCount = 0;

    for (const update of updates) {
      const { error } = await supabase
        .from("neighborhood_polygons")
        .upsert(update, { onConflict: "name" });

      if (error) {
        console.error(`Failed to update ${update.name}:`, error);
        errorCount++;
      } else {
        successCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Updated ${successCount} neighborhoods, ${errorCount} errors`,
        total_features: data.features.length,
        processed_neighborhoods: updates.length,
        updated: successCount,
        errors: errorCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error updating neighborhood polygons:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});