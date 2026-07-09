import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/requireCronSecret.ts";
import { reportError } from "../_shared/reportError.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const denied = requireCronSecret(req);
  if (denied) return denied;

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
      .select("id, listing_id, state, is_commercial")
      .in("state", ["pending", "awaiting_availability", "awaiting_hadirot_question", "awaiting_listing_selection", "awaiting_report_response", "callback_sent", "awaiting_disambiguation"])
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
    let autoDeactivatedCount = 0;

    if (expiredConversations && expiredConversations.length > 0) {
      const reportResponseConversations = expiredConversations.filter(
        (c) => c.state === 'awaiting_report_response'
      );
      const otherConversations = expiredConversations.filter(
        (c) => c.state !== 'awaiting_report_response'
      );

      if (reportResponseConversations.length > 0) {
        // Report timeouts deactivate from the correct table (residential vs commercial).
        const residentialIdsToDeactivate = reportResponseConversations
          .filter((c) => c.is_commercial !== true)
          .map((c) => c.listing_id)
          .filter((id): id is string => id !== null);
        const commercialIdsToDeactivate = reportResponseConversations
          .filter((c) => c.is_commercial === true)
          .map((c) => c.listing_id)
          .filter((id): id is string => id !== null);

        const deactivation = { is_active: false, deactivated_at: now, updated_at: now };

        if (residentialIdsToDeactivate.length > 0) {
          const { error: deactivateError } = await supabaseAdmin
            .from("listings")
            .update(deactivation)
            .in("id", residentialIdsToDeactivate);

          if (deactivateError) {
            console.error("Error auto-deactivating listings:", deactivateError);
          } else {
            autoDeactivatedCount += residentialIdsToDeactivate.length;
            console.log(`Auto-deactivated ${residentialIdsToDeactivate.length} listings after report timeout`);
          }
        }

        if (commercialIdsToDeactivate.length > 0) {
          const { error: deactivateError } = await supabaseAdmin
            .from("commercial_listings")
            .update(deactivation)
            .in("id", commercialIdsToDeactivate);

          if (deactivateError) {
            console.error("Error auto-deactivating commercial listings:", deactivateError);
          } else {
            autoDeactivatedCount += commercialIdsToDeactivate.length;
            console.log(`Auto-deactivated ${commercialIdsToDeactivate.length} commercial listings after report timeout`);
          }
        }

        const reportIds = reportResponseConversations.map((c) => c.id);
        const { error: updateReportError } = await supabaseAdmin
          .from("listing_renewal_conversations")
          .update({
            state: "timeout",
            action_taken: "auto_deactivated",
            updated_at: now,
          })
          .in("id", reportIds);

        if (updateReportError) {
          console.error("Error updating expired report conversations:", updateReportError);
        } else {
          updatedCount += reportIds.length;
          console.log(`Marked ${reportIds.length} report conversations as timeout (auto_deactivated)`);
        }
      }

      if (otherConversations.length > 0) {
        const otherIds = otherConversations.map((c) => c.id);
        const { error: updateOtherError } = await supabaseAdmin
          .from("listing_renewal_conversations")
          .update({
            state: "timeout",
            action_taken: "timeout",
            updated_at: now,
          })
          .in("id", otherIds);

        if (updateOtherError) {
          console.error("Error updating other expired conversations:", updateOtherError);
        } else {
          updatedCount += otherIds.length;
          console.log(`Marked ${otherIds.length} other conversations as timeout`);
        }
      }
    }

    const summary = {
      expiredFound: expiredConversations?.length || 0,
      updatedCount,
      autoDeactivatedCount,
      timestamp: now,
    };

    console.log("Cleanup expired renewals job completed:", summary);

    return new Response(
      JSON.stringify({ success: true, summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error in cleanup-expired-renewals:", error);
    await reportError(error, { functionName: "cleanup-expired-renewals" });
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});