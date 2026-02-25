import { createClient } from "npm:@supabase/supabase-js@2";
import { sendViaZepto } from "../_shared/zepto.ts";

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
  inquiry_from?: string;
  inquiry_phone?: string;
}

interface DisambiguationMetadata {
  original_reply: string;
  candidates: Array<{
    conversation_id: string;
    listing_desc: string;
    type: string;
  }>;
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
  conversation_type: string | null;
  metadata: ConversationMetadata | DisambiguationMetadata | null;
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

type MessageIntent = {
  type: 'affirmative' | 'negative' | 'deactivation' | 'help' | 'selection' | 'acknowledgment' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
};

function parseMessageIntent(text: string, conversationState: string | null): MessageIntent {
  const normalized = text.toLowerCase().trim();

  const affirmativeExact = ['yes', 'y', 'yeah', 'yup', 'yep', 'sure', 'ok', 'okay', 'available', 'active', 'keep'];
  const negativeExact = ['no', 'n', 'nope', 'nah'];
  const deactivationKeywords = ['rented', 'rent', 'sold', 'sale', 'taken', 'unavailable',
    'leased', 'tenant', 'tenants', 'buyer', 'buyers', 'closed', 'closing',
    'in contract', 'pending', 'under contract', 'no longer available', 'gone'];
  const acknowledgmentKeywords = ['thanks', 'thank you', 'thank', 'thx', 'ty', 'got it',
    'ok thanks', 'okay thanks', 'noted', 'great', 'perfect', 'awesome', 'cool'];
  const helpKeywords = ['help', 'what', 'other', 'list', 'show', 'options', 'menu', 'commands'];

  const selectionMatch = normalized.match(/^(\d+)$/);
  if (selectionMatch) {
    return { type: 'selection', confidence: 'high' };
  }

  if (conversationState === 'awaiting_availability' || conversationState === 'awaiting_report_response') {
    if (affirmativeExact.includes(normalized)) {
      return { type: 'affirmative', confidence: 'high' };
    }
    if (negativeExact.includes(normalized)) {
      return { type: 'negative', confidence: 'high' };
    }
    if (deactivationKeywords.some(kw => normalized.includes(kw))) {
      return { type: 'negative', confidence: 'high' };
    }
    if (normalized.includes('?') || helpKeywords.some(kw => normalized.includes(kw))) {
      return { type: 'help', confidence: 'medium' };
    }
    return { type: 'unknown', confidence: 'low' };
  }

  if (conversationState === 'awaiting_hadirot_question') {
    if (affirmativeExact.includes(normalized)) {
      return { type: 'affirmative', confidence: 'high' };
    }
    if (negativeExact.includes(normalized)) {
      return { type: 'negative', confidence: 'high' };
    }
    return { type: 'unknown', confidence: 'low' };
  }

  if (conversationState === 'awaiting_listing_selection') {
    if (selectionMatch) {
      return { type: 'selection', confidence: 'high' };
    }
    return { type: 'unknown', confidence: 'low' };
  }

  if (conversationState === 'callback_sent') {
    if (deactivationKeywords.some(kw => normalized.includes(kw))) {
      return { type: 'deactivation', confidence: 'high' };
    }
    if (negativeExact.includes(normalized)) {
      return { type: 'deactivation', confidence: 'medium' };
    }
    if (acknowledgmentKeywords.some(kw => normalized.includes(kw))) {
      return { type: 'acknowledgment', confidence: 'high' };
    }
    return { type: 'acknowledgment', confidence: 'low' };
  }

  if (deactivationKeywords.some(kw => normalized.includes(kw))) {
    return { type: 'deactivation', confidence: 'high' };
  }
  if (acknowledgmentKeywords.some(kw => normalized.includes(kw))) {
    return { type: 'acknowledgment', confidence: 'medium' };
  }
  if (normalized.includes('?') || helpKeywords.some(kw => normalized.includes(kw))) {
    return { type: 'help', confidence: 'medium' };
  }

  return { type: 'unknown', confidence: 'low' };
}

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

function formatExpirationDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ACK_KEYWORDS = ['thanks', 'thank you', 'thank', 'thx', 'ty', 'got it', 'ok thanks',
  'okay thanks', 'noted', 'great', 'perfect', 'awesome', 'cool'];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const emptyTwiML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  let from = "";
  let body = "";

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
    from = formData.get("From")?.toString() || "";
    body = formData.get("Body")?.toString() || "";
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

