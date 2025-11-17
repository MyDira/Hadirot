import { createClient } from "npm:@supabase/supabase-js@2";
import type {
  DigestTemplate,
  FilterPreset,
  Listing,
  DigestRequestBody,
  DigestResponse,
  CategoryGroup,
  FilterLinkWithCount,
} from "../send-daily-admin-digest/types.ts";
import { buildListingsQuery, getListingCount, buildFilterUrl } from "../send-daily-admin-digest/query-builder.ts";
import { categorizeByBedrooms, getBedroomCategory } from "../send-daily-admin-digest/categorizer.ts";
import { renderPlainTextEmail, generateEmailSubject } from "../send-daily-admin-digest/email-templates.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ZEPTO_API_URL = "https://api.zeptomail.com/v1.1/email";

interface ZeptoParams {
  to: string | string[];
  subject: string;
  html: string;
  fromName?: string;
}

async function sendViaZepto({ to, subject, html, fromName }: ZeptoParams) {
  const token = Deno.env.get("ZEPTO_TOKEN");
  const address = Deno.env.get("ZEPTO_FROM_ADDRESS") || "";
  const name = fromName || Deno.env.get("ZEPTO_FROM_NAME") || "";

  if (!token || !address || !name) {
    throw new Error("ZeptoMail is not configured");
  }

  const toList = Array.isArray(to) ? to : [to];
  const htmlFormatted = `<pre style="font-family: inherit; white-space: pre-wrap; word-wrap: break-word;">${html}</pre>`;

  const payload = {
    from: { address, name },
    to: toList.map((addr) => ({ email_address: { address: addr } })),
    subject,
    htmlbody: htmlFormatted,
    textbody: html,
    track_opens: false,
    track_clicks: false,
  };

  const res = await fetch(ZEPTO_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Zoho-enczapikey ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ZeptoMail error: ${res.status} ${text}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    console.log("📧 Starting enhanced digest email job");

    // Authentication check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify admin access
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.is_admin) {
      return new Response(
        JSON.stringify({ error: "Forbidden", message: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: DigestRequestBody = await req.json();
    const { template_id, template_config, dry_run = false, recipient_emails } = body;

    console.log(`📋 Request: template_id=${template_id}, dry_run=${dry_run}`);

    // Load template or use inline config
    let template: DigestTemplate;
    if (template_id) {
      const { data, error } = await supabaseAdmin
        .from("digest_templates")
        .select("*")
        .eq("id", template_id)
        .maybeSingle();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Not found", message: "Template not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      template = data as DigestTemplate;
    } else if (template_config) {
      // Use inline template config
      template = {
        id: "inline",
        name: template_config.name || "Ad-hoc Digest",
        template_type: template_config.template_type || "unsent_only",
        filter_config: template_config.filter_config || {},
        category_limits: template_config.category_limits || {},
        sort_preference: template_config.sort_preference || "newest_first",
        allow_resend: template_config.allow_resend || false,
        resend_after_days: template_config.resend_after_days || 7,
        ignore_send_history: template_config.ignore_send_history || false,
        subject_template: template_config.subject_template || "Listing Digest - {{date}}",
        include_filter_links: template_config.include_filter_links || false,
        filter_preset_ids: template_config.filter_preset_ids || [],
        is_default: false,
        usage_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as DigestTemplate;
    } else {
      // Use default unsent_only template
      const { data } = await supabaseAdmin
        .from("digest_templates")
        .select("*")
        .eq("is_default", true)
        .eq("template_type", "unsent_only")
        .maybeSingle();

      if (!data) {
        return new Response(
          JSON.stringify({ error: "Configuration error", message: "No default template found" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      template = data as DigestTemplate;
    }

    console.log(`✅ Using template: ${template.name} (${template.template_type})`);

    // Get admin email addresses
    const { data: adminProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("is_admin", true);

    const adminIds = adminProfiles?.map(p => p.id) || [];
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();

    let adminEmails: string[];
    if (recipient_emails && recipient_emails.length > 0) {
      adminEmails = recipient_emails;
    } else {
      const adminIdSet = new Set(adminIds);
      adminEmails = users
        ?.filter(u => adminIdSet.has(u.id))
        .map(u => u.email)
        .filter((email): email is string => !!email) || [];
    }

    if (adminEmails.length === 0) {
      return new Response(
        JSON.stringify({ error: "Configuration error", message: "No admin email addresses found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`👥 Found ${adminEmails.length} recipient(s)`);

    // Fetch listings based on template type and config
    let allListings = await buildListingsQuery(
      supabaseAdmin,
      template.filter_config,
      template.sort_preference
    );

    console.log(`📦 Found ${allListings.length} listings matching filters`);

    // Apply deduplication logic
    let listingsToSend: Listing[] = [];

    if (template.ignore_send_history) {
      // No deduplication
      listingsToSend = allListings;
      console.log(`📝 Ignore send history: sending all ${listingsToSend.length} listings`);
    } else if (template.template_type === "unsent_only") {
      // Only send listings never sent before
      const { data: sentListings } = await supabaseAdmin
        .from("digest_sent_listings")
        .select("listing_id");

      const sentIds = new Set(sentListings?.map(s => s.listing_id) || []);
      listingsToSend = allListings.filter(l => !sentIds.has(l.id));
      console.log(`📝 Unsent only: ${listingsToSend.length} of ${allListings.length} listings are new`);
    } else if (template.allow_resend) {
      // Allow resend after N days
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - template.resend_after_days);

      const { data: recentSends } = await supabaseAdmin
        .from("digest_sent_listings")
        .select("listing_id")
        .gte("sent_at", thresholdDate.toISOString());

      const recentIds = new Set(recentSends?.map(s => s.listing_id) || []);
      listingsToSend = allListings.filter(l => !recentIds.has(l.id));
      console.log(`📝 Allow resend: ${listingsToSend.length} of ${allListings.length} listings eligible`);
    } else {
      // Default: send all matching listings
      listingsToSend = allListings;
    }

    // Handle different digest types
    let categories: CategoryGroup[] = [];
    let filterLinks: FilterLinkWithCount[] = [];

    if (template.template_type === "recent_by_category") {
      categories = categorizeByBedrooms(listingsToSend, template.category_limits);
      console.log(`📊 Categorized into ${categories.length} bedroom groups`);
    } else if (template.template_type === "filter_links") {
      // Fetch filter presets and generate links with counts
      const { data: presets } = await supabaseAdmin
        .from("filter_presets")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";

      for (const preset of (presets || []) as FilterPreset[]) {
        const count = await getListingCount(supabaseAdmin, preset.filter_params);
        const url = buildFilterUrl(preset.filter_params);

        filterLinks.push({
          preset_id: preset.id,
          label: preset.display_label,
          count,
          url,
          short_url: preset.short_code ? `${siteUrl}/l/${preset.short_code}` : undefined,
        });
      }

      console.log(`🔗 Generated ${filterLinks.length} filter links`);
    } else if (template.template_type === "mixed_layout") {
      // Include both listings and filter links
      categories = categorizeByBedrooms(listingsToSend, template.category_limits);

      if (template.include_filter_links && template.filter_preset_ids.length > 0) {
        const { data: presets } = await supabaseAdmin
          .from("filter_presets")
          .select("*")
          .in("id", template.filter_preset_ids);

        const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";

        for (const preset of (presets || []) as FilterPreset[]) {
          const count = await getListingCount(supabaseAdmin, preset.filter_params);
          const url = buildFilterUrl(preset.filter_params);

          filterLinks.push({
            preset_id: preset.id,
            label: preset.display_label,
            count,
            url,
            short_url: preset.short_code ? `${siteUrl}/l/${preset.short_code}` : undefined,
          });
        }
      }
    } else {
      // Default: show all listings as one group
      categories = [{ label: "New Listings", key: "all", listings: listingsToSend }];
    }

    const totalListings = categories.reduce((sum, cat) => sum + cat.listings.length, 0);

    // If dry run, return preview data
    if (dry_run) {
      const listingsByCategory: Record<string, number> = {};
      for (const cat of categories) {
        listingsByCategory[cat.key] = cat.listings.length;
      }

      console.log("🔍 Dry run mode: returning preview data");

      const response: DigestResponse = {
        success: true,
        dry_run: true,
        listingCount: totalListings,
        adminCount: adminEmails.length,
        template_name: template.name,
        template_type: template.template_type,
        listings_by_category: listingsByCategory,
        filter_links: filterLinks,
        message: "Preview: This digest would send to the specified recipients",
      };

      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate email content
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";

    // Get total active listings count
    const { count: totalActive } = await supabaseAdmin
      .from("listings")
      .select("*", { count: 'exact', head: true })
      .eq("approved", true)
      .eq("is_active", true);

    // Create short URL helper
    const createShortUrl = async (listingId: string, originalUrl: string): Promise<string> => {
      try {
        const { data: shortCode } = await supabaseAdmin.rpc(
          "create_short_url",
          {
            p_listing_id: listingId,
            p_original_url: originalUrl,
            p_source: "digest_email",
            p_expires_days: 90
          }
        );

        if (shortCode) {
          return `${siteUrl}/l/${shortCode}`;
        }
      } catch (error) {
        console.error("Error creating short URL:", error);
      }
      return originalUrl;
    };

    const emailContent = await renderPlainTextEmail(
      categories,
      filterLinks,
      siteUrl,
      totalActive || 0,
      createShortUrl
    );

    const subject = generateEmailSubject(
      template.name,
      template.subject_template,
      totalListings
    );

    // Send email
    console.log(`📤 Sending email to ${adminEmails.length} admin(s)`);

    await sendViaZepto({
      to: adminEmails,
      subject,
      html: emailContent,
      fromName: "HaDirot Admin",
    });

    console.log("✅ Email sent successfully");

    // Record the send
    const digestSendRecord = {
      template_id: template_id || null,
      template_name: template.name,
      template_type: template.template_type,
      sent_by: user.id,
      recipient_emails: adminEmails,
      recipient_count: adminEmails.length,
      total_listings_sent: totalListings,
      listings_by_category: categories.reduce((obj, cat) => {
        obj[cat.key] = cat.listings.length;
        return obj;
      }, {} as Record<string, number>),
      filter_links_included: filterLinks,
      execution_time_ms: Date.now() - startTime,
      success: true,
      config_snapshot: template,
    };

    const { data: digestSend, error: sendError } = await supabaseAdmin
      .from("digest_sends")
      .insert(digestSendRecord)
      .select()
      .single();

    if (sendError) {
      console.error("⚠️ Failed to log digest send:", sendError);
    }

    // Record sent listings
    if (digestSend && totalListings > 0) {
      const sentListingRecords = [];
      for (const category of categories) {
        for (const listing of category.listings) {
          sentListingRecords.push({
            digest_send_id: digestSend.id,
            listing_id: listing.id,
            template_id: template_id || null,
            category_label: category.key,
            listing_price: listing.price,
            listing_bedrooms: listing.bedrooms,
          });
        }
      }

      const { error: listingsError } = await supabaseAdmin
        .from("digest_sent_listings")
        .insert(sentListingRecords);

      if (listingsError) {
        console.error("⚠️ Failed to record sent listings:", listingsError);
      } else {
        console.log(`✅ Recorded ${sentListingRecords.length} sent listing(s)`);
      }
    }

    // Update template usage
    if (template_id) {
      await supabaseAdmin
        .from("digest_templates")
        .update({
          usage_count: (template.usage_count || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", template_id);
    }

    const response: DigestResponse = {
      success: true,
      listingCount: totalListings,
      adminCount: adminEmails.length,
      template_name: template.name,
      template_type: template.template_type,
      digest_send_id: digestSend?.id,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Error in digest job:", error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
