// Sends the "can we post your apartment — first 2 weeks free" SMS offer to
// vetted intake leads. Admin-triggered from the Intake hub. Each send opens an
// 'outreach' conversation in listing_renewal_conversations; the landlord's
// reply is handled by handle-renewal-sms-webhook (YES auto-publishes to the
// house account, anything else lands in the admin Messages inbox).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const OUTREACH_EXPIRY_DAYS = 14;

interface OutreachRequest {
  scrapedListingIds: string[];
}

export interface OutreachResult {
  id: string;
  title: string | null;
  phone: string | null;
  status: "sent" | "skipped" | "error";
  reason?: string;
}

function toE164(phone: string | null | undefined): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** "3 BR at 14th Ave & 50th St" / "Studio in Boro Park" — for the offer text. */
function describeLead(row: {
  bedrooms: number | null;
  cross_street_1: string | null;
  cross_street_2: string | null;
  neighborhood: string | null;
}): string {
  const beds = row.bedrooms === 0 ? "studio" : row.bedrooms != null ? `${row.bedrooms} BR` : "apartment";
  const streets = [row.cross_street_1, row.cross_street_2].filter(Boolean).join(" & ");
  if (streets) return `${beds} at ${streets}`;
  if (row.neighborhood) return `${beds} in ${row.neighborhood}`;
  return beds;
}

function buildOfferMessage(descriptor: string): string {
  // Deliberately plain: shouty promo phrasing ("FREE", "!!!") is a well-known
  // carrier spam-filter trigger, and cold outreach is already the most filtered
  // category of traffic. Keep it conversational.
  return (
    `Hadirot: We saw your ${descriptor} listed for rent. Hadirot.com has thousands of local tenants searching — can we post it for you? ` +
    `The first 2 weeks are free, with no obligation. Reply YES and we'll put it live. Questions? Just reply here. Reply STOP to opt out.`
  );
}

/**
 * Publishing requirements, mirrored from _shared/publish-intake.ts. The offer
 * promises "reply YES and we'll put it live", so a lead that cannot publish
 * must never receive one — otherwise the landlord says yes and we fail them.
 */