    async function logMessage(params: {
      conversationId?: string | null;
      direction: 'inbound' | 'outbound';
      phoneNumber: string;
      messageBody: string;
      messageSid?: string | null;
      messageSource: string;
      listingId?: string | null;
    }) {
      try {
        await supabaseAdmin.from("sms_messages").insert({
          conversation_id: params.conversationId || null,
          direction: params.direction,
          phone_number: params.phoneNumber,
          message_body: params.messageBody,
          message_sid: params.messageSid || null,
          message_source: params.messageSource,
          listing_id: params.listingId || null,
          status: params.direction === 'outbound' ? 'sent' : 'received',
        });
      } catch (error) {
        console.error("Error logging message:", error);
      }
    }

    async function sendSMS(
      toPhone: string,
      message: string,
      source: string = 'system_response',
      listingId?: string | null,
      conversationId?: string | null
    ): Promise<void> {
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
        let twilioSid: string | null = null;
        if (!response.ok) {
          const errData = await response.json();
          console.error("Failed to send SMS:", errData);
        } else {
          const data = await response.json();
          twilioSid = data?.sid || null;
        }
        await logMessage({
          conversationId,
          direction: 'outbound',
          phoneNumber: toPhone,
          messageBody: message,
          messageSid: twilioSid,
          messageSource: source,
          listingId: listingId || null,
        });
      } catch (error) {
        console.error("Error sending SMS:", error);
      }
    }

    async function notifyAdmin(subject: string, details: string): Promise<void> {
      try {
        const { data: config } = await supabaseAdmin
          .from("sms_admin_config")
          .select("admin_email, notify_on_errors, notify_on_unrecognized")
          .eq("id", 1)
          .maybeSingle();

        if (!config?.admin_email) {
          console.log("No admin email configured, skipping notification");
          return;
        }

        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1e4a74; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0;">Hadirot SMS Alert</h2>
            </div>
            <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <h3 style="color: #1e4a74; margin-top: 0;">${subject}</h3>
              <pre style="background: #f3f4f6; padding: 12px; border-radius: 4px; white-space: pre-wrap; font-size: 14px;">${details}</pre>
              <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">
                Sent at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
              </p>
            </div>
          </div>
        `;

        await sendViaZepto({
          to: config.admin_email,
          subject: `Hadirot SMS Alert: ${subject}`,
          html: htmlBody,
          fromName: "Hadirot SMS System",
        });
      } catch (error) {
        console.error("Error sending admin notification:", error);
      }
    }

    // ============================================
    // ROUTING HELPER FUNCTIONS
    // ============================================

    async function tryAutoResolve(
      replyBody: string,
      conversations: RenewalConversation[],
    ): Promise<RenewalConversation | null> {
      const normalized = replyBody.toLowerCase().trim();

      if (/^\d+$/.test(normalized)) {
        const selectionConv = conversations.find(c => c.state === 'awaiting_listing_selection');
        if (selectionConv) return selectionConv;
      }

      if (ACK_KEYWORDS.some(kw => normalized.includes(kw))) {
        const newest = conversations[0];
        await supabaseAdmin
          .from("listing_renewal_conversations")
          .update({
            state: "completed",
            action_taken: "acknowledged",
            reply_received_at: new Date().toISOString(),
            reply_text: replyBody,
            updated_at: new Date().toISOString(),
          })
          .eq("id", newest.id);

        console.log(`Auto-resolved acknowledgment to newest conversation ${newest.id}`);
        return null;
      }

      const deactivationKeywords = ['rented', 'rent', 'sold', 'sale', 'taken', 'unavailable',
        'leased', 'closed', 'gone', 'no longer available'];
      if (deactivationKeywords.some(kw => normalized.includes(kw))) {
        const convsWithActiveListings: RenewalConversation[] = [];
        for (const conv of conversations) {
          if (!conv.listing_id) continue;
          const { data: listing } = await supabaseAdmin
            .from("listings")
            .select("id, is_active")
            .eq("id", conv.listing_id)
            .eq("is_active", true)
            .maybeSingle();
          if (listing) {
            convsWithActiveListings.push(conv);
          }
        }

        if (convsWithActiveListings.length === 1) {
          return convsWithActiveListings[0];
        }
      }

      const yesNoStates = ['awaiting_availability', 'awaiting_hadirot_question', 'awaiting_report_response'];
      if (['yes', 'y', 'yeah', 'yup', 'yep', 'sure', 'no', 'n', 'nope', 'nah'].includes(normalized)) {
        const yesNoConvs = conversations.filter(c => yesNoStates.includes(c.state));
        if (yesNoConvs.length === 1) {
          return yesNoConvs[0];
        }
      }

      const nonCallbackConvs = conversations.filter(c => c.state !== 'callback_sent');
      if (nonCallbackConvs.length === 1) {
        return nonCallbackConvs[0];
      }

      return null;
    }

    async function buildListingDesc(
      conv: RenewalConversation,
    ): Promise<string> {
      if (!conv.listing_id) return 'Unknown listing';

      const { data: listing } = await supabaseAdmin
        .from('listings')
        .select('bedrooms, cross_street_a, neighborhood, price, listing_type')
        .eq('id', conv.listing_id)
        .maybeSingle();

      if (!listing) return 'Unknown listing';

      const bed = listing.bedrooms ? `${listing.bedrooms}BR` : '';
      const street = listing.cross_street_a || listing.neighborhood || '';
      const desc = [bed, street].filter(Boolean).join(' on ') || 'Listing';

      const typeLabel: Record<string, string> = {
        'renewal': 'renewal',
        'callback': 'inquiry',
        'report_rented': 'rented report',
        'report': 'rented report',
      };
      const label = typeLabel[conv.conversation_type || 'renewal'] || '';

      return label ? `${desc} (${label})` : desc;
    }

    async function sendDisambiguationPrompt(
      originalBody: string,
      phone: string,
      conversations: RenewalConversation[],
    ): Promise<void> {
      const candidates = conversations.slice(0, 5);

      const candidateDescriptions: Array<{
        conversation_id: string;
        listing_desc: string;
        type: string;
      }> = [];

      for (const conv of candidates) {
        const desc = await buildListingDesc(conv);
        candidateDescriptions.push({
          conversation_id: conv.id,
          listing_desc: desc,
          type: conv.conversation_type || 'renewal',
        });
      }

      let message = "Hadirot Alert: You have messages about multiple listings. Which are you responding to?\n";
      candidateDescriptions.forEach((c, i) => {
        message += `${i + 1}. ${c.listing_desc}\n`;
      });
      message += "Reply with the number.";

      await sendSMS(phone, message);

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await supabaseAdmin
        .from("listing_renewal_conversations")
        .insert({
          phone_number: phone,
          state: "awaiting_disambiguation",
          conversation_type: "disambiguation",
          user_id: candidates[0].user_id,
          message_sent_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          metadata: {
            original_reply: originalBody,
            candidates: candidateDescriptions,
          },
        });

      console.log(`Sent disambiguation prompt to ${phone} with ${candidateDescriptions.length} candidates`);
    }

    // MAINTENANCE NOTE: The state handling logic below mirrors the main state handlers
    // in the conversation routing section. If you modify the behavior for any state
    // (awaiting_availability, awaiting_hadirot_question, awaiting_report_response,
    // callback_sent), you MUST also update the corresponding logic here.
    async function handleDisambiguationReply(
      disambigConv: RenewalConversation,
      replyBody: string,
      phone: string,
      allConversations: RenewalConversation[]
    ): Promise<void> {
      const normalized = replyBody.toLowerCase().trim();
      const metadata = disambigConv.metadata as DisambiguationMetadata | null;

      if (!metadata?.candidates || !metadata?.original_reply) {
        console.error("Disambiguation conversation missing metadata");
        await supabaseAdmin
          .from("listing_renewal_conversations")
          .update({ state: "completed", action_taken: "error", updated_at: new Date().toISOString() })
          .eq("id", disambigConv.id);
        return;
      }

      const candidates = metadata.candidates;

      const num = parseInt(normalized, 10);
      if (!isNaN(num) && num >= 1 && num <= candidates.length) {
        const selected = candidates[num - 1];
        const originalReply = metadata.original_reply;

        console.log(`Disambiguation resolved: agent selected #${num} (conversation ${selected.conversation_id})`);

        await supabaseAdmin
          .from("listing_renewal_conversations")
          .update({
            state: "completed",
            action_taken: "disambiguated",
            reply_received_at: new Date().toISOString(),
            reply_text: replyBody,
            updated_at: new Date().toISOString(),
          })
          .eq("id", disambigConv.id);

        const targetConv = allConversations.find(c => c.id === selected.conversation_id);

        if (!targetConv) {
          console.log(`Target conversation ${selected.conversation_id} no longer active`);
          await sendSMS(phone, "Hadirot Alert: That conversation has expired. Please visit hadirot.com/dashboard to manage your listings.");
          return;
        }

        async function advanceToNextInBatchForConv(conv: RenewalConversation): Promise<void> {
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

            await supabaseAdmin
              .from("listing_renewal_conversations")
              .update({
                state: "awaiting_availability",
                message_sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", nextConv.id);

            const remaining = (conv.total_in_batch || 0) - (nextConv.listing_index || 0) + 1;
            await sendSMS(phone, `Hadirot Alert: Next (${remaining} remaining): Is the listing at ${identifier} still available? Reply YES or NO.`, 'renewal_reminder', nextListing.id, nextConv.id);
          }
        }

        if (targetConv.state === 'awaiting_availability') {
          const intent = parseMessageIntent(originalReply, 'awaiting_availability');

          if (intent.type === 'affirmative') {
            if (targetConv.listing_id) {
              const { data: targetListing } = await supabaseAdmin
                .from("listings")
                .select("expires_at")
                .eq("id", targetConv.listing_id)
                .maybeSingle();

              if (targetListing) {
                const currentExpiry = targetListing.expires_at ? new Date(targetListing.expires_at) : new Date();
                const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
                const newExpiry = new Date(baseDate.getTime() + SMS_RENEWAL_DAYS * 24 * 60 * 60 * 1000);

                await supabaseAdmin
                  .from("listings")
                  .update({
                    is_active: true,
                    last_published_at: new Date().toISOString(),
                    expires_at: newExpiry.toISOString(),
                    deactivated_at: null,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", targetConv.listing_id);
              }
            }

            await supabaseAdmin
              .from("listing_renewal_conversations")
              .update({
                state: "completed",
                action_taken: "extended",
                reply_received_at: new Date().toISOString(),
                reply_text: originalReply,
                updated_at: new Date().toISOString(),
              })
              .eq("id", targetConv.id);

            await sendSMS(phone, `Hadirot Alert: Your listing has been extended for ${SMS_RENEWAL_DAYS} days. Thank you!`);
            await advanceToNextInBatchForConv(targetConv);

          } else if (intent.type === 'negative' || intent.type === 'deactivation') {
            if (targetConv.listing_id) {
              await supabaseAdmin
                .from("listings")
                .update({ is_active: false, deactivated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq("id", targetConv.listing_id);
            }

            await supabaseAdmin
              .from("listing_renewal_conversations")
              .update({
                state: "awaiting_hadirot_question",
                action_taken: "deactivated",
                reply_received_at: new Date().toISOString(),
                reply_text: originalReply,
                updated_at: new Date().toISOString(),
              })
              .eq("id", targetConv.id);

            const { data: listing } = await supabaseAdmin
              .from("listings")
              .select("listing_type")
              .eq("id", targetConv.listing_id)
              .maybeSingle();

            const word = listing?.listing_type === 'sale' ? 'buyer' : 'tenant';
            await sendSMS(phone, `Hadirot Alert: Listing deactivated. Did the ${word} find you through Hadirot? Reply YES or NO.`);
          }

        } else if (targetConv.state === 'awaiting_hadirot_question') {
          const intent = parseMessageIntent(originalReply, 'awaiting_hadirot_question');

          const hadirotConversion = intent.type === 'affirmative' ? true : intent.type === 'negative' ? false : null;

          if (hadirotConversion !== null && targetConv.listing_id) {
            await supabaseAdmin
              .from("listings")
              .update({ hadirot_conversion: hadirotConversion })
              .eq("id", targetConv.listing_id);
          }

          await supabaseAdmin
            .from("listing_renewal_conversations")
            .update({
              state: "completed",
              action_taken: "deactivated",
              hadirot_conversion: hadirotConversion,
              reply_received_at: new Date().toISOString(),
              reply_text: originalReply,
              updated_at: new Date().toISOString(),
            })
            .eq("id", targetConv.id);

          if (hadirotConversion !== null) {
            await sendSMS(phone, "Hadirot Alert: Thank you! Your feedback helps us improve Hadirot.");
            await advanceToNextInBatchForConv(targetConv);
          }

        } else if (targetConv.state === 'awaiting_report_response') {
          const intent = parseMessageIntent(originalReply, 'awaiting_report_response');

          if (intent.type === 'affirmative') {
            await supabaseAdmin
              .from("listing_renewal_conversations")
              .update({
                state: "completed",
                action_taken: "kept_active",
                reply_received_at: new Date().toISOString(),
                reply_text: originalReply,
                updated_at: new Date().toISOString(),
              })
              .eq("id", targetConv.id);

            await sendSMS(phone, "Hadirot Alert: OK, we've kept your listing active. Thank you for confirming!");

          } else if (intent.type === 'negative' || intent.type === 'deactivation') {
            if (targetConv.listing_id) {
              await supabaseAdmin
                .from("listings")
                .update({ is_active: false, deactivated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq("id", targetConv.listing_id);
            }

            await supabaseAdmin
              .from("listing_renewal_conversations")
              .update({
                state: "awaiting_hadirot_question",
                action_taken: "deactivated",
                reply_received_at: new Date().toISOString(),
                reply_text: originalReply,
                updated_at: new Date().toISOString(),
              })
              .eq("id", targetConv.id);

            const { data: listing } = await supabaseAdmin
              .from("listings")
              .select("listing_type")
              .eq("id", targetConv.listing_id)
              .maybeSingle();

            const word = listing?.listing_type === 'sale' ? 'buyer' : 'tenant';
            await sendSMS(phone, `Hadirot Alert: Listing deactivated. Did the ${word} find you through Hadirot? Reply YES or NO.`);
          }

        } else if (targetConv.state === 'callback_sent') {
          const intent = parseMessageIntent(originalReply, 'callback_sent');

          if (intent.type === 'deactivation') {
            if (targetConv.listing_id) {
              await supabaseAdmin
                .from("listings")
                .update({ is_active: false, deactivated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq("id", targetConv.listing_id);
            }

            await supabaseAdmin
              .from("listing_renewal_conversations")
              .update({
                state: "awaiting_hadirot_question",
                action_taken: "deactivated",
                reply_received_at: new Date().toISOString(),
                reply_text: originalReply,
                updated_at: new Date().toISOString(),
              })
              .eq("id", targetConv.id);

            const { data: listing } = await supabaseAdmin
              .from("listings")
              .select("listing_type")
              .eq("id", targetConv.listing_id)
              .maybeSingle();

            const word = listing?.listing_type === 'sale' ? 'buyer' : 'tenant';
            await sendSMS(phone, `Hadirot Alert: Listing deactivated. Did the ${word} find you through Hadirot? Reply YES or NO.`);
          } else {
            await supabaseAdmin
              .from("listing_renewal_conversations")
              .update({
                state: "completed",
                action_taken: "acknowledged",
                reply_received_at: new Date().toISOString(),
                reply_text: originalReply,
                updated_at: new Date().toISOString(),
              })
              .eq("id", targetConv.id);
          }
        }

        return;
      }

      const deactivationKeywords = ['rented', 'rent', 'sold', 'sale', 'taken', 'unavailable', 'leased', 'closed', 'gone'];
      if (deactivationKeywords.some(kw => normalized.includes(kw))) {
        const activeCandidates: typeof candidates = [];
        for (const c of candidates) {
          const conv = allConversations.find(ac => ac.id === c.conversation_id);
          if (conv?.listing_id) {
            const { data: listing } = await supabaseAdmin
              .from("listings")
              .select("id, is_active")
              .eq("id", conv.listing_id)
              .eq("is_active", true)
              .maybeSingle();
            if (listing) activeCandidates.push(c);
          }
        }

        if (activeCandidates.length === 1) {
          await supabaseAdmin
            .from("listing_renewal_conversations")
            .update({
              metadata: { ...metadata, original_reply: replyBody },
              updated_at: new Date().toISOString(),
            })
            .eq("id", disambigConv.id);

          const fakeSelection = String(candidates.indexOf(activeCandidates[0]) + 1);
          await handleDisambiguationReply(
            { ...disambigConv, metadata: { ...metadata, original_reply: replyBody } },
            fakeSelection, phone, allConversations
          );
          return;
        }
      }

      if (normalized === 'help' || normalized === '?' || normalized === 'what') {
        let message = "Hadirot Alert: Please reply with the number of the listing you're responding about:\n";
        candidates.forEach((c, i) => {
          message += `${i + 1}. ${c.listing_desc}\n`;
        });
        message += "Reply with the number.";
        await sendSMS(phone, message);
        return;
      }

      await sendSMS(phone, `Hadirot Alert: Please reply with a number (1-${candidates.length}) to select which listing you're responding about.`);
    }

    // ============================================
    // LOG INBOUND MESSAGE
    // ============================================

    await logMessage({
      direction: 'inbound',
      phoneNumber: normalizedPhone,
      messageBody: body,
      messageSid: messageSid,
      messageSource: 'webhook_reply',
    });

    // ============================================
    // QUERY ALL ACTIVE CONVERSATIONS FOR THIS PHONE
    // ============================================

    const { data: activeConversations, error: convError } = await supabaseAdmin
      .from("listing_renewal_conversations")
      .select("*")
      .eq("phone_number", normalizedPhone)
      .in("state", ["awaiting_availability", "awaiting_hadirot_question",
        "awaiting_listing_selection", "awaiting_report_response", "callback_sent",
        "awaiting_disambiguation"])
      .order("updated_at", { ascending: false });

    if (convError) {
      console.error("Error querying conversations:", convError);
      return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
    }

    // ============================================
    // ROUTING LAYER — determine which conversation gets this reply
    // ============================================

    let conversation: RenewalConversation | null = null;

    const disambigConv = (activeConversations as RenewalConversation[] | null)?.find(c => c.state === 'awaiting_disambiguation');
    if (disambigConv) {
      await handleDisambiguationReply(disambigConv, body, normalizedPhone, (activeConversations || []) as RenewalConversation[]);
      return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
    }

    if (activeConversations?.length === 1) {
      conversation = activeConversations[0] as RenewalConversation;

    } else if (activeConversations && activeConversations.length > 1) {
      console.log(`Multiple active conversations (${activeConversations.length}) for ${normalizedPhone}`);

      const resolved = await tryAutoResolve(body, activeConversations as RenewalConversation[]);

      if (resolved) {
        conversation = resolved;
        console.log(`Auto-resolved to conversation ${conversation.id} (state: ${conversation.state})`);
      } else {
        const isAck = ACK_KEYWORDS.some(kw => body.toLowerCase().trim().includes(kw));

        if (!isAck) {
          await sendDisambiguationPrompt(body, normalizedPhone, activeConversations as RenewalConversation[]);
        }
        return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
      }
    }

    // ============================================
    // UNSOLICITED FLOW — no active conversations
    // ============================================

    if (!conversation && (!activeConversations || activeConversations.length === 0)) {
      console.log(`No active conversation found for ${normalizedPhone}`);

      const intent = parseMessageIntent(body, null);

      if (intent.type === 'deactivation') {
        console.log(`Detected unsolicited deactivation reply`);

        const { data: activeListings, error: listingsError } = await supabaseAdmin
          .from("listings")
          .select("id, user_id, listing_type, location, neighborhood, price, bedrooms, last_published_at")
          .eq("contact_phone_e164", normalizedPhone)
          .eq("is_active", true)
          .eq("approved", true)
          .order("last_published_at", { ascending: false });

        if (listingsError) {
          console.error("Error querying listings:", listingsError);
          return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
        }

        if (!activeListings || activeListings.length === 0) {
          console.log(`No active listings found for ${normalizedPhone}`);
          await sendSMS(normalizedPhone, "Hadirot Alert: We couldn't find an active listing for this number. Please log into hadirot.com/dashboard to manage your listings.", 'system_response');
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
            await sendSMS(normalizedPhone, "Hadirot Alert: Sorry, there was an error deactivating your listing. Please try again via hadirot.com/dashboard.", 'system_response', singleListing.id);
            return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
          }

          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

          const { data: newConv } = await supabaseAdmin
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
            })
            .select("id")
            .maybeSingle();

          const listingTypeWord = singleListing.listing_type === 'sale' ? 'buyer' : 'tenant';
          await sendSMS(normalizedPhone, `Hadirot Alert: Listing deactivated. Did the ${listingTypeWord} find you through Hadirot? Reply YES or NO.`, 'system_response', singleListing.id, newConv?.id);

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

          const { data: newConv } = await supabaseAdmin
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
            })
            .select("id")
            .maybeSingle();

          await sendSMS(normalizedPhone, selectionMessage, 'system_response', null, newConv?.id);
          return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
        }

        console.log(`Found ${activeListings.length} listings, directing to dashboard...`);
        await sendSMS(normalizedPhone, `Hadirot Alert: You have ${activeListings.length} active listings. Please log into hadirot.com/dashboard to deactivate the unavailable one.`, 'system_response');
        return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
      }

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentFallback } = await supabaseAdmin
        .from("sms_messages")
        .select("id")
        .eq("phone_number", normalizedPhone)
        .eq("message_source", "fallback_response")
        .gte("created_at", twentyFourHoursAgo)
        .limit(1)
        .maybeSingle();

      if (!recentFallback) {
        const { data: anyListings } = await supabaseAdmin
          .from("listings")
          .select("id")
          .eq("contact_phone_e164", normalizedPhone)
          .limit(1)
          .maybeSingle();

        if (anyListings) {
          await sendSMS(normalizedPhone,
            "Hadirot Alert: Got your message. Text RENTED to mark a listing as taken, or visit hadirot.com/dashboard for full options.",
            'fallback_response');
        } else {
          await sendSMS(normalizedPhone,
            "Hadirot Alert: This number isn't linked to any Hadirot listings. Visit hadirot.com to get started.",
            'fallback_response');

          await notifyAdmin(
            "Unrecognized phone number",
            `Received SMS from ${normalizedPhone} which has no associated listings.\nMessage: "${body}"`
          );
        }
      } else {
        console.log(`Skipping fallback - already sent one in last 24h to ${normalizedPhone}`);
      }

      return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
    }

    // ============================================
    // SINGLE CONVERSATION RESOLVED — existing state handlers
    // ============================================

    if (conversation) {
      const conv = conversation;

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

        await sendSMS(normalizedPhone, "Hadirot Alert: This renewal link has expired. Please log into your Hadirot dashboard at hadirot.com/dashboard to manage your listings.", 'system_response', conv.listing_id, conv.id);
        return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
      }

      const { data: listing, error: listingError } = conv.listing_id
        ? await supabaseAdmin
            .from("listings")
            .select("id, listing_type, location, full_address, neighborhood, price, expires_at")
            .eq("id", conv.listing_id)
            .maybeSingle()
        : { data: null, error: null };

      if (listingError) {
        console.error("Error fetching listing:", listingError);
        return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
      }

      const listingTypeWord = listing?.listing_type === 'sale' ? 'buyer' : 'tenant';
      const intent = parseMessageIntent(body, conv.state);

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

          await supabaseAdmin
            .from("listing_renewal_conversations")
            .update({
              state: "awaiting_availability",
              message_sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", nextConv.id);

          const remaining = (conv.total_in_batch || 0) - (nextConv.listing_index || 0) + 1;
          await sendSMS(normalizedPhone, `Hadirot Alert: Next (${remaining} remaining): Is the listing at ${identifier} still available? Reply YES or NO.`, 'renewal_reminder', nextListing.id, nextConv.id);
        }
      }

      if (conv.state === "awaiting_availability") {
        if (!listing) {
          console.error("No listing found for awaiting_availability conversation");
          return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
        }

        if (intent.type === 'affirmative') {
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
            await sendSMS(normalizedPhone, "Hadirot Alert: Sorry, there was an error extending your listing. Please try again via hadirot.com/dashboard.", 'system_response', conv.listing_id, conv.id);
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

          await sendSMS(normalizedPhone, `Hadirot Alert: OK, we have extended your listing for another 2 weeks. It will expire on ${formatExpirationDate(newExpiresAt)}`, 'system_response', conv.listing_id, conv.id);
          await advanceToNextInBatch();

        } else if (intent.type === 'negative') {
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

          await sendSMS(normalizedPhone, `Hadirot Alert: Listing deactivated. Did the ${listingTypeWord} find you through Hadirot? Reply YES or NO.`, 'system_response', conv.listing_id, conv.id);

        } else if (intent.type === 'help') {
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
              await sendSMS(normalizedPhone, `Hadirot Alert: Your expiring listings:\n${summaryLines.join('\n')}\n\nCurrently asking about listing ${conv.listing_index}. Reply YES or NO.`, 'system_response', conv.listing_id, conv.id);
            }
          } else {
            const identifier = formatListingIdentifier(listing as unknown as Listing);
            await sendSMS(normalizedPhone, `Hadirot Alert: Your listing at ${identifier} expires in 5 days. Is the listing still available? Reply YES or NO.`, 'system_response', conv.listing_id, conv.id);
          }

        } else {
          await sendSMS(normalizedPhone, `Hadirot Alert: Please reply YES if available or NO if not.`, 'system_response', conv.listing_id, conv.id);
        }

      } else if (conv.state === "awaiting_hadirot_question") {
        if (intent.type === 'affirmative' || intent.type === 'negative') {
          const hadiroConversion = intent.type === 'affirmative';

          if (conv.listing_id) {
            await supabaseAdmin
              .from("listings")
              .update({ hadirot_conversion: hadiroConversion })
              .eq("id", conv.listing_id);
          }

          await supabaseAdmin
            .from("listing_renewal_conversations")
            .update({
              state: "completed",
              action_taken: "deactivated",
              hadirot_conversion: hadiroConversion,
              updated_at: new Date().toISOString(),
            })
            .eq("id", conv.id);

          await sendSMS(normalizedPhone, "Hadirot Alert: Thank you! Your feedback helps us improve Hadirot.", 'system_response', conv.listing_id, conv.id);
          await advanceToNextInBatch();

        } else {
          await sendSMS(normalizedPhone, "Hadirot Alert: Please reply YES if they found you via Hadirot, or NO.", 'system_response', conv.listing_id, conv.id);
        }

      } else if (conv.state === "awaiting_listing_selection") {
        const selectionNumber = parseInt(body.trim(), 10);

        if (!conv.metadata || !('listings' in conv.metadata) || !conv.metadata.listings || !Array.isArray(conv.metadata.listings)) {
          console.error("Invalid metadata for listing selection");
          await sendSMS(normalizedPhone, "Hadirot Alert: Sorry, there was an error. Please text RENTED again to restart.", 'system_response', null, conv.id);
          return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
        }

        const availableListings = conv.metadata.listings;

        if (isNaN(selectionNumber) || selectionNumber < 1 || selectionNumber > availableListings.length) {
          await sendSMS(normalizedPhone, `Hadirot Alert: Please reply with a number from 1 to ${availableListings.length}.`, 'system_response', null, conv.id);
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
          await sendSMS(normalizedPhone, "Hadirot Alert: Sorry, there was an error deactivating your listing. Please try again via hadirot.com/dashboard.", 'system_response', selectedListing.id, conv.id);
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
        await sendSMS(normalizedPhone, `Hadirot Alert: Listing deactivated. Did the ${selectedListingTypeWord} find you through Hadirot? Reply YES or NO.`, 'system_response', selectedListing.id, conv.id);

      } else if (conv.state === "awaiting_report_response") {
        const { data: reportListing, error: reportListingError } = await supabaseAdmin
          .from("listings")
          .select("id, listing_type")
          .eq("id", conv.listing_id)
          .maybeSingle();

        if (reportListingError || !reportListing) {
          console.error("Error fetching listing for report response:", reportListingError);
          await sendSMS(normalizedPhone, "Hadirot Alert: Sorry, there was an error. Please log into hadirot.com/dashboard to manage your listing.", 'system_response', conv.listing_id, conv.id);
          return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
        }

        if (intent.type === 'affirmative') {
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

          await sendSMS(normalizedPhone, "Hadirot Alert: OK, we've kept your listing active. Thank you for confirming!", 'system_response', conv.listing_id, conv.id);

        } else if (intent.type === 'negative') {
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
            await sendSMS(normalizedPhone, "Hadirot Alert: Sorry, there was an error deactivating your listing. Please try again via hadirot.com/dashboard.", 'system_response', conv.listing_id, conv.id);
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
          await sendSMS(normalizedPhone, `Hadirot Alert: Listing deactivated. Did the ${reportListingTypeWord} find you through Hadirot? Reply YES or NO.`, 'system_response', conv.listing_id, conv.id);

        } else {
          const rentedSoldWord = reportListing.listing_type === 'sale' ? 'sold' : 'rented';
          await sendSMS(normalizedPhone, `Hadirot Alert: Please reply YES if the listing is still available, or NO if it has been ${rentedSoldWord}.`, 'system_response', conv.listing_id, conv.id);
        }

      } else if (conv.state === "callback_sent") {
        if (intent.type === 'deactivation') {
          if (conv.listing_id) {
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
              await sendSMS(normalizedPhone, "Hadirot Alert: Sorry, there was an error. Please try via hadirot.com/dashboard.", 'system_response', conv.listing_id, conv.id);
              return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });
            }

            const { data: callbackListing } = await supabaseAdmin
              .from("listings")
              .select("listing_type")
              .eq("id", conv.listing_id)
              .maybeSingle();

            const cbListingTypeWord = callbackListing?.listing_type === 'sale' ? 'buyer' : 'tenant';

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

            await sendSMS(normalizedPhone, `Hadirot Alert: Listing deactivated. Did the ${cbListingTypeWord} find you through Hadirot? Reply YES or NO.`, 'system_response', conv.listing_id, conv.id);
          }
        } else {
          await supabaseAdmin
            .from("listing_renewal_conversations")
            .update({
              state: "completed",
              action_taken: "acknowledged",
              reply_received_at: new Date().toISOString(),
              reply_text: body,
              updated_at: new Date().toISOString(),
            })
            .eq("id", conv.id);
        }
      }
    }

    return new Response(emptyTwiML, { headers: { "Content-Type": "text/xml" } });

  } catch (error) {
    console.error("Unexpected error in handle-renewal-sms-webhook:", error);
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && supabaseServiceKey) {
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: config } = await supabaseAdmin
          .from("sms_admin_config")
          .select("admin_email")
          .eq("id", 1)
          .maybeSingle();
        if (config?.admin_email) {
          await sendViaZepto({
            to: config.admin_email,
            subject: `Hadirot SMS Alert: Webhook Error`,
            html: `<pre>Error: ${error instanceof Error ? error.message : String(error)}\nFrom: ${from}\nBody: ${body}</pre>`,
            fromName: "Hadirot SMS System",
          });
        }
      }
    } catch (notifyErr) {
      console.error("Failed to notify admin of error:", notifyErr);
    }
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "text/xml" } }
    );
  }
});
