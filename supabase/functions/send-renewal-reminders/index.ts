import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExpiringListing {
  id: string;
  user_id: string;
  listing_type: string | null;
  location: string;
  full_address: string | null;
  neighborhood: string;
  price: number | null;
  contact_phone: string;
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

function formatListingIdentifier(listing: ExpiringListing): string {
  let priceStr: string;
  if (!listing.price) {
    priceStr = 'Call for price';
  } else if (listing.listing_type === 'sale') {
    if (listing.price >= 1000000) {
      priceStr = `$${(listing.price / 1000000).toFixed(1)}M`;
    } else {
      priceStr = `$${Math.round(listing.price / 1000)}K`;
    }
  } else {
    priceStr = `$${listing.price.toLocaleString()}`;
  }

  let locationStr: string;
  if (listing.listing_type === 'sale' && listing.full_address) {
    locationStr = listing.full_address;
  } else {
    locationStr = listing.location || listing.neighborhood || 'your listing';
  }

  return `${locationStr} for ${priceStr}`;
}

function formatPhoneForSMS(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");

  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }

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

    const nyDayOfWeek = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long'
    });

    if (nyDayOfWeek === 'Friday' || nyDayOfWeek === 'Saturday') {
      console.log(`Skipping SMS renewals - today is ${nyDayOfWeek} (Shabbat observance)`);
      return new Response(
        JSON.stringify({
          success: true,
          message: `SMS renewals skipped for Shabbat observance`,
          day: nyDayOfWeek,
          timestamp: new Date().toISOString()
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Day check passed - ${nyDayOfWeek} is a valid SMS day`);

    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
    const targetDateStart = new Date(fiveDaysFromNow);
    targetDateStart.setHours(0, 0, 0, 0);
    const targetDateEnd = new Date(fiveDaysFromNow);
    targetDateEnd.setHours(23, 59, 59, 999);

    console.log(`Looking for listings expiring between ${targetDateStart.toISOString()} and ${targetDateEnd.toISOString()}`);

    const { data: expiringListings, error: queryError } = await supabaseAdmin
      .from("listings")
      .select("id, user_id, listing_type, location, full_address, neighborhood, price, contact_phone")
      .eq("is_active", true)
      .eq("approved", true)
      .not("contact_phone", "is", null)
      .gte("expires_at", targetDateStart.toISOString())
      .lte("expires_at", targetDateEnd.toISOString());

    if (queryError) {
      console.error("Error querying expiring listings:", queryError);
      return new Response(
        JSON.stringify({ error: "Failed to query listings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${expiringListings?.length || 0} listings expiring in 5 days`);

    if (!expiringListings || expiringListings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No expiring listings found", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const listingsByPhone = new Map<string, ExpiringListing[]>();
    for (const listing of expiringListings as ExpiringListing[]) {
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

    for (const [phoneNumber, listings] of listingsByPhone) {
      const isBatch = listings.length > 1;
      const batchId = isBatch ? crypto.randomUUID() : null;
      const listingsToProcess = listings.slice(0, MAX_BATCH_SIZE);
      const totalInBatch = isBatch ? Math.min(listings.length, MAX_BATCH_SIZE) : null;
      const timeoutHours = isBatch ? BATCH_TIMEOUT_HOURS : SINGLE_LISTING_TIMEOUT_HOURS;
      const expiresAt = new Date(Date.now() + timeoutHours * 60 * 60 * 1000);

      for (let i = 0; i < listingsToProcess.length; i++) {
        const listing = listingsToProcess[i];
        const listingIndex = isBatch ? i + 1 : null;
        const isFirstInBatch = i === 0;

        const { data: existingConv } = await supabaseAdmin
          .from("listing_renewal_conversations")
          .select("id")
          .eq("listing_id", listing.id)
          .gte("created_at", todayStart.toISOString())
          .maybeSingle();

        if (existingConv) {
          console.log(`Skipping listing ${listing.id} - conversation already exists today`);
          skippedDuplicates++;
          continue;
        }

        const identifier = formatListingIdentifier(listing);
        const listingTypeWord = listing.listing_type === 'sale' ? 'sold' : 'rented';

        let smsMessage: string;
        let initialState: string;

        if (!isBatch) {
          smsMessage = `Hadirot Alert: Your listing at ${identifier} expires in 5 days. Is the listing still available? Reply YES or NO.`;
          initialState = 'awaiting_availability';
        } else if (isFirstInBatch) {
          if (listings.length > MAX_BATCH_SIZE) {
            smsMessage = `Hadirot Alert: You have ${listings.length}+ listings expiring in 5 days. Let's go through the first ${MAX_BATCH_SIZE}. Is the one at ${identifier} still available? Reply YES or NO.`;
          } else {
            smsMessage = `Hadirot Alert: You have ${listings.length} listings expiring in 5 days. Is the one at ${identifier} still available? Reply YES or NO.`;
          }
          initialState = 'awaiting_availability';
        } else {
          initialState = 'pending';
          smsMessage = '';
        }

        if (isFirstInBatch || !isBatch) {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
          const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

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
              }),
            });

            const twilioData: TwilioResponse = await twilioResponse.json();

            if (!twilioResponse.ok) {
              console.error(`Twilio error for listing ${listing.id}:`, twilioData);
              await supabaseAdmin
                .from("listing_renewal_conversations")
                .insert({
                  listing_id: listing.id,
                  user_id: listing.user_id,
                  phone_number: phoneNumber,
                  batch_id: batchId,
                  listing_index: listingIndex,
                  total_in_batch: totalInBatch,
                  expires_at: expiresAt.toISOString(),
                  state: 'error',
                  action_taken: 'sms_failed',
                });
              smsErrors++;
              continue;
            }

            messageSid = twilioData.sid;
            smsSent++;
            console.log(`SMS sent to ${phoneNumber} for listing ${listing.id}: ${messageSid}`);

            try {
              await supabaseAdmin.from("sms_messages").insert({
                direction: "outbound",
                phone_number: phoneNumber,
                message_body: smsMessage,
                message_sid: messageSid,
                message_source: "renewal_reminder",
                listing_id: listing.id,
                status: "sent",
              });
            } catch (logErr) {
              console.error("Error logging SMS:", logErr);
            }

          } catch (error) {
            console.error(`Network error sending SMS for listing ${listing.id}:`, error);
            await supabaseAdmin
              .from("listing_renewal_conversations")
              .insert({
                listing_id: listing.id,
                user_id: listing.user_id,
                phone_number: phoneNumber,
                batch_id: batchId,
                listing_index: listingIndex,
                total_in_batch: totalInBatch,
                expires_at: expiresAt.toISOString(),
                state: 'error',
                action_taken: 'sms_failed',
              });
            smsErrors++;
            continue;
          }

          const { error: insertError } = await supabaseAdmin
            .from("listing_renewal_conversations")
            .insert({
              listing_id: listing.id,
              user_id: listing.user_id,
              phone_number: phoneNumber,
              batch_id: batchId,
              listing_index: listingIndex,
              total_in_batch: totalInBatch,
              message_sent_at: new Date().toISOString(),
              message_sid: messageSid,
              expires_at: expiresAt.toISOString(),
              state: initialState,
            });

          if (insertError) {
            console.error(`Error creating conversation for listing ${listing.id}:`, insertError);
          }
        } else {
          const { error: insertError } = await supabaseAdmin
            .from("listing_renewal_conversations")
            .insert({
              listing_id: listing.id,
              user_id: listing.user_id,
              phone_number: phoneNumber,
              batch_id: batchId,
              listing_index: listingIndex,
              total_in_batch: totalInBatch,
              expires_at: expiresAt.toISOString(),
              state: initialState,
            });

          if (insertError) {
            console.error(`Error creating pending conversation for listing ${listing.id}:`, insertError);
          }
        }
      }
    }

    const summary = {
      totalExpiring: expiringListings.length,
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