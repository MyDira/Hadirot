import { corsHeaders } from "../_shared/cors.ts";
import { generateListingCardHTML } from "../_shared/listingCardTemplate.ts";

interface GenerateImageRequest {
  listing: {
    id: string;
    title: string;
    price: number | null;
    call_for_price: boolean;
    bedrooms: number;
    bathrooms: number;
    parking: string;
    broker_fee: boolean;
    location: string;
    neighborhood: string | null;
    property_type: string;
    lease_length: string;
    imageUrl: string;
    isStockPhoto?: boolean;
    ownerName?: string;
    ownerRole?: string;
    ownerAgency?: string;
    is_featured: boolean;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { listing }: GenerateImageRequest = await req.json();

    console.log("🎨 Generating image for listing:", listing.id);

    // Generate HTML for the listing card
    const html = generateListingCardHTML(listing);

    // Use htmlcsstoimage.com API for server-side rendering
    const htmlCssToImageUserId = Deno.env.get("HTMLCSSTOIMAGE_USER_ID");
    const htmlCssToImageApiKey = Deno.env.get("HTMLCSSTOIMAGE_API_KEY");

    if (!htmlCssToImageUserId || !htmlCssToImageApiKey) {
      console.error("❌ HTML/CSS to Image API credentials not configured");
      return new Response(
        JSON.stringify({
          error: "Image generation service not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create base64 auth string
    const auth = btoa(`${htmlCssToImageUserId}:${htmlCssToImageApiKey}`);

    // Call HTML/CSS to Image API
    const imageResponse = await fetch("https://hcti.io/v1/image", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        html: html,
        viewport_width: 400,
        viewport_height: 600,
        device_scale: 2, // For retina/high-DPI displays
      }),
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error("❌ Image generation API error:", errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to generate image",
          details: errorText,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const imageData = await imageResponse.json();

    console.log("✅ Image generated successfully:", imageData.url);

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: imageData.url,
        listingId: listing.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error generating listing image:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
