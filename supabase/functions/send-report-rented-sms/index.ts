import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendViaZepto } from "../_shared/zepto.ts";

// A failed conversation insert means the owner's YES/NO reply has nothing to
// attach to — alert the SMS admin instead of failing silently (this is how
// the state-CHECK constraint bug went unnoticed for months).
async function alertAdminSmsFailure(supabase: any, context: string, detail: unknown) {
  try {
    const { data: cfg } = await supabase
      .from("sms_admin_config")
      .select("admin_email, notify_on_errors")
      .limit(1)
      .maybeSingle();
    if (cfg?.admin_email && cfg?.notify_on_errors !== false) {
      await sendViaZepto({
        to: cfg.admin_email,
        subject: `Hadirot SMS alert: ${context}`,
        html: `<p>${context}</p><pre>${JSON.stringify(detail, null, 2)?.slice(0, 2000)}</pre>`,
      });
    }
  } catch (e) {
    console.error("Failed to send SMS admin alert:", e);
  }
}

interface ReportRequest {
  listingId: string;
  reporterName: string;
  reporterEmail: string;
  isCommercial?: boolean;
}

// Sliding-window rate limiting (mirrors send-contact-message). This function is
// public and fires a paid Twilio SMS to the listing owner plus opens a
// 24h-auto-deactivate conversation, so it is a harassment + cost + takedown
// lever without throttling.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(
  key: string,
  windowMs: number,
  max: number,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    if (rateLimitMap.size > 10_000) {
      for (const [k, v] of rateLimitMap) {
        if (now - v.windowStart >= windowMs) rateLimitMap.delete(k);
      }
    }
    return { allowed: true };
  }

  if (entry.count + 1 > max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((windowMs - (now - entry.windowStart)) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true };
}

