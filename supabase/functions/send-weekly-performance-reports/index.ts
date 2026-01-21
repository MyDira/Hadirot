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

    console.log("Querying listing metrics for the past 7 days...");

    const query = `
      WITH listing_metrics AS (
        SELECT
          l.id as listing_id,
          l.contact_phone,
          (SELECT COUNT(*)
           FROM analytics_events ae
           WHERE ae.event_name = 'listing_impression_batch'
             AND ae.occurred_at >= NOW() - INTERVAL '7 days'
             AND l.id::text = ANY(
               SELECT jsonb_array_elements_text(ae.event_props->'listing_ids')
             )
          ) as impressions,
          (SELECT COUNT(*)
           FROM analytics_events ae
           WHERE ae.event_name = 'listing_view'
             AND ae.event_props->>'listing_id' = l.id::text
             AND ae.occurred_at >= NOW() - INTERVAL '7 days'
          ) as views,
          (SELECT COUNT(*)
           FROM analytics_events ae
           WHERE ae.event_name = 'phone_click'
             AND ae.event_props->>'listing_id' = l.id::text
             AND ae.occurred_at >= NOW() - INTERVAL '7 days'
          ) as phone_clicks,
          (SELECT COUNT(*)
           FROM listing_contact_submissions lcs
           WHERE lcs.listing_id = l.id
             AND lcs.created_at >= NOW() - INTERVAL '7 days'
          ) as callbacks
        FROM listings l
        WHERE l.is_active = true
          AND l.approved = true
          AND l.contact_phone IS NOT NULL
          AND l.user_id IS NOT NULL
      )
      SELECT
        contact_phone,
        COUNT(*) as listing_count,
        SUM(impressions) as total_impressions,
        ROUND(AVG(impressions), 1) as avg_impressions,
        SUM(views) as total_views,
        ROUND(AVG(views), 1) as avg_views,
        SUM(phone_clicks) as total_phone_clicks,
        SUM(callbacks) as total_callbacks,
        (SUM(phone_clicks) + SUM(callbacks)) as total_leads
      FROM listing_metrics
      GROUP BY contact_phone
      HAVING SUM(impressions) >= 10
      ORDER BY total_impressions DESC;
    `;

    const { data: metricsData, error: queryError } = await supabaseAdmin.rpc(
      'exec_sql',
      { sql: query }
    ).select();

    if (queryError) {
      console.log("Query error, trying direct query instead...");

      const { data: rawData, error: rawError } = await supabaseAdmin
        .from('listings')
        .select('id, contact_phone, is_active, approved, user_id')
        .eq('is_active', true)
        .eq('approved', true)
        .not('contact_phone', 'is', null)
        .not('user_id', 'is', null);

      if (rawError) {
        console.error("Error querying listings:", rawError);
        return new Response(
          JSON.stringify({ error: "Failed to query listings" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Found ${rawData?.length || 0} active listings, aggregating metrics manually...`);

      const contactMetricsMap = new Map<string, ContactMetrics>();

      for (const listing of rawData || []) {
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

        const { data: impressionEvents } = await supabaseAdmin
          .from('analytics_events')
          .select('id')
          .eq('event_name', 'listing_impression_batch')
          .gte('occurred_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .contains('event_props', { listing_ids: [listing.id] });

        const { data: viewEvents } = await supabaseAdmin
          .from('analytics_events')
          .select('id')
          .eq('event_name', 'listing_view')
          .eq('event_props->>listing_id', listing.id)
          .gte('occurred_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        const { data: phoneEvents } = await supabaseAdmin
          .from('analytics_events')
          .select('id')
          .eq('event_name', 'phone_click')
          .eq('event_props->>listing_id', listing.id)
          .gte('occurred_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        const { data: callbacks } = await supabaseAdmin
          .from('listing_contact_submissions')
          .select('id')
          .eq('listing_id', listing.id)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        metrics.total_impressions += impressionEvents?.length || 0;
        metrics.total_views += viewEvents?.length || 0;
        metrics.total_phone_clicks += phoneEvents?.length || 0;
        metrics.total_callbacks += callbacks?.length || 0;
      }

      const metricsArray: ContactMetrics[] = [];
      for (const [phone, metrics] of contactMetricsMap) {
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

      for (const metrics of metricsArray) {
        const phoneNumber = formatPhoneForSMS(metrics.contact_phone);
        const message = buildPerformanceMessage(metrics);

        console.log(`Sending report to ${phoneNumber}:`);
        console.log(message);

        try {
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
            console.error(`Twilio error for ${phoneNumber}:`, twilioData);
            smsErrors++;
            continue;
          }

          smsSent++;
          console.log(`SMS sent successfully to ${phoneNumber}: ${twilioData.sid}`);

        } catch (error) {
          console.error(`Network error sending SMS to ${phoneNumber}:`, error);
          smsErrors++;
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
    }

    console.log(`Query completed, processing results...`);

    const metricsArray = metricsData as ContactMetrics[];
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

    for (const metrics of metricsArray) {
      const phoneNumber = formatPhoneForSMS(metrics.contact_phone);
      const message = buildPerformanceMessage(metrics);

      console.log(`Sending report to ${phoneNumber}:`);
      console.log(message);

      try {
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
          console.error(`Twilio error for ${phoneNumber}:`, twilioData);
          smsErrors++;
          continue;
        }

        smsSent++;
        console.log(`SMS sent successfully to ${phoneNumber}: ${twilioData.sid}`);

      } catch (error) {
        console.error(`Network error sending SMS to ${phoneNumber}:`, error);
        smsErrors++;
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
