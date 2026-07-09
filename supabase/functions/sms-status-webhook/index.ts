import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendViaZepto } from "../_shared/zepto.ts";
import { formDataToParams, verifyTwilioRequest } from "../_shared/verifyTwilioSignature.ts";

// Twilio StatusCallback webhook. Twilio POSTs application/x-www-form-urlencoded
// with MessageSid + MessageStatus (queued|sending|sent|delivered|undelivered|failed)
// and optionally ErrorCode. Before this existed, every outbound sms_messages row
// stayed status='sent' forever — A2P filtering and invalid numbers were invisible.
const TERMINAL_STATUSES = new Set(["delivered", "undelivered", "failed"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Twilio doesn't care about the response body, just a 2xx. Always return
  // 200 with an empty body — even on internal errors — so Twilio never
  // retries/backs off this webhook.
  try {
    const formData = await req.formData();

    // Validate the Twilio signature before trusting any status field. Returns
    // 403 on mismatch (Twilio won't retry StatusCallbacks on a 403, and a
    // forged callback should never mutate our sms_messages rows).
    const twilioParams = formDataToParams(formData);
    const signatureValid = await verifyTwilioRequest(req, twilioParams);
    if (!signatureValid) {
      console.error("Rejected SMS status callback: invalid X-Twilio-Signature");
      return new Response(null, { status: 403, headers: corsHeaders });
    }

    const messageSid = formData.get("MessageSid")?.toString() || "";
    const messageStatus = formData.get("MessageStatus")?.toString() || "";
    const errorCode = formData.get("ErrorCode")?.toString() || "";

    if (!messageSid || !messageStatus) {
      console.error("Missing MessageSid or MessageStatus in status callback");
      return new Response(null, { status: 400, headers: corsHeaders });
    }

    // Only persist meaningful transitions — queued/sending/sent are noise
    // (sent is already the default we write at send time).
    if (!TERMINAL_STATUSES.has(messageStatus)) {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase configuration");
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const updatePayload: Record<string, unknown> = { status: messageStatus };
    if (errorCode) {
      updatePayload.metadata = { twilio_error_code: errorCode };
    }

    const { data: updatedRow, error: updateError } = await supabaseAdmin
      .from("sms_messages")
      .update(updatePayload)
      .eq("message_sid", messageSid)
      .eq("direction", "outbound")
      .select("phone_number, message_source")
      .maybeSingle();

    if (updateError) {
      console.error("Error updating sms_messages status:", updateError);
    }

    if (messageStatus === "undelivered" || messageStatus === "failed") {
      try {
        const { data: config } = await supabaseAdmin
          .from("sms_admin_config")
          .select("admin_email, notify_on_errors")
          .limit(1)
          .maybeSingle();

        if (config?.admin_email && config.notify_on_errors !== false) {
          const details = [
            `SID: ${messageSid}`,
            `Status: ${messageStatus}`,
            errorCode ? `Error code: ${errorCode}` : null,
            updatedRow?.phone_number ? `Phone: ${updatedRow.phone_number}` : null,
            updatedRow?.message_source ? `Source: ${updatedRow.message_source}` : null,
          ].filter(Boolean).join("\n");

          await sendViaZepto({
            to: config.admin_email,
            subject: "Hadirot SMS alert: message undelivered",
            html: `<p>An outbound SMS could not be delivered.</p><pre>${details}</pre>`,
            fromName: "Hadirot SMS System",
          });
        }
      } catch (notifyError) {
        console.error("Error sending admin undelivered-SMS notification:", notifyError);
      }
    }

    return new Response(null, { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("Error handling SMS status callback:", error);
    return new Response(null, { status: 200, headers: corsHeaders });
  }
});
