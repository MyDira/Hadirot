import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const url = new URL(req.url);
    const agencyParam = url.searchParams.get("agency_id") || url.searchParams.get("agency_slug");
    const bedrooms = url.searchParams.get("bedrooms");
    const minPrice = url.searchParams.get("min_price");
    const maxPrice = url.searchParams.get("max_price");
    const sort = url.searchParams.get("sort") || "newest";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 12;
    const offset = (page - 1) * limit;

    if (!agencyParam) {
      return new Response(
        JSON.stringify({ error: "agency_id or agency_slug parameter required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase client (public access for active listings)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // First, resolve agency ID if slug was provided
    let agencyId = agencyParam;
    if (!agencyParam.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // It's a slug, resolve to ID
      const { data: agency, error: agencyError } = await supabase
        .from("agencies")
        .select("id")
        .eq("slug", agencyParam)
        .eq("is_active", true)
        .single();

      if (agencyError || !agency) {
        return new Response(
          JSON.stringify({ error: "Agency not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      agencyId = agency.id;
    }

    // Build the listings query
    let query = supabase
      .from("listings")
      .select(`
        id,
        title,
        location,
        neighborhood,
        bedrooms,
        bathrooms,
        price,
        call_for_price,
        square_footage,
        property_type,
        parking,
        is_featured,
        created_at,
        last_published_at,
        listing_images(image_url, is_featured, sort_order),
        profiles!inner(full_name, phone, agency)
      `)
      .eq("is_active", true)
      .eq("approved", true)
      .eq("agency_id", agencyId);

    // Apply filters
    if (bedrooms && bedrooms !== "any") {
      if (bedrooms === "studio") {
        query = query.eq("bedrooms", 0);
      } else if (bedrooms === "4+") {
        query = query.gte("bedrooms", 4);
      } else {
        query = query.eq("bedrooms", parseInt(bedrooms));
      }
    }

    if (minPrice) {
      query = query.gte("price", parseInt(minPrice));
    }

    if (maxPrice) {
      query = query.lte("price", parseInt(maxPrice));
    }

    // Apply sorting
    switch (sort) {
      case "price_asc":
        query = query.order("price", { ascending: true, nullsLast: true });
        break;
      case "price_desc":
        query = query.order("price", { ascending: false, nullsLast: true });
        break;
      case "newest":
      default:
        query = query.order("last_published_at", { ascending: false });
        break;
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: listings, error } = await query;

    if (error) {
      console.error("Error fetching agency listings:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("approved", true)
      .eq("agency_id", agencyId);

    // Apply same filters to count query
    if (bedrooms && bedrooms !== "any") {
      if (bedrooms === "studio") {
        countQuery = countQuery.eq("bedrooms", 0);
      } else if (bedrooms === "4+") {
        countQuery = countQuery.gte("bedrooms", 4);
      } else {
        countQuery = countQuery.eq("bedrooms", parseInt(bedrooms));
      }
    }

    if (minPrice) {
      countQuery = countQuery.gte("price", parseInt(minPrice));
    }

    if (maxPrice) {
      countQuery = countQuery.lte("price", parseInt(maxPrice));
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error("Error counting agency listings:", countError);
    }

    const totalPages = Math.ceil((count || 0) / limit);

    return new Response(
      JSON.stringify({
        listings: listings || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error in agency-listings function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});