function publishBlockers(row: {
  title: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  contact_name: string | null;
  agency_name: string | null;
  contact_phone: string | null;
  contact_phone_display: string | null;
}): string[] {
  const missing: string[] = [];
  if (!row.title || !row.title.trim()) missing.push('title');
  if (row.bedrooms == null) missing.push('bedrooms');
  if (!row.bathrooms || row.bathrooms <= 0) missing.push('bathrooms');
  if (!(row.contact_name || row.agency_name)) missing.push('contact name');
  if (!(row.contact_phone_display || row.contact_phone)) missing.push('phone');
  return missing;
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

    // --- Admin auth (same pattern as admin-sign-in-as-user) -----------------
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

    let requestData: OutreachRequest;
    try {
      requestData = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const ids = Array.isArray(requestData.scrapedListingIds)
      ? requestData.scrapedListingIds.filter((v) => typeof v === "string")
      : [];
    if (ids.length === 0) return json({ error: "scrapedListingIds is required" }, 400);
    if (ids.length > 100) return json({ error: "Too many leads in one batch (max 100)" }, 400);

    const { data: rows, error: rowsError } = await supabaseAdmin
      .from("scraped_listings")
      .select(
        "id, title, listing_kind, bedrooms, bathrooms, cross_street_1, cross_street_2, neighborhood, contact_name, agency_name, contact_phone, contact_phone_display, call_status, published_listing_id, outreach_status",
      )
      .in("id", ids);
    if (rowsError) return json({ error: rowsError.message }, 500);

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/sms-status-webhook`;

    const results: OutreachResult[] = [];
    // One live offer per phone — includes phones already texted in this batch.
    const phonesInBatch = new Set<string>();

    for (const id of ids) {
      const row = rows?.find((r) => r.id === id);
      if (!row) {
        results.push({ id, title: null, phone: null, status: "error", reason: "Lead not found" });
        continue;
      }

      const skip = (reason: string) =>
        results.push({ id, title: row.title, phone: null, status: "skipped", reason });

      if (row.listing_kind !== "rental") {
        skip("Sales leads can't be offered the rental free trial");
        continue;
      }
      if (row.call_status === "published" || row.published_listing_id) {
        skip("Already published");
        continue;
      }
      if (row.outreach_status && ["sent", "replied", "confirmed"].includes(row.outreach_status)) {
        skip(`Offer already ${row.outreach_status}`);
        continue;
      }

      const phone = toE164(row.contact_phone || row.contact_phone_display);
      if (!phone) {
        skip("No valid US phone number");
        continue;
      }
      const missing = publishBlockers(row);
      if (missing.length > 0) {
        skip(`Can't publish yet — add ${missing.join(", ")} first`);
        continue;
      }
      if (phonesInBatch.has(phone)) {
        skip("Same phone as another lead in this batch — one offer per number");
        continue;
      }

      // One active outreach conversation per phone, across batches.
      const { data: existingConv } = await supabaseAdmin
        .from("listing_renewal_conversations")
        .select("id")
        .eq("phone_number", phone)
        .eq("state", "awaiting_outreach_response")
        .limit(1)
        .maybeSingle();
      if (existingConv) {
        skip("This number already has an open offer conversation");
        continue;
      }

      const descriptor = describeLead(row);
      const message = buildOfferMessage(descriptor);

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
        console.error("Twilio error for", phone, twilioData);
        await supabaseAdmin
          .from("scraped_listings")
          .update({ outreach_status: "error", outreach_sent_at: new Date().toISOString() })
          .eq("id", id);
        results.push({
          id,
          title: row.title,
          phone,
          status: "error",
          reason: twilioData?.message || twilioData?.error_message || "SMS send failed",
        });
        continue;
      }

      const messageSid: string | null = twilioData?.sid ?? null;
      const expiresAt = new Date(Date.now() + OUTREACH_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      const { data: newConv, error: convError } = await supabaseAdmin
        .from("listing_renewal_conversations")
        .insert({
          // Polymorphic column (FK dropped in 20260630010000): holds the
          // scraped_listings id for conversation_type = 'outreach'.
          listing_id: row.id,
          user_id: null,
          phone_number: phone,
          message_sent_at: new Date().toISOString(),
          message_sid: messageSid,
          expires_at: expiresAt.toISOString(),
          state: "awaiting_outreach_response",
          conversation_type: "outreach",
          is_commercial: false,
          metadata: {
            scraped_listing_id: row.id,
            descriptor,
            sent_by_admin: adminUser.id,
          },
        })
        .select("id")
        .maybeSingle();

      if (convError || !newConv) {
        // The SMS went out but the reply has nothing to attach to — mark the
        // lead errored so the admin re-sends after the bug is fixed.
        console.error("Conversation insert failed:", convError);
        await supabaseAdmin
          .from("scraped_listings")
          .update({ outreach_status: "error", outreach_sent_at: new Date().toISOString() })
          .eq("id", id);
        results.push({
          id,
          title: row.title,
          phone,
          status: "error",
          reason: "Offer text sent, but the reply tracker failed — YES replies will not auto-publish",
        });
        continue;
      }

      await supabaseAdmin.from("sms_messages").insert({
        conversation_id: newConv.id,
        direction: "outbound",
        phone_number: phone,
        message_body: message,
        message_sid: messageSid,
        message_source: "intake_outreach",
        listing_id: row.id,
        status: "sent",
      });

      await supabaseAdmin
        .from("scraped_listings")
        .update({
          outreach_status: "sent",
          outreach_sent_at: new Date().toISOString(),
          outreach_conversation_id: newConv.id,
          admin_reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);

      phonesInBatch.add(phone);
      results.push({ id, title: row.title, phone, status: "sent" });
    }

    return json({
      results,
      sent: results.filter((r) => r.status === "sent").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
    });
  } catch (error) {
    console.error("send-intake-outreach-sms error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});
