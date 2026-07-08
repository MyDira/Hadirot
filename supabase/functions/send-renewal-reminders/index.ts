import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendViaZepto } from "../_shared/zepto.ts";

// A failed conversation insert means a later YES/NO reply has nothing to
// match — alert the SMS admin instead of failing silently (this is how the
// state-CHECK constraint bug went unnoticed for months).
// deno-lint-ignore no-explicit-any
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

interface ExpiringListing {
  id: string;
  user_id: string;
  listing_type: string | null;
  location: string;
  full_address: string | null;
  neighborhood: string;
  price: number | null;
  contact_phone: string;
  expires_at: string | null;
  payment_kind?: string | null;
  is_commercial: boolean;
  commercial_space_type?: string;
}

interface TwilioResponse {
  sid: string;
  status: string;
  error_code?: string;
  error_message?: string;
}

const SMS_RENEWAL_DAYS = 14;
const MAX_BATCH_SIZE = 10;
const SINGLE_LISTING_TIMEOUT_HOURS = 24;
const BATCH_TIMEOUT_HOURS = 48;

function formatSpaceType(raw: string): string {
  const map: Record<string, string> = {
    storefront: "Retail",
    retail: "Retail",
    restaurant: "Restaurant",
    office: "Office",
    warehouse: "Warehouse",
    medical: "Medical",
    flex: "Flex Space",
    industrial: "Industrial",
    mixed_use: "Mixed Use",
    coworking: "Coworking",
    gallery: "Gallery",
    event_space: "Event Space",
    community_facility: "Community Facility",
    basement_commercial: "Basement Commercial",
  };
  return map[raw?.toLowerCase()] ?? (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Commercial");
}

function formatListingIdentifier(listing: ExpiringListing): string {
  let priceStr: string;
  if (!listing.price) {
    priceStr = "Call for price";
  } else if (listing.listing_type === "sale") {
    if (listing.price >= 1000000) {
      priceStr = `$${(listing.price / 1000000).toFixed(1)}M`;
    } else {
      priceStr = `$${Math.round(listing.price / 1000)}K`;
    }
  } else {
    priceStr = `$${listing.price.toLocaleString()}`;
    if (listing.is_commercial) priceStr += "/mo";
  }

  let locationStr: string;
  if (listing.full_address) {
    locationStr = listing.full_address;
  } else {
    locationStr = listing.location || listing.neighborhood || "your listing";
  }

  if (listing.is_commercial) {
    const spaceLabel = formatSpaceType(listing.commercial_space_type ?? "");
    return `${spaceLabel} at ${locationStr} (${priceStr})`;
  }

  return `${locationStr} for ${priceStr}`;
}

function formatPhoneForSMS(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;
  return `+1${cleaned}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Starting send-renewal-reminders job...");

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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const nyDayOfWeek = new Date().toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
    });

    if (nyDayOfWeek === "Friday" || nyDayOfWeek === "Saturday") {
      console.log(`Skipping SMS renewals - today is ${nyDayOfWeek} (Shabbat observance)`);
      return new Response(
        JSON.stringify({
          success: true,
          message: `SMS renewals skipped for Shabbat observance`,
          day: nyDayOfWeek,
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Day check passed - ${nyDayOfWeek} is a valid SMS day`);

    // Normally target listings expiring exactly 5 days out. On Sundays widen
    // the window to 3-5 days out: the Friday run would have covered day+5
    // (= Wednesday) and the Saturday run day+5 (= Thursday), but both runs are
    // skipped for Shabbat — without this catch-up, listings expiring Wed/Thu
    // never receive a renewal SMS at all (~2/7 of all listings).
    const windowStartOffsetDays = nyDayOfWeek === "Sunday" ? 3 : 5;

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() + windowStartOffsetDays);
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + 5);
    windowEnd.setHours(23, 59, 59, 999);

    console.log(`Looking for listings expiring between ${windowStart.toISOString()} and ${windowEnd.toISOString()}`);

    // ----------------------------------------------------------------
    // Query residential listings
    // ----------------------------------------------------------------
    const { data: residentialListings, error: residentialError } = await supabaseAdmin
      .from("listings")
      .select("id, user_id, listing_type, location, full_address, neighborhood, price, contact_phone, expires_at, payment_kind")
      .eq("is_active", true)
      .eq("approved", true)
      .not("contact_phone", "is", null)
      .gte("expires_at", windowStart.toISOString())
      .lte("expires_at", windowEnd.toISOString());

    if (residentialError) {
      console.error("Error querying expiring residential listings:", residentialError);
      return new Response(
        JSON.stringify({ error: "Failed to query listings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ----------------------------------------------------------------
    // Query commercial listings
    // ----------------------------------------------------------------
    const { data: commercialListings, error: commercialError } = await supabaseAdmin
      .from("commercial_listings")
      .select("id, user_id, listing_type, full_address, neighborhood, price, contact_phone, expires_at, commercial_space_type")
      .eq("is_active", true)
      .eq("approved", true)
      .not("contact_phone", "is", null)
      .gte("expires_at", windowStart.toISOString())
      .lte("expires_at", windowEnd.toISOString());

    if (commercialError) {
      console.error("Error querying expiring commercial listings:", commercialError);
    }

    // Monetized residential rentals (trial / individually paid / must-pay) are
    // handled by send-paid-listing-reminders with a payment link. The free
    // "reply YES to extend" here would promise an extension the payment
    // lifecycle doesn't honor (auto_inactivate deactivates at trial end /
    // paid_until regardless of expires_at).
    const MONETIZED_KINDS = new Set(["individual_trial", "individual_paid", "pending_payment"]);
    const eligibleResidential = (residentialListings ?? []).filter(
      (l: any) => !(l.listing_type === "rental" && MONETIZED_KINDS.has(l.payment_kind)),
    );
    const monetizedSkipped = (residentialListings?.length ?? 0) - eligibleResidential.length;

    const residentialCount = eligibleResidential.length;
    const commercialCount = commercialListings?.length ?? 0;

    console.log(`Found ${residentialCount} residential + ${commercialCount} commercial listings in window (${monetizedSkipped} monetized skipped)`);

    // ----------------------------------------------------------------
    // Merge into a single typed list
    // ----------------------------------------------------------------
    const allListings: ExpiringListing[] = [
      ...eligibleResidential.map((l: any) => ({
        ...l,
        is_commercial: false,
        location: l.location ?? "",
        neighborhood: l.neighborhood ?? "",
      })),
      ...(commercialListings ?? []).map((l: any) => ({
        ...l,
        is_commercial: true,
        location: l.full_address ?? "",
        neighborhood: l.neighborhood ?? "",
      })),
    ];

    if (allListings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No expiring listings found", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ----------------------------------------------------------------
    // Group by normalized phone number
    // ----------------------------------------------------------------
    const listingsByPhone = new Map<string, ExpiringListing[]>();
    for (const listing of allListings) {
      if (!listing.contact_phone) continue;
      const phone = formatPhoneForSMS(listing.contact_phone);
      if (!listingsByPhone.has(phone)) {
        listingsByPhone.set(phone, []);
      }
      listingsByPhone.get(phone)!.push(listing);
    }

    console.log(`Grouped into ${listingsByPhone.size} unique phone numbers`);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let smsSent = 0;
    let smsErrors = 0;
    let skippedDuplicates = 0;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/sms-status-webhook`;

    const daysUntil = (iso: string | null): number => {
      if (!iso) return 5;
      const diff = new Date(iso).getTime() - Date.now();
      return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
    };

    for (const [phoneNumber, listings] of listingsByPhone) {
      // Dedup FIRST, then batch — otherwise a same-day conversation on the
      // first listing would strand the rest of the batch in 'pending' with
      // no head message ever sent.
      const fresh: ExpiringListing[] = [];
      for (const listing of listings) {
        const { data: existingConv } = await supabaseAdmin
          .from("listing_renewal_conversations")
          .select("id")
          .eq("listing_id", listing.id)
          .gte("created_at", todayStart.toISOString())
          .maybeSingle();

        if (existingConv) {
          console.log(`Skipping listing ${listing.id} - conversation already exists today`);
          skippedDuplicates++;
        } else {
          fresh.push(listing);
        }
      }

      if (fresh.length === 0) continue;

      const batchListings = fresh.slice(0, MAX_BATCH_SIZE);
      const isBatch = batchListings.length > 1;
      const batchId = isBatch ? crypto.randomUUID() : null;
      const totalInBatch = isBatch ? batchListings.length : null;
      const timeoutHours = isBatch ? BATCH_TIMEOUT_HOURS : SINGLE_LISTING_TIMEOUT_HOURS;
      const expiresAt = new Date(Date.now() + timeoutHours * 60 * 60 * 1000);

      let smsMessage: string;
      if (!isBatch) {
        const listing = batchListings[0];
        const days = daysUntil(listing.expires_at);
        smsMessage = `Hadirot Alert: Your listing at ${formatListingIdentifier(listing)} expires in ${days} day${days === 1 ? "" : "s"}. Is the listing still available? Reply YES or NO.`;
      } else {
        // One bulk message covering the whole batch. A single reply resolves
        // every listing (the old one-at-a-time chain meant listings 2..N were
        // almost never asked about — owners rarely replied N times).
        const lines = batchListings.map((l, i) => `${i + 1}. ${formatListingIdentifier(l)}`);
        const extra = fresh.length > MAX_BATCH_SIZE
          ? `\n(+${fresh.length - MAX_BATCH_SIZE} more - manage at hadirot.com/dashboard)`
          : "";
        smsMessage =
          `Hadirot Alert: You have ${batchListings.length} listings expiring soon:\n` +
          `${lines.join("\n")}${extra}\n` +
          `Are they all still available? Reply YES to keep all, NO if none are, ` +
          `or the numbers that are no longer available (e.g. 2).`;
      }

      const head = batchListings[0];
      let messageSid: string | null = null;

      try {
        const twilioResponse = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${twilioAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: phoneNumber,
            From: twilioPhoneNumber,
            Body: smsMessage,
            StatusCallback: statusCallbackUrl,
          }),
        });

        const twilioData: TwilioResponse = await twilioResponse.json();

        if (!twilioResponse.ok) {
          console.error(`Twilio error for phone ${phoneNumber}:`, twilioData);
          // Record the failure on the head only; no children are created, so
          // nothing is stranded in 'pending'.
          await supabaseAdmin
            .from("listing_renewal_conversations")
            .insert({
              listing_id: head.id,
              user_id: head.user_id,
              phone_number: phoneNumber,
              batch_id: batchId,
              listing_index: isBatch ? 1 : null,
              total_in_batch: totalInBatch,
              expires_at: expiresAt.toISOString(),
              state: "error",
              action_taken: "sms_failed",
              is_commercial: head.is_commercial,
            });
          smsErrors++;
          continue;
        }

        messageSid = twilioData.sid;
        smsSent++;
        console.log(`SMS sent to ${phoneNumber} (${batchListings.length} listing${isBatch ? "s" : ""}): ${messageSid}`);

        try {
          await supabaseAdmin.from("sms_messages").insert({
            direction: "outbound",
            phone_number: phoneNumber,
            message_body: smsMessage,
            message_sid: messageSid,
            message_source: "renewal_reminder",
            listing_id: head.id,
            status: "sent",
          });
        } catch (logErr) {
          console.error("Error logging SMS:", logErr);
        }
      } catch (error) {
        console.error(`Network error sending SMS to ${phoneNumber}:`, error);
        await supabaseAdmin
          .from("listing_renewal_conversations")
          .insert({
            listing_id: head.id,
            user_id: head.user_id,
            phone_number: phoneNumber,
            batch_id: batchId,
            listing_index: isBatch ? 1 : null,
            total_in_batch: totalInBatch,
            expires_at: expiresAt.toISOString(),
            state: "error",
            action_taken: "sms_failed",
            is_commercial: head.is_commercial,
          });
        smsErrors++;
        continue;
      }

      // Head conversation carries the awaiting state; metadata.bulk tells the
      // webhook that a single reply resolves the entire batch.
      const { data: headConv, error: headInsertError } = await supabaseAdmin
        .from("listing_renewal_conversations")
        .insert({
          listing_id: head.id,
          user_id: head.user_id,
          phone_number: phoneNumber,
          batch_id: batchId,
          listing_index: isBatch ? 1 : null,
          total_in_batch: totalInBatch,
          message_sent_at: new Date().toISOString(),
          message_sid: messageSid,
          expires_at: expiresAt.toISOString(),
          state: "awaiting_availability",
          is_commercial: head.is_commercial,
          metadata: isBatch ? { bulk: true, listing_count: batchListings.length } : null,
        })
        .select("id")
        .maybeSingle();

      if (headInsertError) {
        console.error(`Error creating conversation for listing ${head.id}:`, headInsertError);
        await alertAdminSmsFailure(
          supabaseAdmin,
          "renewal-reminder conversation insert failed (owner's YES/NO reply will not match)",
          { headInsertError, listingId: head.id, phoneNumber },
        );
      } else if (headConv?.id && messageSid) {
        try {
          await supabaseAdmin
            .from("sms_messages")
            .update({ conversation_id: headConv.id })
            .eq("message_sid", messageSid);
        } catch (linkErr) {
          console.error("Error linking SMS to conversation:", linkErr);
        }
      }

      // Children rows track the per-listing outcome; the webhook resolves them
      // all from the head's single reply.
      for (let i = 1; i < batchListings.length; i++) {
        const listing = batchListings[i];
        const { error: childInsertError } = await supabaseAdmin
          .from("listing_renewal_conversations")
          .insert({
            listing_id: listing.id,
            user_id: listing.user_id,
            phone_number: phoneNumber,
            batch_id: batchId,
            listing_index: i + 1,
            total_in_batch: totalInBatch,
            expires_at: expiresAt.toISOString(),
            state: "pending",
            is_commercial: listing.is_commercial,
          });

        if (childInsertError) {
          console.error(`Error creating pending conversation for listing ${listing.id}:`, childInsertError);
          await alertAdminSmsFailure(
            supabaseAdmin,
            "renewal-reminder batch child insert failed (this listing will not be resolved by the owner's reply)",
            { childInsertError, listingId: listing.id, batchId },
          );
        }
      }
    }

    const summary = {
      totalExpiring: allListings.length,
      residentialExpiring: residentialCount,
      commercialExpiring: commercialCount,
      uniquePhones: listingsByPhone.size,
      smsSent,
      smsErrors,
      skippedDuplicates,
      timestamp: new Date().toISOString(),
    };

    console.log("Send renewal reminders job completed:", summary);

    return new Response(
      JSON.stringify({ success: true, summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error in send-renewal-reminders:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
