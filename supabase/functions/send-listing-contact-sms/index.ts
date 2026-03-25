import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface ContactFormData {
  listingId: string;
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

    if (!formData.listingId || !formData.userName || !formData.userPhone) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const phoneRegex = /^\+?1?\d{10}$/;
    const cleanedPhone = formData.userPhone.replace(/\D/g, "");
    if (!phoneRegex.test(cleanedPhone) || cleanedPhone.length !== 10) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
        ? `${siteUrl}/commercial/${formData.listingId}`
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
    const { error: insertError } = await supabase
      .from("listing_contact_submissions")
      .insert({
        listing_id: formData.listingId,
        user_name: formData.userName,
        user_phone: formData.userPhone,
        consent_to_followup: formData.consentToFollowup || false,
        session_id: formData.sessionId,
        ip_address: formData.ipAddress,
        user_agent: formData.userAgent,
      });

    if (insertError) {
      console.error("Error storing submission:", insertError);
    }

    // ----------------------------------------------------------------
    // Create callback conversation (non-sale listings only)
    // ----------------------------------------------------------------
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
      }
    }

    // ----------------------------------------------------------------
    // Boost upsell SMS (3-second delay for separate visual message)
    // ----------------------------------------------------------------
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

    return new Response(
      JSON.stringify({
        success: true,
        message: "Contact request sent successfully!",
        smsId: twilioData.sid,
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
