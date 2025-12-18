import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NeighborhoodPolygon {
  name: string;
  display_name: string;
  polygon_geojson: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
  center_lat: number;
  center_lng: number;
  borough: string | null;
  source: string;
}

function normalizeNeighborhoodName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const neighborhoodName = url.searchParams.get("name") || "";

    if (!neighborhoodName || neighborhoodName.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing neighborhood name parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const normalizedName = normalizeNeighborhoodName(neighborhoodName);

    const { data: cached, error: cacheError } = await supabase
      .from("neighborhood_polygons")
      .select("*")
      .eq("name", normalizedName)
      .maybeSingle();

    if (cached && !cacheError) {
      return new Response(
        JSON.stringify({
          name: cached.name,
          display_name: cached.display_name,
          polygon: cached.polygon_geojson,
          center: { lat: cached.center_lat, lng: cached.center_lng },
          borough: cached.borough,
          source: cached.source,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: fuzzyMatch, error: fuzzyError } = await supabase
      .from("neighborhood_polygons")
      .select("*")
      .ilike("display_name", `%${neighborhoodName}%`)
      .limit(1)
      .maybeSingle();

    if (fuzzyMatch && !fuzzyError) {
      return new Response(
        JSON.stringify({
          name: fuzzyMatch.name,
          display_name: fuzzyMatch.display_name,
          polygon: fuzzyMatch.polygon_geojson,
          center: { lat: fuzzyMatch.center_lat, lng: fuzzyMatch.center_lng },
          borough: fuzzyMatch.borough,
          source: fuzzyMatch.source,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        error: "Neighborhood not found", 
        searched_name: neighborhoodName,
        normalized_name: normalizedName 
      }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in get-neighborhood-polygon:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});