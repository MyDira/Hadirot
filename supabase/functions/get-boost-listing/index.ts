import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { listing_id } = await req.json();

    if (!listing_id) {
      return new Response(JSON.stringify({ error: "Missing listing_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Try residential first, then commercial (ids are globally unique).
    let isCommercial = false;
    let listing: Record<string, any> | null = null;

    const { data: resListing } = await supabaseAdmin
      .from("listings")
      .select("id, bedrooms, bathrooms, price, asking_price, neighborhood, cross_street_a, cross_street_b, listing_type, call_for_price, is_featured, featured_expires_at, is_active, approved, title, location")
      .eq("id", listing_id)
      .maybeSingle();

    if (resListing) {
      listing = resListing;
    } else {
      const { data: comListing } = await supabaseAdmin
        .from("commercial_listings")
        .select("id, price, asking_price, neighborhood, cross_street_a, cross_street_b, listing_type, call_for_price, is_featured, featured_expires_at, is_active, approved, title, full_address, commercial_space_type")
        .eq("id", listing_id)
        .maybeSingle();
      if (comListing) {
        listing = comListing;
        isCommercial = true;
      }
    }

    if (!listing) {
      return new Response(JSON.stringify({ error: "Listing not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Primary image — commercial images store a full public image_url; residential
    // images store a storage_path that must be resolved to a public URL.
    let imageUrl: string | null = null;
    if (isCommercial) {
      const { data: images } = await supabaseAdmin
        .from("commercial_listing_images")
        .select("image_url")
        .eq("listing_id", listing_id)
        .order("sort_order", { ascending: true })
        .limit(1);
      imageUrl = images?.[0]?.image_url || null;
    } else {
      const { data: images } = await supabaseAdmin
        .from("listing_images")
        .select("storage_path")
        .eq("listing_id", listing_id)
        .order("display_order", { ascending: true })
        .limit(1);
      const primaryImage = images?.[0]?.storage_path || null;
      if (primaryImage) {
        const { data: urlData } = supabaseAdmin.storage
          .from("listing-images")
          .getPublicUrl(primaryImage);
        imageUrl = urlData?.publicUrl || null;
      }
    }

    const alreadyFeatured =
      listing.is_featured &&
      listing.featured_expires_at &&
      new Date(listing.featured_expires_at) > new Date();

    const { data: pendingPurchase } = await supabaseAdmin
      .from("featured_purchases")
      .select("id")
      .eq("listing_id", listing_id)
      .in("status", ["pending", "paid"])
      .limit(1)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        listing: {
          id: listing.id,
          bedrooms: listing.bedrooms ?? null,
          bathrooms: listing.bathrooms ?? null,
          price: listing.price,
          asking_price: listing.asking_price,
          neighborhood: listing.neighborhood,
          cross_street_a: listing.cross_street_a,
          cross_street_b: listing.cross_street_b,
          listing_type: listing.listing_type,
          call_for_price: listing.call_for_price,
          title: listing.title,
          location: isCommercial ? (listing.full_address ?? null) : listing.location,
          commercial_space_type: isCommercial ? listing.commercial_space_type : null,
          image_url: imageUrl,
          approved: listing.approved,
        },
        already_featured: !!alreadyFeatured,
        already_pending: !!pendingPurchase,
        is_active: listing.is_active,
        is_commercial: isCommercial,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in get-boost-listing:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
