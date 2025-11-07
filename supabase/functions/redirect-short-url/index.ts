import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const shortCode = pathParts[pathParts.length - 1];

    if (!shortCode) {
      return new Response("Short code not provided", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("Server configuration error", {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Look up the short URL
    const { data: shortUrl, error: lookupError } = await supabaseAdmin
      .from("short_urls")
      .select("*")
      .eq("short_code", shortCode)
      .maybeSingle();

    if (lookupError || !shortUrl) {
      console.error("Short URL lookup error:", lookupError);
      return new Response("Short URL not found", {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Check if expired
    if (shortUrl.expires_at && new Date(shortUrl.expires_at) < new Date()) {
      return new Response("Short URL has expired", {
        status: 410,
        headers: corsHeaders,
      });
    }

    // Increment click count
    const { error: incrementError } = await supabaseAdmin.rpc(
      "increment_short_url_clicks",
      { p_short_code: shortCode }
    );

    if (incrementError) {
      console.error("Error incrementing click count:", incrementError);
    }

    // Track the click in analytics
    const userAgent = req.headers.get("user-agent");
    const referer = req.headers.get("referer");

    try {
      await supabaseAdmin.from("analytics_events").insert({
        session_id: crypto.randomUUID(),
        anon_id: crypto.randomUUID(),
        user_id: null,
        event_name: "digest_link_click",
        event_props: {
          short_code: shortCode,
          listing_id: shortUrl.listing_id,
          source: shortUrl.source,
          referer: referer,
        },
        occurred_at: new Date().toISOString(),
        ua: userAgent,
        ip_hash: null,
      });
    } catch (analyticsError) {
      console.error("Error tracking click in analytics:", analyticsError);
      // Don't fail the redirect if analytics fails
    }

    // Redirect to the original URL
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: shortUrl.original_url,
      },
    });
  } catch (error) {
    console.error("Unexpected error in redirect-short-url:", error);
    return new Response("Internal server error", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