function getClientIp(req: Request): string | null {
  const headers = ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"];
  for (const header of headers) {
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

const IP_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const IP_RATE_MAX = 10; // reports per IP per hour

const SPACE_TYPE_SHORT: Record<string, string> = {
  storefront: "Retail",
  restaurant: "Restaurant",
  office: "Office",
  warehouse: "Warehouse",
  industrial: "Industrial",
  mixed_use: "Mixed-Use",
  community_facility: "Community Facility",
  basement_commercial: "Basement",
};

interface TwilioResponse {
  sid: string;
  status: string;
  error_code?: string;
  error_message?: string;
}

function formatPhoneForSMS(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }
  return `+1${cleaned}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Per-IP rate limit (anti-abuse gate against enumerate-and-blast).
    const clientIp = getClientIp(req);
    if (clientIp) {
      const ipHash = await sha256Hex(clientIp);
      const rate = checkRateLimit(`report-ip:${ipHash}`, IP_RATE_WINDOW_MS, IP_RATE_MAX);
      if (!rate.allowed) {
        return new Response(
          JSON.stringify({ error: "Too many requests. Please try again later." }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Retry-After": String(rate.retryAfterSeconds),
            },
          },
        );
      }
    }

    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      console.error("Missing Twilio configuration");
      return new Response(
        JSON.stringify({ error: "SMS service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase configuration");
      return new Response(
        JSON.stringify({ error: "Database service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let requestData: ReportRequest;
    try {
      requestData = await req.json();
      console.log("Report rented request:", {
        listingId: requestData.listingId,
        reporterName: requestData.reporterName,
      });
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!requestData.listingId || !requestData.reporterName || !requestData.reporterEmail) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const isCommercial = requestData.isCommercial === true;
    const tableName = isCommercial ? "commercial_listings" : "listings";
    const selectColumns = isCommercial
      ? "id, user_id, listing_type, full_address, cross_street_a, cross_street_b, neighborhood, price, asking_price, available_sf, commercial_space_type, contact_phone, is_active"
      : "id, user_id, listing_type, location, neighborhood, price, asking_price, bedrooms, contact_phone, is_active";

    const { data: listing, error: listingError } = await supabase
      .from(tableName)
      .select(selectColumns)
      .eq("id", requestData.listingId)
      .single();

    if (listingError || !listing) {
      console.error("Error fetching listing:", listingError);
      return new Response(
        JSON.stringify({ error: "Listing not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!listing.contact_phone) {
      console.log("Listing has no contact_phone, signaling email fallback");
      return new Response(
        JSON.stringify({
          success: false,
          fallback: true,
          message: "No phone number available, please use email fallback"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!listing.is_active) {
      console.log("Listing is already inactive");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Listing is already deactivated",
          alreadyInactive: true
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Dedupe: if a report conversation is already open for this listing, do not
    // send another SMS or open a second conversation. This blocks repeat
    // harassment of the same owner and prevents piling up auto-deactivation
    // timers on one listing.
    const { data: openConversation } = await supabase
      .from("listing_renewal_conversations")
      .select("id")
      .eq("listing_id", listing.id)
      .eq("state", "awaiting_report_response")
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (openConversation) {
      console.log("Report conversation already open for listing:", listing.id);
      return new Response(
        JSON.stringify({
          success: true,
          message: "A report for this listing is already being processed.",
          alreadyReported: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Per-listing rate limit (belt-and-suspenders alongside the dedupe above).
    const listingRate = checkRateLimit(`report-listing:${listing.id}`, IP_RATE_WINDOW_MS, 3);
    if (!listingRate.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many reports for this listing. Please try again later." }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(listingRate.retryAfterSeconds),
          },
        },
      );
    }

    const formattedPhone = formatPhoneForSMS(listing.contact_phone);

    const isSale = listing.listing_type === 'sale';
    const priceValue = isSale ? listing.asking_price : listing.price;
    const priceText = priceValue ? `$${priceValue.toLocaleString()}` : 'Call for price';
    const rentedSoldWord = isSale ? 'sold' : 'rented';

    let descriptor: string;
    let locationText: string;
    if (isCommercial) {
      const spaceLabel = SPACE_TYPE_SHORT[listing.commercial_space_type as string] ?? 'Commercial space';
      const sizeText = listing.available_sf ? `${Number(listing.available_sf).toLocaleString()} SF ` : '';
      descriptor = `${sizeText}${spaceLabel}`;
      locationText = listing.neighborhood
        || listing.full_address
        || [listing.cross_street_a, listing.cross_street_b].filter(Boolean).join(' & ')
        || 'this location';
    } else {
      descriptor = listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} bd`;
      locationText = listing.neighborhood || listing.location;
    }

    const smsMessage = `Hadirot Alert: We received a report that your listing - ${descriptor} at ${locationText} for ${priceText} - has been ${rentedSoldWord}. Is it still available? Reply YES to keep active or NO to deactivate. If you don't respond, we will deactivate in 24 hours.`;

    console.log("Sending report SMS to:", formattedPhone);

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/sms-status-webhook`;

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${twilioAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: formattedPhone,
        From: twilioPhoneNumber,
        Body: smsMessage,
        StatusCallback: statusCallbackUrl,
      }),
    });

    const twilioData: TwilioResponse = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error("Twilio error:", twilioData);
      return new Response(
        JSON.stringify({
          error: "Failed to send SMS",
          details: twilioData.error_message
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("SMS sent successfully:", twilioData.sid);

    try {
      await supabase.from("sms_messages").insert({
        direction: "outbound",
        phone_number: formattedPhone,
        message_body: smsMessage,
        message_sid: twilioData.sid,
        message_source: "report_rented",
        listing_id: listing.id,
        status: "sent",
      });
    } catch (logErr) {
      console.error("Error logging SMS:", logErr);
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const { data: newConv, error: insertError } = await supabase
      .from("listing_renewal_conversations")
      .insert({
        listing_id: listing.id,
        user_id: listing.user_id,
        phone_number: formattedPhone,
        batch_id: null,
        listing_index: null,
        total_in_batch: null,
        message_sent_at: new Date().toISOString(),
        message_sid: twilioData.sid,
        expires_at: expiresAt.toISOString(),
        state: 'awaiting_report_response',
        conversation_type: 'report',
        is_commercial: isCommercial,
        metadata: {
          reporter_name: requestData.reporterName,
          reporter_email: requestData.reporterEmail,
          report_type: 'user_report'
        },
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      console.error("Error creating conversation:", insertError);
      await alertAdminSmsFailure(
        supabase,
        "report-rented conversation insert failed (owner YES/NO reply will not work for this report)",
        { insertError, listingId: listing.id, isCommercial },
      );
    }

    if (newConv) {
      try {
        await supabase.from("sms_messages").update({
          conversation_id: newConv.id,
        }).eq("message_sid", twilioData.sid);
      } catch (linkErr) {
        console.error("Error linking SMS to conversation:", linkErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Report sent! The listing owner has been notified via SMS.",
        smsId: twilioData.sid,
        conversation_created: !insertError && !!newConv,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal error",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
