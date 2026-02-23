import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ReportRequest {
  listingId: string;
  reporterName: string;
  reporterEmail: string;
}

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

    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("id, user_id, listing_type, location, neighborhood, price, asking_price, bedrooms, contact_phone, is_active")
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

    const formattedPhone = formatPhoneForSMS(listing.contact_phone);

    const bedroomText = listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms} bd`;
    const locationText = listing.neighborhood || listing.location;
    const isSale = listing.listing_type === 'sale';
    const priceValue = isSale ? listing.asking_price : listing.price;
    const priceText = priceValue ? `$${priceValue.toLocaleString()}` : 'Call for price';
    const rentedSoldWord = isSale ? 'sold' : 'rented';

    const smsMessage = `Hadirot Alert: We received a report that your listing - ${bedroomText} at ${locationText} for ${priceText} - has been ${rentedSoldWord}. Is it still available? Reply YES to keep active or NO to deactivate. If you don't respond, we will deactivate in 24 hours.`;

    console.log("Sending report SMS to:", formattedPhone);

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

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
