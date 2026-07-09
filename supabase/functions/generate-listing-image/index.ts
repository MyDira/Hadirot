import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { generateListingCardHTML } from "../_shared/listingCardTemplate.ts";

// Sliding-window rate limiting — this endpoint makes paid hcti.io calls, so it
// must not be an anonymous cost sink.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    if (rateLimitMap.size > 10_000) {
      for (const [k, v] of rateLimitMap) {
        if (now - v.windowStart >= windowMs) rateLimitMap.delete(k);
      }
    }
    return true;
  }
  if (entry.count + 1 > max) return false;
  entry.count += 1;
  return true;
}

function getClientIp(req: Request): string | null {
  for (const header of ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"]) {
    const value = req.headers.get(header);
    if (value) {
      const ip = value.split(",")[0]?.trim();
      if (ip) return ip;
    }
  }
  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX = 10; // image renders per user/IP per minute

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
    // Require an authenticated caller — image generation is a paid third-party
    // call and is only needed by logged-in posting/sharing flows.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );
    const { data: { user }, error: authError } = await authClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit per user and per IP.
    if (!checkRateLimit(`genimg-user:${user.id}`, RATE_WINDOW_MS, RATE_MAX)) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const clientIp = getClientIp(req);
    if (clientIp) {
      const ipHash = await sha256Hex(clientIp);
      if (!checkRateLimit(`genimg-ip:${ipHash}`, RATE_WINDOW_MS, RATE_MAX)) {
        return new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { listing }: GenerateImageRequest = await req.json();

    if (!listing || typeof listing !== 'object') {
      return new Response(JSON.stringify({ error: 'Missing listing object' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (typeof listing.title === 'string' && listing.title.length > 200) {
      return new Response(JSON.stringify({ error: 'Field too long: title' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (typeof listing.location === 'string' && listing.location.length > 200) {
      return new Response(JSON.stringify({ error: 'Field too long: location' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (typeof listing.neighborhood === 'string' && listing.neighborhood.length > 200) {
      return new Response(JSON.stringify({ error: 'Field too long: neighborhood' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
