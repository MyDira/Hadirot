import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface ContactFormData {
  listingId: string;
  userName: string;
  userPhone: string;
  consentToFollowup: boolean;
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
      });
    } catch (error) {
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
        JSON.stringify({
          error: "Missing required fields",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate phone number format (basic US format)
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

    // Fetch listing details
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("bedrooms, location, neighborhood, contact_phone")
      .eq("id", formData.listingId)
      .single();

    if (listingError || !listing) {
      console.error("Error fetching listing:", listingError);
      return new Response(
        JSON.stringify({ error: "Listing not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Format phone number for SMS
    const formatPhoneForSMS = (phone: string): string => {
      const cleaned = phone.replace(/\D/g, "");
      if (cleaned.length === 10) {
        return `+1${cleaned}`;
      } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
        return `+${cleaned}`;
      }
      return phone;
    };

    // Format the SMS message
    const bedroomText = listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms} bd`;
    const locationText = listing.neighborhood || listing.location;

    const smsMessage = `New Hadirot inquiry: ${formData.userName} (${formData.userPhone}) about the ${bedroomText} at ${locationText}`;

    console.log("Sending SMS to:", listing.contact_phone);
    console.log("Message:", smsMessage);

    // Send SMS via Twilio
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
        JSON.stringify({
          error: "Failed to send SMS",
          details: twilioData.error_message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("SMS sent successfully:", twilioData.sid);

    // Store the submission in the database
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
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
