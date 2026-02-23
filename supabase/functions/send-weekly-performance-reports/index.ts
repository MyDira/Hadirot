import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface ContactMetrics {
  contact_phone: string;
  listing_count: number;
  total_impressions: number;
  avg_impressions: number;
  total_views: number;
  avg_views: number;
  total_phone_clicks: number;
  total_callbacks: number;
  total_leads: number;
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
  }

  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }

  return `+1${cleaned}`;
}

function buildPerformanceMessage(metrics: ContactMetrics): string {
  const listingWord = metrics.listing_count === 1 ? 'listing' : 'listings';

  const lines: string[] = [
    `Hadirot Update:`,
    `This week your ${metrics.listing_count} ${listingWord} got on average`
  ];

  if (metrics.avg_impressions > 0) {
    lines.push(`${metrics.avg_impressions} impressions each`);
  }

  if (metrics.avg_views > 0) {
    lines.push(`${metrics.avg_views} clicks each`);
  }

  if (metrics.total_leads > 0) {
    lines.push(
      `${metrics.total_leads} leads total ` +
      `(${metrics.total_callbacks} callbacks, ` +
      `${metrics.total_phone_clicks} requests for your phone number)`
    );
  }

  return lines.join('\n');
}

const BATCH_SIZE = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Starting send-weekly-performance-reports job...");

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

    const { data: activeListings, error: listingsError } = await supabaseAdmin
      .from('listings')
      .select('id, contact_phone')
      .eq('is_active', true)
      .eq('approved', true)
      .not('contact_phone', 'is', null)
      .not('user_id', 'is', null);

    if (listingsError) {
      console.error("Error querying listings:", listingsError);
      return new Response(
        JSON.stringify({ error: "Failed to query listings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!activeListings || activeListings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active listings found", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${activeListings.length} active listings, running bulk queries...`);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const listingIds = activeListings.map(l => l.id);

    const [impressionsResult, viewsResult, phoneClicksResult, callbacksResult] = await Promise.all([
      supabaseAdmin
        .from('analytics_events')
        .select('event_props')
        .eq('event_name', 'listing_impression_batch')
        .gte('occurred_at', sevenDaysAgo),

      supabaseAdmin
        .from('analytics_events')
        .select('event_props')
        .eq('event_name', 'listing_view')
        .gte('occurred_at', sevenDaysAgo),

      supabaseAdmin
        .from('analytics_events')
        .select('event_props')
        .eq('event_name', 'phone_click')
        .gte('occurred_at', sevenDaysAgo),

      supabaseAdmin
        .from('listing_contact_submissions')
        .select('listing_id')
        .gte('created_at', sevenDaysAgo),
    ]);

    const listingIdSet = new Set(listingIds);

    const impressionsByListing = new Map<string, number>();
    if (impressionsResult.data) {
      for (const event of impressionsResult.data) {
        const ids = event.event_props?.listing_ids;
        if (Array.isArray(ids)) {
          for (const id of ids) {
            if (listingIdSet.has(id)) {
              impressionsByListing.set(id, (impressionsByListing.get(id) || 0) + 1);
            }
          }
        }
      }
    }

    const viewsByListing = new Map<string, number>();
    if (viewsResult.data) {
      for (const event of viewsResult.data) {
        const id = event.event_props?.listing_id;
        if (id && listingIdSet.has(id)) {
          viewsByListing.set(id, (viewsByListing.get(id) || 0) + 1);
        }
      }
    }

    const phoneClicksByListing = new Map<string, number>();
    if (phoneClicksResult.data) {
      for (const event of phoneClicksResult.data) {
        const id = event.event_props?.listing_id;
        if (id && listingIdSet.has(id)) {
          phoneClicksByListing.set(id, (phoneClicksByListing.get(id) || 0) + 1);
        }
      }
    }

    const callbacksByListing = new Map<string, number>();
    if (callbacksResult.data) {
      for (const sub of callbacksResult.data) {
        if (sub.listing_id && listingIdSet.has(sub.listing_id)) {
          callbacksByListing.set(sub.listing_id, (callbacksByListing.get(sub.listing_id) || 0) + 1);
        }
      }
    }

    const contactMetricsMap = new Map<string, ContactMetrics>();

    for (const listing of activeListings) {
      if (!contactMetricsMap.has(listing.contact_phone)) {
        contactMetricsMap.set(listing.contact_phone, {
          contact_phone: listing.contact_phone,
          listing_count: 0,
          total_impressions: 0,
          avg_impressions: 0,
          total_views: 0,
          avg_views: 0,
          total_phone_clicks: 0,
          total_callbacks: 0,
          total_leads: 0,
        });
      }

      const metrics = contactMetricsMap.get(listing.contact_phone)!;
      metrics.listing_count++;
      metrics.total_impressions += impressionsByListing.get(listing.id) || 0;
      metrics.total_views += viewsByListing.get(listing.id) || 0;
      metrics.total_phone_clicks += phoneClicksByListing.get(listing.id) || 0;
      metrics.total_callbacks += callbacksByListing.get(listing.id) || 0;
    }

    const metricsArray: ContactMetrics[] = [];
    for (const metrics of contactMetricsMap.values()) {
      if (metrics.total_impressions >= 10) {
        metrics.avg_impressions = Math.round((metrics.total_impressions / metrics.listing_count) * 10) / 10;
        metrics.avg_views = Math.round((metrics.total_views / metrics.listing_count) * 10) / 10;
        metrics.total_leads = metrics.total_phone_clicks + metrics.total_callbacks;
        metricsArray.push(metrics);
      }
    }

    console.log(`Found ${metricsArray.length} contacts with >= 10 impressions`);

    if (metricsArray.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No contacts qualified for reports (< 10 impressions)",
          processed: 0
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let smsSent = 0;
    let smsErrors = 0;

    for (let i = 0; i < metricsArray.length; i += BATCH_SIZE) {
      const batch = metricsArray.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (metrics) => {
          const phoneNumber = formatPhoneForSMS(metrics.contact_phone);
          const message = buildPerformanceMessage(metrics);

          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
          const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

          const twilioResponse = await fetch(twilioUrl, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${twilioAuth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: phoneNumber,
              From: twilioPhoneNumber,
              Body: message,
            }),
          });

          const twilioData: TwilioResponse = await twilioResponse.json();

          if (!twilioResponse.ok) {
            throw new Error(`Twilio error for ${phoneNumber}: ${twilioData.error_message}`);
          }

          try {
            await supabaseAdmin.from("sms_messages").insert({
              direction: "outbound",
              phone_number: phoneNumber,
              message_body: message,
              message_sid: twilioData.sid,
              message_source: "weekly_report",
              status: "sent",
            });
          } catch (logErr) {
            console.error("Error logging SMS:", logErr);
          }

          return twilioData.sid;
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          smsSent++;
        } else {
          console.error("SMS send failed:", result.reason);
          smsErrors++;
        }
      }
    }

    const summary = {
      totalContacts: metricsArray.length,
      smsSent,
      smsErrors,
      timestamp: new Date().toISOString(),
    };

    console.log("Weekly performance reports job completed:", summary);

    return new Response(
      JSON.stringify({ success: true, summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error in send-weekly-performance-reports:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
