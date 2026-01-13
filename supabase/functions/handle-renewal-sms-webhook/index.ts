import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RenewalConversation {
  id: string;
  listing_id: string;
  user_id: string;
  phone_number: string;
  batch_id: string | null;
  listing_index: number | null;
  total_in_batch: number | null;
  expires_at: string;
  state: string;
}

interface Listing {
  id: string;
  listing_type: string | null;
  location: string;
  full_address: string | null;
  neighborhood: string;
  price: number | null;
}

const SMS_RENEWAL_DAYS = 14;

function formatListingIdentifier(listing: Listing): string {
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
  } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }
  return phone;
}

function normalizeReply(text: string): 'yes' | 'no' | 'help' | 'unknown' {
  const normalized = text.toLowerCase().trim();
  if (['yes', 'y', 'yeah', 'yup', 'yep', 'sure', 'ok', 'okay'].includes(normalized)) {
    return 'yes';
  }
  if (['no', 'n', 'nope', 'nah'].includes(normalized)) {
    return 'no';
  }
  if (normalized.includes('what') || normalized.includes('other') || normalized.includes('list') || normalized.includes('show') || normalized.includes('help') || normalized.includes('?')) {
    return 'help';
  }
  return 'unknown';
}

function formatExpirationDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const emptyTwiML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

  try {
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber || !supabaseUrl || !supabaseServiceKey) {
      console.error("Missing configuration");
      return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
    }

    const formData = await req.formData();
    const from = formData.get("From")?.toString() || "";
    const body = formData.get("Body")?.toString() || "";
    const messageSid = formData.get("MessageSid")?.toString() || "";

    console.log(`Received SMS from ${from}: ${body} (SID: ${messageSid})`);

    if (!from || !body) {
      console.error("Missing From or Body in webhook");
      return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const normalizedPhone = formatPhoneForSMS(from);

    const { data: conversation, error: convError } = await supabaseAdmin
      .from("listing_renewal_conversations")
      .select("*")
      .eq("phone_number", normalizedPhone)
      .in("state", ["awaiting_availability", "awaiting_hadirot_question"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (convError) {
      console.error("Error querying conversation:", convError);
      return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
    }

    if (!conversation) {
      console.log(`No active conversation found for ${normalizedPhone}`);
      return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
    }

    const conv = conversation as RenewalConversation;

    async function sendSMS(message: string): Promise<void> {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
      try {
        const response = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${twilioAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: normalizedPhone,
            From: twilioPhoneNumber!,
            Body: message,
          }),
        });
        if (!response.ok) {
          const errData = await response.json();
          console.error("Failed to send SMS:", errData);
        }
      } catch (error) {
        console.error("Error sending SMS:", error);
      }
    }

    if (new Date(conv.expires_at) < new Date()) {
      console.log(`Conversation ${conv.id} has expired`);
      await supabaseAdmin
        .from("listing_renewal_conversations")
        .update({
          state: "expired_link",
          action_taken: "expired_link",
          reply_received_at: new Date().toISOString(),
          reply_text: body,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conv.id);

      await sendSMS("This renewal link has expired. Please log into your Hadirot dashboard at hadirot.com/dashboard to manage your listings.");
      return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
    }

    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id, listing_type, location, full_address, neighborhood, price")
      .eq("id", conv.listing_id)
      .maybeSingle();

    if (listingError || !listing) {
      console.error("Error fetching listing:", listingError);
      return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
    }

    const listingTypeWord = listing.listing_type === 'sale' ? 'buyer' : 'tenant';
    const rentedSoldWord = listing.listing_type === 'sale' ? 'sold' : 'rented';
    const reply = normalizeReply(body);

    async function advanceToNextInBatch(): Promise<void> {
      if (!conv.batch_id || !conv.listing_index) return;

      const { data: nextConv, error: nextError } = await supabaseAdmin
        .from("listing_renewal_conversations")
        .select("*, listings:listing_id(id, listing_type, location, full_address, neighborhood, price)")
        .eq("batch_id", conv.batch_id)
        .eq("state", "pending")
        .gt("listing_index", conv.listing_index)
        .order("listing_index", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextError) {
        console.error("Error finding next in batch:", nextError);
        return;
      }

      if (nextConv && nextConv.listings) {
        const nextListing = nextConv.listings as unknown as Listing;
        const identifier = formatListingIdentifier(nextListing);
        const nextRentedSold = nextListing.listing_type === 'sale' ? 'sold' : 'rented';

        await supabaseAdmin
          .from("listing_renewal_conversations")
          .update({
            state: "awaiting_availability",
            message_sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", nextConv.id);

        const remaining = (conv.total_in_batch || 0) - (nextConv.listing_index || 0) + 1;
        await sendSMS(`Next (${remaining} remaining): Is the one at ${identifier} still available? Reply YES or NO if ${nextRentedSold}.`);
      }
    }

    if (conv.state === "awaiting_availability") {
      if (reply === 'yes') {
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + SMS_RENEWAL_DAYS);

        const { error: updateListingError } = await supabaseAdmin
          .from("listings")
          .update({
            is_active: true,
            last_published_at: new Date().toISOString(),
            expires_at: newExpiresAt.toISOString(),
            deactivated_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conv.listing_id);

        if (updateListingError) {
          console.error("Error extending listing:", updateListingError);
          await sendSMS("Sorry, there was an error extending your listing. Please try again via hadirot.com/dashboard.");
          return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
        }

        await supabaseAdmin
          .from("listing_renewal_conversations")
          .update({
            state: "completed",
            action_taken: "extended",
            reply_received_at: new Date().toISOString(),
            reply_text: body,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conv.id);

        await sendSMS(`Extended ${SMS_RENEWAL_DAYS} days. New expiration: ${formatExpirationDate(newExpiresAt)}.`);
        await advanceToNextInBatch();

      } else if (reply === 'no') {
        await supabaseAdmin
          .from("listings")
          .update({
            is_active: false,
            deactivated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conv.listing_id);

        await supabaseAdmin
          .from("listing_renewal_conversations")
          .update({
            state: "awaiting_hadirot_question",
            reply_received_at: new Date().toISOString(),
            reply_text: body,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conv.id);

        await sendSMS(`Listing deactivated. Did the ${listingTypeWord} find you through Hadirot? Reply YES or NO.`);

      } else if (reply === 'help') {
        if (conv.batch_id) {
          const { data: batchListings } = await supabaseAdmin
            .from("listing_renewal_conversations")
            .select("listing_index, listings:listing_id(location, price)")
            .eq("batch_id", conv.batch_id)
            .in("state", ["pending", "awaiting_availability"])
            .order("listing_index", { ascending: true });

          if (batchListings && batchListings.length > 0) {
            const summaryLines = batchListings.map((c: any, i: number) => {
              const l = c.listings;
              const price = l?.price ? `$${l.price.toLocaleString()}` : 'N/A';
              return `${i + 1}. ${l?.location || 'Unknown'} (${price})`;
            });
            await sendSMS(`Your expiring listings:\n${summaryLines.join('\n')}\n\nCurrently asking about listing ${conv.listing_index}. Reply YES or NO.`);
          }
        } else {
          const identifier = formatListingIdentifier(listing as unknown as Listing);
          await sendSMS(`Your listing at ${identifier} expires in 5 days. Reply YES to extend or NO if ${rentedSoldWord}.`);
        }

      } else {
        await sendSMS(`Please reply YES if available or NO if ${rentedSoldWord}.`);
      }

    } else if (conv.state === "awaiting_hadirot_question") {
      if (reply === 'yes' || reply === 'no') {
        const hadiroConversion = reply === 'yes';

        await supabaseAdmin
          .from("listings")
          .update({ hadirot_conversion: hadiroConversion })
          .eq("id", conv.listing_id);

        await supabaseAdmin
          .from("listing_renewal_conversations")
          .update({
            state: "completed",
            action_taken: "deactivated",
            hadirot_conversion: hadiroConversion,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conv.id);

        await sendSMS("Thank you! Your feedback helps us improve Hadirot.");
        await advanceToNextInBatch();

      } else {
        await sendSMS("Please reply YES if they found you via Hadirot, or NO.");
      }
    }

    return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });

  } catch (error) {
    console.error("Unexpected error in handle-renewal-sms-webhook:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "text/xml" } }
    );
  }
});