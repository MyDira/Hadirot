import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Starting cleanup of expired renewal conversations...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase configuration");
      return new Response(
        JSON.stringify({ error: "Database service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = new Date().toISOString();

    const { data: expiredConversations, error: queryError } = await supabaseAdmin
      .from("listing_renewal_conversations")
      .select("id, listing_id, state")
      .in("state", ["pending", "awaiting_availability", "awaiting_hadirot_question"])
      .lt("expires_at", now);

    if (queryError) {
      console.error("Error querying expired conversations:", queryError);
      return new Response(
        JSON.stringify({ error: "Failed to query expired conversations" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${expiredConversations?.length || 0} expired conversations`);

    let updatedCount = 0;

    if (expiredConversations && expiredConversations.length > 0) {
      const expiredIds = expiredConversations.map((c) => c.id);

      const { error: updateError } = await supabaseAdmin
        .from("listing_renewal_conversations")
        .update({
          state: "timeout",
          action_taken: "timeout",
          updated_at: now,
        })
        .in("id", expiredIds);

      if (updateError) {
        console.error("Error updating expired conversations:", updateError);
      } else {
        updatedCount = expiredIds.length;
        console.log(`Marked ${updatedCount} conversations as timeout`);
      }
    }

    const summary = {
      expiredFound: expiredConversations?.length || 0,
      updatedCount,
      timestamp: now,
    };

    console.log("Cleanup expired renewals job completed:", summary);

    return new Response(
      JSON.stringify({ success: true, summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error in cleanup-expired-renewals:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});