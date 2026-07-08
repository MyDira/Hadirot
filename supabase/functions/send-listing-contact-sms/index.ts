import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendViaZepto } from "../_shared/zepto.ts";

// A failed conversation insert means a later "RENTED" reply has nothing to
// match — alert the SMS admin instead of failing silently (this is how the
// state-CHECK constraint bug went unnoticed for months).
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

interface ContactFormData {
  listingId?: string;
  commercialListingId?: string;
  userName: string;
  userPhone: string;
  consentToFollowup: boolean;
  isCommercial?: boolean;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface TwilioResponse {
  sid: string;
  status: string;
  error_code?: string;
  error_message?: string;
}

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

    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      console.error("Missing Twilio configuration");
      return new Response(
        JSON.stringify({ error: "SMS service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase configuration");
      return new Response(
        JSON.stringify({ error: "Database service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let formData: ContactFormData;
    try {
      formData = await req.json();
      console.log("Contact form submission:", {
        listingId: formData.listingId,
        userName: formData.userName,
        isCommercial: formData.isCommercial ?? false,
      });
    } catch (_error) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Commercial callers send `commercialListingId`; normalize it into `listingId`
    // so the rest of the handler (which branches on isCommercial + the correct
    // table) can treat the id uniformly.
    if (formData.isCommercial === true && formData.commercialListingId) {
      formData.listingId = formData.commercialListingId;
    }

    if (!formData.listingId || !formData.userName || !formData.userPhone) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let cleanedPhone = formData.userPhone.replace(/\D/g, "");
    if (cleanedPhone.length === 11 && cleanedPhone.startsWith("1")) {
      cleanedPhone = cleanedPhone.slice(1);
    }
    if (cleanedPhone.length !== 10) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    // Normalize so the SMS body, the duplicate-submit rate-limit check, and
    // the submissions log all use the same value regardless of how the
    // caller formatted the input (e.g. "+1 (555) 123-4567" vs "5551234567").
    formData.userPhone = `${cleanedPhone.slice(0, 3)}-${cleanedPhone.slice(3, 6)}-${cleanedPhone.slice(6)}`;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(formData.listingId)) {
      return new Response(
        JSON.stringify({ error: "Invalid listingId format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (formData.userName.length > 200) {
      return new Response(
        JSON.stringify({ error: "Field too long: userName" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (formData.userAgent && formData.userAgent.length > 500) {
      return new Response(
        JSON.stringify({ error: "Field too long: userAgent" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ----------------------------------------------------------------
    // Rate limiting — this endpoint is reachable with just the anon key
    // (verify_jwt passes for any authenticated-or-anon caller), so without
    // limits here it can be looped to SMS-bomb listing owners and burn
    // Twilio spend. Each check fails OPEN on its own query error:
    // availability of the real feature matters more than the limit if the
    // rate-limit check itself breaks.
    // ----------------------------------------------------------------
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: recentContactCount, error: contactCountError } = await supabase
        .from("sms_messages")
        .select("id", { count: "exact", head: true })
        .eq("message_source", "contact_notification")
        .eq("listing_id", formData.listingId)
        .gt("created_at", oneHourAgo);

      if (contactCountError) {
        console.error("Rate limit check (sms_messages) failed, failing open:", contactCountError);
      } else if ((recentContactCount ?? 0) >= 3) {
        return new Response(
          JSON.stringify({ error: "Too many contact requests for this listing right now. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (rateLimitErr) {
      console.error("Rate limit check (sms_messages) threw, failing open:", rateLimitErr);
    }

    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count: recentSubmissionCount, error: submissionCountError } = await supabase
        .from("listing_contact_submissions")
        .select("id", { count: "exact", head: true })
        .eq("user_phone", formData.userPhone)
        .gt("created_at", tenMinutesAgo)
        .or(`listing_id.eq.${formData.listingId},commercial_listing_id.eq.${formData.listingId}`);

      if (submissionCountError) {
        console.error("Rate limit check (listing_contact_submissions) failed, failing open:", submissionCountError);
      } else if ((recentSubmissionCount ?? 0) >= 1) {
        return new Response(
          JSON.stringify({ error: "You already requested a callback for this listing. The owner has been notified." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (dupSubmitErr) {
      console.error("Rate limit check (listing_contact_submissions) threw, failing open:", dupSubmitErr);
    }

    const formatPhoneForSMS = (phone: string): string => {
      const cleaned = phone.replace(/\D/g, "");
      if (cleaned.length === 10) return `+1${cleaned}`;
      if (cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;
      return phone;
    };

    const formatPriceForSMS = (params: {
      price: number | null;
      asking_price: number | null;
      listing_type: string;
      call_for_price: boolean;
      isCommercial: boolean;
    }): string => {
      if (params.call_for_price) return "Call for Price";
      const isSale = params.listing_type === "sale";
      const priceValue = isSale ? params.asking_price : params.price;
      if (priceValue === null || priceValue === undefined) return "Price Not Available";
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(priceValue);
      return params.isCommercial && !isSale ? `${formatted}/mo` : formatted;
    };

    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";
    const isCommercial = formData.isCommercial === true;

    // ----------------------------------------------------------------
    // Fetch listing from the correct table
    // ----------------------------------------------------------------
    let listing: {
      contact_phone: string;
      listing_type: string;
      price: number | null;
      asking_price: number | null;
      call_for_price: boolean;
      user_id: string;
      is_featured: boolean;
      featured_expires_at: string | null;
      // residential fields
      bedrooms?: number | null;
      location?: string;
      neighborhood?: string;
      cross_street_a?: string | null;
      cross_street_b?: string | null;
      // commercial fields
      commercial_space_type?: string;
      full_address?: string | null;
    } | null = null;

    if (isCommercial) {
      const { data, error } = await supabase
        .from("commercial_listings")
        .select("commercial_space_type, full_address, cross_street_a, cross_street_b, contact_phone, price, asking_price, listing_type, call_for_price, user_id, is_featured, featured_expires_at")
        .eq("id", formData.listingId)
        .single();

      if (error || !data) {
        console.error("Error fetching commercial listing:", error);
        return new Response(
          JSON.stringify({ error: "Listing not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      listing = data;
    } else {
      const { data, error } = await supabase
        .from("listings")
        .select("bedrooms, location, neighborhood, contact_phone, price, asking_price, listing_type, call_for_price, cross_street_a, cross_street_b, user_id, is_featured, featured_expires_at")
        .eq("id", formData.listingId)
        .single();

      if (error || !data) {
        console.error("Error fetching listing:", error);
        return new Response(
          JSON.stringify({ error: "Listing not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      listing = data;
    }

    console.log("Listing details:", {
      listingType: listing.listing_type,
      price: listing.price,
      askingPrice: listing.asking_price,
      isCommercial,
    });

    // ----------------------------------------------------------------
    // Build location and description strings
    // ----------------------------------------------------------------
    let locationText: string;
    let listingDescText: string;

    if (isCommercial) {
      if (listing.full_address) {
        locationText = listing.full_address;
      } else if (listing.cross_street_a && listing.cross_street_b) {
        locationText = `${listing.cross_street_a} & ${listing.cross_street_b}`;
      } else {
        locationText = "your space";
      }
      const spaceLabel = formatSpaceType(listing.commercial_space_type ?? "");
      listingDescText = `${spaceLabel} at ${locationText}`;
    } else {
      if (listing.cross_street_a && listing.cross_street_b) {
        locationText = `${listing.cross_street_a} & ${listing.cross_street_b}`;
      } else {
        locationText = listing.location ?? "";
      }
      const bedroomText = listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms} bd`;
      listingDescText = `${bedroomText} at ${locationText}`;
    }

    const formattedPrice = formatPriceForSMS({
      price: listing.price ?? null,
      asking_price: listing.asking_price ?? null,
      listing_type: listing.listing_type,
      call_for_price: listing.call_for_price,
      isCommercial,
    });

    const isSale = listing.listing_type === "sale";

    // ----------------------------------------------------------------
    // Create short URL
    // ----------------------------------------------------------------
    let shortCode: string | null = null;
    try {
      const listingPath = isCommercial
        ? `${siteUrl}/commercial-listing/${formData.listingId}`
        : `${siteUrl}/listing/${formData.listingId}`;

      const { data: code, error: shortUrlError } = await supabase.rpc("create_short_url", {
        p_listing_id: formData.listingId,
        p_original_url: listingPath,
        p_source: "sms_notification",
        p_expires_days: 90,
      });

      if (shortUrlError) {
        console.error("Error creating short URL:", shortUrlError);
      } else {
        shortCode = code;
      }
    } catch (error) {
      console.error("Failed to create short URL:", error);
    }

    // ----------------------------------------------------------------
    // Build SMS message
    // ----------------------------------------------------------------
    const messageParts = [
      `Hadirot Alert: ${formData.userName} wants a call about your ${listingDescText} (${formattedPrice})`,
      `Call: ${formData.userPhone}`,
    ];

    if (shortCode) {
      messageParts.push(`${siteUrl}/l/${shortCode}`);
    }

    if (isSale) {
      messageParts.push(`If this property is no longer available, please log into hadirot.com/dashboard to update the status.`);
    } else {
      messageParts.push(`If this property is no longer available, reply RENTED.`);
    }

    const smsMessage = messageParts.join("\n");

    console.log("Sending SMS to:", listing.contact_phone);

    // ----------------------------------------------------------------
    // Send via Twilio
    // ----------------------------------------------------------------
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${twilioAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: formatPhoneForSMS(listing.contact_phone),
        From: twilioPhoneNumber,
        Body: smsMessage,
      }),
    });

    const twilioData: TwilioResponse = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error("Twilio error:", twilioData);
      return new Response(
        JSON.stringify({ error: "Failed to send SMS", details: twilioData.error_message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("SMS sent successfully:", twilioData.sid);

    // ----------------------------------------------------------------
    // Log to sms_messages
    // ----------------------------------------------------------------
    try {
      await supabase.from("sms_messages").insert({
        direction: "outbound",
        phone_number: formatPhoneForSMS(listing.contact_phone),
        message_body: smsMessage,
        message_sid: twilioData.sid,
        message_source: "contact_notification",
        listing_id: formData.listingId,
        status: "sent",
      });
    } catch (logErr) {
      console.error("Error logging SMS:", logErr);
    }

    // ----------------------------------------------------------------
    // Log to listing_contact_submissions
    // ----------------------------------------------------------------
    // Client-supplied ipAddress is not trustworthy (it's just a field the
    // caller can set to anything) — derive it from request headers instead.
    const forwardedFor = req.headers.get("x-forwarded-for");
    const derivedIpAddress = forwardedFor
      ? forwardedFor.split(",")[0].trim()
      : req.headers.get("cf-connecting-ip") || null;

    const { error: insertError } = await supabase
      .from("listing_contact_submissions")
      .insert({
        listing_id: isCommercial ? null : formData.listingId,
        commercial_listing_id: isCommercial ? formData.listingId : null,
        user_name: formData.userName,
        user_phone: formData.userPhone,
        consent_to_followup: formData.consentToFollowup || false,
        session_id: formData.sessionId,
        ip_address: derivedIpAddress,
        user_agent: formData.userAgent,
      });

    if (insertError) {
      console.error("Error storing submission:", insertError);
    }

    // ----------------------------------------------------------------
    // Create callback conversation (non-sale listings only)
    // ----------------------------------------------------------------
    let callbackConversationCreated = true; // sales don't create one — not a failure
    if (!isSale && listing.user_id) {
      const callbackExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);
      const { error: convError } = await supabase
        .from("listing_renewal_conversations")
        .insert({
          listing_id: formData.listingId,
          user_id: listing.user_id,
          phone_number: formatPhoneForSMS(listing.contact_phone),
          batch_id: null,
          listing_index: null,
          total_in_batch: null,
          message_sent_at: new Date().toISOString(),
          message_sid: twilioData.sid,
          expires_at: callbackExpires.toISOString(),
          state: "callback_sent",
          conversation_type: "callback",
          is_commercial: isCommercial,
          metadata: {
            inquiry_from: formData.userName,
            inquiry_phone: formData.userPhone,
          },
        });
      if (convError) {
        console.error("Error creating callback conversation:", convError);
        await alertAdminSmsFailure(
          supabase,
          "callback conversation insert failed (owner RENTED reply will not match)",
          { convError, listingId: formData.listingId, isCommercial },
        );
      }
      callbackConversationCreated = !convError;
    }

    // ----------------------------------------------------------------
    // Boost upsell SMS — runs in the background AFTER the response is sent.
    // The 3s delay keeps it visually separate from the alert SMS without
    // holding the caller's HTTP request open.
    // ----------------------------------------------------------------
    const upsellTask = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      const agentPhone = formatPhoneForSMS(listing.contact_phone);

      const alreadyFeatured =
        listing.is_featured &&
        listing.featured_expires_at &&
        new Date(listing.featured_expires_at) > new Date();

      if (alreadyFeatured) {
        console.log("Boost upsell skipped: listing is already featured");
      } else {
        const { data: existingUpsell } = await supabase
          .from("sms_messages")
          .select("id")
          .eq("listing_id", formData.listingId)
          .eq("message_source", "boost_upsell")
          .limit(1)
          .maybeSingle();

        if (existingUpsell) {
          console.log("Boost upsell skipped: listing already received upsell");
        } else {
          const { data: previousCallback } = await supabase
            .from("sms_messages")
            .select("id")
            .eq("phone_number", agentPhone)
            .eq("message_source", "contact_notification")
            .neq("message_sid", twilioData.sid)
            .limit(1)
            .maybeSingle();

          if (!previousCallback) {
            console.log("Boost upsell skipped: this is their first-ever callback");
          } else {
            let listingDesc: string;
            if (isCommercial) {
              const spaceLabel = formatSpaceType(listing.commercial_space_type ?? "");
              listingDesc = `${spaceLabel} at ${locationText}`;
            } else {
              const street = listing.cross_street_a || listing.neighborhood || "your listing";
              const bedroomUpsellText = listing.bedrooms ? `${listing.bedrooms}BR` : "listing";
              listingDesc = listing.bedrooms ? `${bedroomUpsellText} on ${street}` : street;
            }

            const upsellMessage = `Hadirot Tip: Want more inquiries on your ${listingDesc}? Boost it to the top of search results — starting at $25/wk: ${siteUrl}/boost/${formData.listingId}`;

            const upsellTwilioResponse = await fetch(twilioUrl, {
              method: "POST",
              headers: {
                "Authorization": `Basic ${twilioAuth}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                To: agentPhone,
                From: twilioPhoneNumber,
                Body: upsellMessage,
              }),
            });

            const upsellTwilioData: TwilioResponse = await upsellTwilioResponse.json();

            if (upsellTwilioResponse.ok) {
              console.log("Boost upsell SMS sent:", upsellTwilioData.sid);
              await supabase.from("sms_messages").insert({
                direction: "outbound",
                phone_number: agentPhone,
                message_body: upsellMessage,
                message_sid: upsellTwilioData.sid,
                message_source: "boost_upsell",
                listing_id: formData.listingId,
                status: "sent",
              });
            } else {
              console.error("Boost upsell Twilio error:", upsellTwilioData);
            }
          }
        }
      }
    } catch (upsellErr) {
      console.error("Boost upsell error (non-fatal):", upsellErr);
    }
    })();
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) {
      runtime.waitUntil(upsellTask);
    } else {
      await upsellTask;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Contact request sent successfully!",
        smsId: twilioData.sid,
        conversation_created: callbackConversationCreated,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
