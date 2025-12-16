import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ZipCodePolygon {
  zip_code: string;
  polygon_geojson: {
    type: string;
    coordinates: number[][][];
  };
  center_lat: number;
  center_lng: number;
  source: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const zipCode = url.searchParams.get("zip") || "";

    if (!zipCode || !/^\d{5}$/.test(zipCode)) {
      return new Response(
        JSON.stringify({ error: "Invalid ZIP code. Must be 5 digits." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: cached, error: cacheError } = await supabase
      .from("zip_code_polygons")
      .select("*")
      .eq("zip_code", zipCode)
      .maybeSingle();

    if (cached && !cacheError) {
      return new Response(
        JSON.stringify({
          zip_code: cached.zip_code,
          polygon: cached.polygon_geojson,
          center: { lat: cached.center_lat, lng: cached.center_lng },
          source: cached.source,
          cached: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const censusUrl = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2021/MapServer/2/query?where=ZCTA5%3D%27${zipCode}%27&outFields=*&outSR=4326&f=geojson`;
    
    const censusResponse = await fetch(censusUrl);
    
    if (!censusResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch from Census API", status: censusResponse.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const censusData = await censusResponse.json();

    if (!censusData.features || censusData.features.length === 0) {
      return new Response(
        JSON.stringify({ error: "ZIP code not found", zip_code: zipCode }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const feature = censusData.features[0];
    const geometry = feature.geometry;

    let centerLat = 0;
    let centerLng = 0;
    let pointCount = 0;

    if (geometry.type === "Polygon") {
      for (const ring of geometry.coordinates) {
        for (const coord of ring) {
          centerLng += coord[0];
          centerLat += coord[1];
          pointCount++;
        }
      }
    } else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates) {
        for (const ring of polygon) {
          for (const coord of ring) {
            centerLng += coord[0];
            centerLat += coord[1];
            pointCount++;
          }
        }
      }
    }

    if (pointCount > 0) {
      centerLat /= pointCount;
      centerLng /= pointCount;
    }

    const polygonData: ZipCodePolygon = {
      zip_code: zipCode,
      polygon_geojson: geometry,
      center_lat: centerLat,
      center_lng: centerLng,
      source: "census_tigerweb",
    };

    const { error: insertError } = await supabase
      .from("zip_code_polygons")
      .upsert(polygonData, { onConflict: "zip_code" });

    if (insertError) {
      console.error("Failed to cache polygon:", insertError);
    }

    return new Response(
      JSON.stringify({
        zip_code: zipCode,
        polygon: geometry,
        center: { lat: centerLat, lng: centerLng },
        source: "census_tigerweb",
        cached: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in get-zipcode-polygon:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});