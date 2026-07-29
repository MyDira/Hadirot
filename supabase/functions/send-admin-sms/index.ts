// Sends a manual SMS from the admin Messages inbox. Admin-authenticated;
// delivers via Twilio, logs to sms_messages (message_source 'admin_manual'),
// and attaches to the phone's open conversation when one exists so the reply
// shows in the right thread context.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const ACTIVE_STATES = [
  "awaiting_availability",
  "awaiting_hadirot_question",
  "awaiting_listing_selection",
  "awaiting_report_response",
  "callback_sent",
  "awaiting_disambiguation",
  "awaiting_outreach_response",
];

function toE164(phone: string | null | undefined): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      return json({ error: "SMS service not configured" }, 500);
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: "Database service not configured" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // --- Admin auth ----------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: adminUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !adminUser) return json({ error: "Invalid authentication" }, 401);
    if (adminUser.app_metadata?.is_admin !== true) {
      return json({ error: "Admin privileges required" }, 403);
    }

    let body: { phoneNumber?: string; message?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const phone = toE164(body.phoneNumber);
    const message = (body.message || "").trim();
    if (!phone) return json({ error: "A valid US phone number is required" }, 400);
    if (!message) return json({ error: "Message text is required" }, 400);
    if (message.length > 1200) return json({ error: "Message too long (max 1200 characters)" }, 400);

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/sms-status-webhook`;

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${twilioAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: phone,
        From: twilioPhoneNumber,
        Body: message,
        StatusCallback: statusCallbackUrl,
      }),
    });
    const twilioData = await twilioResponse.json().catch(() => ({}));

    if (!twilioResponse.ok) {
      console.error("Twilio error:", twilioData);
      return json(
        { error: twilioData?.message || twilioData?.error_message || "Failed to send SMS" },
        500,
      );
    }

    // Attach to the phone's open conversation, if any, purely for threading.
    const { data: activeConv } = await supabaseAdmin
      .from("listing_renewal_conversations")
      .select("id, listing_id")
      .eq("phone_number", phone)
      .in("state", ACTIVE_STATES)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabaseAdmin.from("sms_messages").insert({
      conversation_id: activeConv?.id ?? null,
      direction: "outbound",
      phone_number: phone,
      message_body: message,
      message_sid: twilioData?.sid ?? null,
      message_source: "admin_manual",
      listing_id: activeConv?.listing_id ?? null,
      status: "sent",
      metadata: { sent_by_admin: adminUser.id },
    });

    return json({ success: true, sid: twilioData?.sid ?? null });
  } catch (error) {
    console.error("send-admin-sms error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});
