// Daily cron — sends payment-focused SMS reminders for residential-rental listings.
//
// Three reminder types (each at a fixed offset from a key date):
//   1. Trial-ending: listing is in 14-day trial, deadline 3 days away or today.
//   2. Paid balance ending: paid_until is 3 days away or today.
//   3. Post-deactivation: listing was deactivated exactly 3 days ago.
//
// Subscribers are excluded (their listings are covered until subscription ends;
// the existing 5-day "is it still available?" cron handles their freshness).
//
// Tone mirrors the existing send-renewal-reminders / handle-renewal-sms-webhook:
//   "Hadirot Alert: ..." prefix
//   Listing identifier format: "{neighborhood or location} for ${price}"
//
// Shabbat-aware (skips Friday/Saturday in America/New_York).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SOURCE_KEY = "paid_listing_reminder";

interface ListingRow {
  id: string;
  user_id: string;
  contact_phone: string | null;
  contact_phone_e164: string | null;
  neighborhood: string | null;
  location: string | null;
  price: number | null;
  payment_kind: string | null;
  trial_started_at: string | null;
  paid_until: string | null;
  expires_at: string | null;
  deactivated_at: string | null;
}

interface TwilioResponse {
  sid: string;
  status: string;
  error_code?: string;
  error_message?: string;
}

function formatPhoneForSMS(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;
  return `+1${cleaned}`;
}

function formatListingIdentifier(l: ListingRow): string {
  const loc = l.neighborhood || l.location || "your listing";
  const priceStr = l.price ? `$${l.price.toLocaleString()}` : "Call for price";
  return `${loc} for ${priceStr}`;
}

function todayInNY(): string {
  return new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  });
}

function isoStartOfUtcDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function isoEndOfUtcDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const publicBaseUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      return new Response(JSON.stringify({ error: "Twilio not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Supabase not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const day = todayInNY();
    if (day === "Friday" || day === "Saturday") {
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: `Shabbat observance (${day})`,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Phase J: skip everything if the master switch is off.
    const { data: settingsRow } = await supabaseAdmin
      .from("admin_settings")
      .select("monetization_enabled")
      .limit(1)
      .maybeSingle();
    if (!settingsRow || settingsRow.monetization_enabled !== true) {
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'monetization_disabled',
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const reminders: Array<{ listing: ListingRow; message: string; kind: string }> = [];

    // -------------------------------------------------------------
    // (1) Trial ending — 3 days away or today
    // -------------------------------------------------------------
    // Trial deadline = trial_started_at + 14 days.
    // We want listings where the deadline falls today (offset 0) or in 3 days (offset 3).
    // Equivalently: trial_started_at + 14d falls in [start_of_offset_day, end_of_offset_day].
    for (const offset of [3, 0]) {
      // trial_started_at must be in [now-14+offset, now-14+offset+1)
      const targetStart = new Date();
      targetStart.setUTCDate(targetStart.getUTCDate() - 14 + offset);
      targetStart.setUTCHours(0, 0, 0, 0);
      const targetEnd = new Date(targetStart);
      targetEnd.setUTCHours(23, 59, 59, 999);

      const { data: trialListings } = await supabaseAdmin
        .from("listings")
        .select(
          "id, user_id, contact_phone, contact_phone_e164, neighborhood, location, price, payment_kind, trial_started_at, paid_until, expires_at, deactivated_at",
        )
        .eq("listing_type", "rental")
        .eq("payment_kind", "individual_trial")
        .eq("is_active", true)
        .gte("trial_started_at", targetStart.toISOString())
        .lte("trial_started_at", targetEnd.toISOString())
        .not("contact_phone_e164", "is", null);

      for (const l of (trialListings || []) as ListingRow[]) {
        const id = formatListingIdentifier(l);
        const url = `${publicBaseUrl}/dashboard?listing=${l.id}&action=pay`;
        const message = offset === 0
          ? `Hadirot Alert: Your free trial for the listing at ${id} ends today. Pay $25 to keep it live: ${url}`
          : `Hadirot Alert: Your free trial for the listing at ${id} ends in 3 days. Pay $25 to keep it live: ${url}`;
        reminders.push({ listing: l, message, kind: offset === 0 ? "trial_dayof" : "trial_3day" });
      }
    }

    // -------------------------------------------------------------
    // (2) Paid balance ending — 3 days away or today
    // -------------------------------------------------------------
    // paid_until in [start_of_offset_day, end_of_offset_day]
    for (const offset of [3, 0]) {
      const { data: paidListings } = await supabaseAdmin
        .from("listings")
        .select(
          "id, user_id, contact_phone, contact_phone_e164, neighborhood, location, price, payment_kind, trial_started_at, paid_until, expires_at, deactivated_at",
        )
        .eq("listing_type", "rental")
        .eq("payment_kind", "individual_paid")
        .eq("is_active", true)
        .gte("paid_until", isoStartOfUtcDay(offset))
        .lte("paid_until", isoEndOfUtcDay(offset))
        .not("contact_phone_e164", "is", null);

      for (const l of (paidListings || []) as ListingRow[]) {
        const id = formatListingIdentifier(l);
        const url = `${publicBaseUrl}/dashboard?listing=${l.id}&action=pay`;

        // Renewal pricing: $15 if listing has prior payments, else $25.
        const { count: priorCount } = await supabaseAdmin
          .from("paid_listing_payments")
          .select("id", { count: "exact", head: true })
          .eq("listing_id", l.id);
        const priceStr = (priorCount ?? 0) >= 1 ? "$15" : "$25";

        const message = offset === 0
          ? `Hadirot Alert: Your listing at ${id} expires today. Renew for ${priceStr}: ${url}`
          : `Hadirot Alert: Your listing at ${id} expires in 3 days. Renew for ${priceStr}/30 days: ${url}`;
        reminders.push({ listing: l, message, kind: offset === 0 ? "paid_dayof" : "paid_3day" });
      }
    }

    // -------------------------------------------------------------
    // (3) Post-deactivation — exactly 3 days ago
    // -------------------------------------------------------------
    // Residential rentals deactivated 3 days ago, still inactive,
    // and not yet purged by auto_delete (within the 30-day window).
    {
      const targetStart = new Date();
      targetStart.setUTCDate(targetStart.getUTCDate() - 3);
      targetStart.setUTCHours(0, 0, 0, 0);
      const targetEnd = new Date(targetStart);
      targetEnd.setUTCHours(23, 59, 59, 999);

      const { data: deactivatedListings } = await supabaseAdmin
        .from("listings")
        .select(
          "id, user_id, contact_phone, contact_phone_e164, neighborhood, location, price, payment_kind, trial_started_at, paid_until, expires_at, deactivated_at",
        )
        .eq("listing_type", "rental")
        .eq("is_active", false)
        // Exclude listings deactivated as legacy_free (pre-launch inactive listings).
        .in("payment_kind", ["individual_trial", "individual_paid", "subscription"])
        .gte("deactivated_at", targetStart.toISOString())
        .lte("deactivated_at", targetEnd.toISOString())
        .not("contact_phone_e164", "is", null);

      for (const l of (deactivatedListings || []) as ListingRow[]) {
        const id = formatListingIdentifier(l);
        const url = `${publicBaseUrl}/dashboard?listing=${l.id}&action=reactivate`;

        // Renewal pricing for reactivation: same rule.
        const { count: priorCount } = await supabaseAdmin
          .from("paid_listing_payments")
          .select("id", { count: "exact", head: true })
          .eq("listing_id", l.id);
        const priceStr = (priorCount ?? 0) >= 1 ? "$15" : "$25";

        const message = `Hadirot Alert: Your listing at ${id} has been off for 3 days. Reactivate for ${priceStr}: ${url}`;
        reminders.push({ listing: l, message, kind: "post_deactivation_3day" });
      }
    }

    // -------------------------------------------------------------
    // Send reminders (dedup against today's same-source sends)
    // -------------------------------------------------------------
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    let smsSent = 0;
    let smsErrors = 0;
    let skipped = 0;

    for (const r of reminders) {
      const phone = formatPhoneForSMS(r.listing.contact_phone_e164 || r.listing.contact_phone || "");
      if (!phone) {
        skipped++;
        continue;
      }

      // Skip if we've already sent a paid-listing reminder for this listing today.
      const { data: existing } = await supabaseAdmin
        .from("sms_messages")
        .select("id")
        .eq("phone_number", phone)
        .eq("listing_id", r.listing.id)
        .eq("message_source", SOURCE_KEY)
        .gte("created_at", todayStart.toISOString())
        .limit(1)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      try {
        const resp = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${twilioAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: phone,
            From: twilioPhoneNumber,
            Body: r.message,
          }),
        });
        const data: TwilioResponse = await resp.json();

        if (!resp.ok) {
          console.error(`Twilio error sending ${r.kind} reminder for listing ${r.listing.id}:`, data);
          smsErrors++;
          await supabaseAdmin.from("sms_messages").insert({
            direction: "outbound",
            phone_number: phone,
            message_body: r.message,
            message_source: SOURCE_KEY,
            listing_id: r.listing.id,
            status: "failed",
          });
          continue;
        }

        smsSent++;
        await supabaseAdmin.from("sms_messages").insert({
          direction: "outbound",
          phone_number: phone,
          message_body: r.message,
          message_sid: data.sid,
          message_source: SOURCE_KEY,
          listing_id: r.listing.id,
          status: "sent",
        });
      } catch (sendErr) {
        console.error(`Network error sending ${r.kind} for listing ${r.listing.id}:`, sendErr);
        smsErrors++;
      }
    }

    const summary = {
      day,
      reminders_found: reminders.length,
      smsSent,
      smsErrors,
      skipped,
      timestamp: new Date().toISOString(),
    };
    console.log("send-paid-listing-reminders complete:", summary);

    return new Response(JSON.stringify({ success: true, summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-paid-listing-reminders error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
