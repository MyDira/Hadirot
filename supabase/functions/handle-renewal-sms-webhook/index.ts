import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ListingMetadata {
  id: string;
  index: number;
  user_id: string;
  listing_type: string;
  location: string;
  neighborhood: string;
  price: number | null;
  bedrooms: number;
}

interface ConversationMetadata {
  listings?: ListingMetadata[];
  reporter_name?: string;
  reporter_email?: string;
  report_type?: string;
}

interface RenewalConversation {
  id: string;
  listing_id: string | null;
  user_id: string;
  phone_number: string;
  batch_id: string | null;
  listing_index: number | null;
  total_in_batch: number | null;
  expires_at: string;
  state: string;
  metadata: ConversationMetadata | null;
}

interface Listing {
  id: string;
  listing_type: string | null;
  location: string;
  full_address: string | null;
  neighborhood: string;
  price: number | null;
  expires_at: string | null;
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
  }

  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }

  return `+1${cleaned}`;
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

function normalizeDeactivationReply(text: string): 'rented' | 'sold' | 'unknown' {
  const normalized = text.toLowerCase().trim();

  const rentedKeywords = ['rented', 'rent', 'tenant', 'tenants', 'leased',
                          'no longer available', 'unavailable', 'taken'];
  const soldKeywords = ['sold', 'sale', 'buyer', 'buyers', 'closed',
                        'closing', 'in contract', 'pending', 'under contract'];

  if (rentedKeywords.some(keyword => normalized.includes(keyword))) {
    return 'rented';
  }

  if (soldKeywords.some(keyword => normalized.includes(keyword))) {
    return 'sold';
  }

  return 'unknown';
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
      .in("state", ["awaiting_availability", "awaiting_hadirot_question", "awaiting_listing_selection", "awaiting_report_response"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (convError) {
      console.error("Error querying conversation:", convError);
      return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
    }

    async function sendSMS(toPhone: string, message: string): Promise<void> {
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
            To: toPhone,
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

    if (!conversation) {
      console.log(`No active conversation found for ${normalizedPhone}`);

      const deactivationType = normalizeDeactivationReply(body);

      if (deactivationType !== 'unknown') {
        console.log(`Detected unsolicited deactivation reply: ${deactivationType}`);

        const { data: activeListings, error: listingsError } = await supabaseAdmin
          .from("listings")
          .select("id, user_id, listing_type, location, neighborhood, price, bedrooms, last_published_at")
          .eq("contact_phone", normalizedPhone)
          .eq("is_active", true)
          .eq("approved", true)
          .order("last_published_at", { ascending: false });

        if (listingsError) {
          console.error("Error querying listings:", listingsError);
          return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
        }

        if (!activeListings || activeListings.length === 0) {
          console.log(`No active listings found for ${normalizedPhone}`);
          await sendSMS(normalizedPhone, "Hadirot Alert: We couldn't find an active listing for this number. Please log into hadirot.com/dashboard to manage your listings.");
          return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
        }

        if (activeListings.length === 1) {
          const singleListing = activeListings[0];
          console.log(`Single listing found: ${singleListing.id}, deactivating...`);

          const { error: updateError } = await supabaseAdmin
            .from("listings")
            .update({
              is_active: false,
              deactivated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", singleListing.id);

          if (updateError) {
            console.error("Error deactivating listing:", updateError);
            await sendSMS(normalizedPhone, "Hadirot Alert: Sorry, there was an error deactivating your listing. Please try again via hadirot.com/dashboard.");
            return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
          }

          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

          await supabaseAdmin
            .from("listing_renewal_conversations")
            .insert({
              listing_id: singleListing.id,
              user_id: singleListing.user_id,
              phone_number: normalizedPhone,
              batch_id: null,
              listing_index: null,
              total_in_batch: null,
              message_sent_at: new Date().toISOString(),
              message_sid: messageSid,
              expires_at: expiresAt.toISOString(),
              state: 'awaiting_hadirot_question',
              reply_received_at: new Date().toISOString(),
              reply_text: body,
              action_taken: 'deactivated',
              metadata: null,
            });

          const listingTypeWord = singleListing.listing_type === 'sale' ? 'buyer' : 'tenant';
          await sendSMS(normalizedPhone, `Hadirot Alert: Listing deactivated. Did the ${listingTypeWord} find you through Hadirot? Reply YES or NO.`);

          return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
        }

        if (activeListings.length >= 2 && activeListings.length <= 3) {
          console.log(`Found ${activeListings.length} listings, requesting selection...`);

          const listingOptions = activeListings.map((l, index) => {
            const bedroomText = l.bedrooms === 0 ? 'Studio' : `${l.bedrooms} bd`;
            const locationStr = l.neighborhood || l.location;
            const priceText = l.price ? `$${l.price.toLocaleString()}` : 'Call';
            return `${index + 1}. ${bedroomText} at ${locationStr} (${priceText})`;
          });

          let selectionMessage = `Hadirot Alert: You have ${activeListings.length} active listings. Which one is no longer available?\n\n`;
          selectionMessage += listingOptions.join('\n');
          selectionMessage += `\n\nReply with the number (1-${activeListings.length}).`;

          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

          await supabaseAdmin
            .from("listing_renewal_conversations")
            .insert({
              listing_id: null,
              user_id: activeListings[0].user_id,
              phone_number: normalizedPhone,
              batch_id: null,
              listing_index: null,
              total_in_batch: null,
              message_sent_at: new Date().toISOString(),
              message_sid: messageSid,
              expires_at: expiresAt.toISOString(),
              state: 'awaiting_listing_selection',
              reply_received_at: new Date().toISOString(),
              reply_text: body,
              action_taken: null,
              metadata: {
                listings: activeListings.map((l, idx) => ({
                  id: l.id,
                  index: idx + 1,
                  user_id: l.user_id,
                  listing_type: l.listing_type,
                  location: l.location,
                  neighborhood: l.neighborhood,
                  price: l.price,
                  bedrooms: l.bedrooms
                }))
              },
            });

          await sendSMS(normalizedPhone, selectionMessage);
          return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
        }

        console.log(`Found ${activeListings.length} listings, directing to dashboard...`);
        await sendSMS(normalizedPhone, `Hadirot Alert: You have ${activeListings.length} active listings. Please log into hadirot.com/dashboard to deactivate the unavailable one.`);
        return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
      }

      console.log(`No action taken for unsolicited reply from ${normalizedPhone}`);
      return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
    }

    const conv = conversation as RenewalConversation;

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

      await sendSMS(normalizedPhone, "Hadirot Alert: This renewal link has expired. Please log into your Hadirot dashboard at hadirot.com/dashboard to manage your listings.");
      return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
    }

    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id, listing_type, location, full_address, neighborhood, price, expires_at")
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
        await sendSMS(normalizedPhone, `Hadirot Alert: Next (${remaining} remaining): Is the listing at ${identifier} still available? Reply YES or NO.`);
      }
    }

    if (conv.state === "awaiting_availability") {
      if (reply === 'yes') {
        const currentExpiresAt = listing.expires_at ? new Date(listing.expires_at) : new Date();
        const newExpiresAt = new Date(currentExpiresAt);
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
          await sendSMS(normalizedPhone, "Hadirot Alert: Sorry, there was an error extending your listing. Please try again via hadirot.com/dashboard.");
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

        await sendSMS(normalizedPhone, `Hadirot Alert: OK, we have extended your listing for another 2 weeks. It will expire on ${formatExpirationDate(newExpiresAt)}`);
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

        await sendSMS(normalizedPhone, `Hadirot Alert: Listing deactivated. Did the ${listingTypeWord} find you through Hadirot? Reply YES or NO.`);

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
            await sendSMS(normalizedPhone, `Hadirot Alert: Your expiring listings:\n${summaryLines.join('\n')}\n\nCurrently asking about listing ${conv.listing_index}. Reply YES or NO.`);
          }
        } else {
          const identifier = formatListingIdentifier(listing as unknown as Listing);
          await sendSMS(normalizedPhone, `Hadirot Alert: Your listing at ${identifier} expires in 5 days. Is the listing still available? Reply YES or NO.`);
        }

      } else {
        await sendSMS(normalizedPhone, `Hadirot Alert: Please reply YES if available or NO if not.`);
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

        await sendSMS(normalizedPhone, "Hadirot Alert: Thank you! Your feedback helps us improve Hadirot.");
        await advanceToNextInBatch();

      } else {
        await sendSMS(normalizedPhone, "Hadirot Alert: Please reply YES if they found you via Hadirot, or NO.");
      }

    } else if (conv.state === "awaiting_listing_selection") {
      const selectionNumber = parseInt(body.trim(), 10);

      if (!conv.metadata || !conv.metadata.listings || !Array.isArray(conv.metadata.listings)) {
        console.error("Invalid metadata for listing selection");
        await sendSMS(normalizedPhone, "Hadirot Alert: Sorry, there was an error. Please text RENTED again to restart.");
        return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
      }

      const availableListings = conv.metadata.listings;

      if (isNaN(selectionNumber) || selectionNumber < 1 || selectionNumber > availableListings.length) {
        await sendSMS(normalizedPhone, `Hadirot Alert: Please reply with a number from 1 to ${availableListings.length}.`);
        return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
      }

      const selectedListing = availableListings[selectionNumber - 1];
      console.log(`User selected listing ${selectionNumber}: ${selectedListing.id}`);

      const { error: updateError } = await supabaseAdmin
        .from("listings")
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedListing.id);

      if (updateError) {
        console.error("Error deactivating selected listing:", updateError);
        await sendSMS(normalizedPhone, "Hadirot Alert: Sorry, there was an error deactivating your listing. Please try again via hadirot.com/dashboard.");
        return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
      }

      await supabaseAdmin
        .from("listing_renewal_conversations")
        .update({
          listing_id: selectedListing.id,
          state: "awaiting_hadirot_question",
          action_taken: "deactivated",
          updated_at: new Date().toISOString(),
        })
        .eq("id", conv.id);

      const selectedListingTypeWord = selectedListing.listing_type === 'sale' ? 'buyer' : 'tenant';
      await sendSMS(normalizedPhone, `Hadirot Alert: Listing deactivated. Did the ${selectedListingTypeWord} find you through Hadirot? Reply YES or NO.`);

    } else if (conv.state === "awaiting_report_response") {
      const reply = normalizeReply(body);

      const { data: reportListing, error: reportListingError } = await supabaseAdmin
        .from("listings")
        .select("id, listing_type")
        .eq("id", conv.listing_id)
        .maybeSingle();

      if (reportListingError || !reportListing) {
        console.error("Error fetching listing for report response:", reportListingError);
        await sendSMS(normalizedPhone, "Hadirot Alert: Sorry, there was an error. Please log into hadirot.com/dashboard to manage your listing.");
        return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
      }

      if (reply === 'yes') {
        await supabaseAdmin
          .from("listing_renewal_conversations")
          .update({
            state: "completed",
            action_taken: "kept_active",
            reply_received_at: new Date().toISOString(),
            reply_text: body,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conv.id);

        await sendSMS(normalizedPhone, "Hadirot Alert: OK, we've kept your listing active. Thank you for confirming!");

      } else if (reply === 'no') {
        const { error: updateError } = await supabaseAdmin
          .from("listings")
          .update({
            is_active: false,
            deactivated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conv.listing_id);

        if (updateError) {
          console.error("Error deactivating listing:", updateError);
          await sendSMS(normalizedPhone, "Hadirot Alert: Sorry, there was an error deactivating your listing. Please try again via hadirot.com/dashboard.");
          return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
        }

        await supabaseAdmin
          .from("listing_renewal_conversations")
          .update({
            state: "awaiting_hadirot_question",
            action_taken: "deactivated",
            reply_received_at: new Date().toISOString(),
            reply_text: body,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conv.id);

        const reportListingTypeWord = reportListing.listing_type === 'sale' ? 'buyer' : 'tenant';
        await sendSMS(normalizedPhone, `Hadirot Alert: Listing deactivated. Did the ${reportListingTypeWord} find you through Hadirot? Reply YES or NO.`);

      } else {
        const rentedSoldWord = reportListing.listing_type === 'sale' ? 'sold' : 'rented';
        await sendSMS(normalizedPhone, `Hadirot Alert: Please reply YES if the listing is still available, or NO if it has been ${rentedSoldWord}.`);
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