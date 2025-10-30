import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-id',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
};

const ZEPTO_API_URL = "https://api.zeptomail.com/v1.1/email";

interface ZeptoAttachment {
  content: string;
  mime_type: string;
  name: string;
}

interface ZeptoParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  attachments?: ZeptoAttachment[];
}

async function sendViaZepto({ to, subject, html, from, fromName, replyTo, attachments }: ZeptoParams) {
  const token = Deno.env.get("ZEPTO_TOKEN");
  const address = from || Deno.env.get("ZEPTO_FROM_ADDRESS") || "";
  const name = fromName || Deno.env.get("ZEPTO_FROM_NAME") || "";
  const replyToAddress = replyTo || Deno.env.get("ZEPTO_REPLY_TO") || undefined;

  if (!token || !address || !name) {
    throw new Error("ZeptoMail is not configured");
  }

  const toList = Array.isArray(to) ? to : [to];
  const payload = {
    from: { address, name },
    to: toList.map((addr) => ({ email_address: { address: addr } })),
    subject,
    htmlbody: html,
    reply_to: replyToAddress ? [{ address: replyToAddress }] : undefined,
    track_opens: false,
    track_clicks: false,
    attachments: attachments || undefined,
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

interface BrandEmailParams {
  title: string;
  intro?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
}

function renderBrandEmail({ title, intro, bodyHtml, ctaLabel, ctaHref }: BrandEmailParams) {
  const introHtml = intro ? `<p style=\"margin-top:0;\">${intro}</p>` : "";
  const button = ctaLabel && ctaHref ? `<div style=\"text-align:center;margin:32px 0;\">
       <a href=\"${ctaHref}\" style=\"background-color:#7CB342;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;\">${ctaLabel}</a>
     </div>` : "";
  return `
    <div style=\"font-family:Arial,sans-serif;background-color:#F7F9FC;padding:24px;\">
      <div style=\"max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;\">
        <div style=\"background-color:#1E4A74;color:#FFFFFF;padding:24px;text-align:center;\">
          <h1 style=\"margin:0;font-size:24px;\">Hadirot</h1>
        </div>
        <div style=\"padding:24px;color:#374151;font-size:16px;line-height:1.5;\">
          <h2 style=\"margin:0 0 16px 0;font-size:20px;color:#1E4A74;\">${title}</h2>
          ${introHtml}
          ${bodyHtml}
          ${button}
        </div>
        <div style=\"background-color:#F7F9FC;color:#6B7280;text-align:center;font-size:12px;padding:16px;\">
          © ${new Date().getFullYear()} Hadirot. All rights reserved.
        </div>
      </div>
    </div>
  `;
}

interface Listing {
  id: string;
  title: string;
  price: number | null;
  call_for_price: boolean;
  bedrooms: number;
  bathrooms: number;
  parking: string;
  broker_fee: boolean;
  location: string;
  neighborhood: string | null;
  property_type: string;
  lease_length: string;
  is_featured: boolean;
  additional_rooms: number | null;
  created_at: string;
  owner: {
    full_name: string;
    role: string;
    agency: string | null;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("\ud83d\udce7 Starting daily admin digest email job");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("\u274c No Authorization header provided");
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let force = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        force = body.force === true;
        console.log(`\ud83d\udd27 Force parameter: ${force}`);
      } catch (e) {
        console.warn("\u26a0\ufe0f Could not parse request body:", e);
      }
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error("\u274c Invalid auth token:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Invalid authentication token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || !profile.is_admin) {
      console.error("\u274c User is not an admin:", user.id);
      return new Response(
        JSON.stringify({ error: "Forbidden", message: "Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`\u2705 Authorized admin user: ${user.id}`);

    const { data: config, error: configError } = await supabaseAdmin
      .from("daily_admin_digest_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (configError) {
      console.error("\u274c Error fetching config:", configError);
      return new Response(
        JSON.stringify({
          error: "Database error",
          message: "Failed to fetch digest configuration",
          details: configError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!force && (!config || !config.enabled)) {
      console.log("\u23f8\ufe0f Daily digest is disabled");
      return new Response(
        JSON.stringify({ message: "Daily digest is disabled" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (force) {
      console.log("\ud83d\udd27 Force parameter set - bypassing enabled check");
    }

    const { data: adminProfiles, error: adminsError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("is_admin", true);

    if (adminsError) {
      console.error("\u274c Error fetching admins:", adminsError);
      return new Response(
        JSON.stringify({
          error: "Database error",
          message: "Failed to fetch admin users",
          details: adminsError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!adminProfiles || adminProfiles.length === 0) {
      console.log("\u26a0\ufe0f No admin users found");
      return new Response(
        JSON.stringify({ message: "No admin users to send email to" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      console.error("\u274c Error fetching user emails:", usersError);
      return new Response(
        JSON.stringify({
          error: "Authentication error",
          message: "Failed to fetch user email addresses",
          details: usersError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const adminIds = new Set(adminProfiles.map(p => p.id));
    const adminEmails = users
      ?.filter(u => adminIds.has(u.id))
      .map(u => u.email)
      .filter((email): email is string => !!email) || [];

    if (adminEmails.length === 0) {
      console.log("\u26a0\ufe0f No admin email addresses found");
      return new Response(
        JSON.stringify({ message: "No admin email addresses to send to" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`\ud83d\udc65 Found ${adminEmails.length} admin user(s)`);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: listings, error: listingsError } = await supabaseAdmin
      .from("listings")
      .select(`
        id,
        title,
        price,
        call_for_price,
        bedrooms,
        bathrooms,
        parking,
        broker_fee,
        location,
        neighborhood,
        property_type,
        lease_length,
        is_featured,
        additional_rooms,
        created_at,
        owner:profiles!listings_user_id_fkey(full_name, role, agency)
      `)
      .eq("approved", true)
      .eq("is_active", true)
      .gte("updated_at", twentyFourHoursAgo)
      .order("created_at", { ascending: false });

    if (listingsError) {
      console.error("\u274c Error fetching listings:", listingsError);
      return new Response(
        JSON.stringify({
          error: "Database error",
          message: "Failed to fetch listings",
          details: listingsError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!listings || listings.length === 0) {
      console.log("\u2139\ufe0f No new approved listings in last 24 hours");

      await supabaseAdmin.from("daily_admin_digest_logs").insert({
        run_at: new Date().toISOString(),
        listings_count: 0,
        recipients_count: adminEmails.length,
        success: true,
        error_message: "No new listings to send",
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "No new approved listings in last 24 hours",
          listingCount: 0,
          adminCount: adminEmails.length
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: sentListings } = await supabaseAdmin
      .from("daily_admin_digest_sent_listings")
      .select("listing_id")
      .gte("sent_at", sevenDaysAgo);

    const sentListingIds = new Set(sentListings?.map(sl => sl.listing_id) || []);
    const newListings = (listings as unknown as Listing[]).filter(
      listing => !sentListingIds.has(listing.id)
    );

    if (newListings.length === 0) {
      console.log("\u2139\ufe0f All listings already sent within past 7 days");

      await supabaseAdmin.from("daily_admin_digest_logs").insert({
        run_at: new Date().toISOString(),
        listings_count: 0,
        recipients_count: adminEmails.length,
        success: true,
        error_message: "All listings already sent within 7 days",
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "All listings already sent within past 7 days",
          listingCount: 0,
          adminCount: adminEmails.length
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`\ud83d\udccb Found ${newListings.length} new listing(s) to send`);

    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";

    const formatPrice = (listing: Listing) => {
      if (listing.call_for_price) return "Call for Price";
      if (listing.price != null) {
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(listing.price);
      }
      return "Price Not Available";
    };

    const getBedroomDisplay = (listing: Listing) => {
      if (listing.bedrooms === 0) return "Studio";
      if (listing.additional_rooms && listing.additional_rooms > 0) {
        return `${listing.bedrooms}+${listing.additional_rooms} bed`;
      }
      return `${listing.bedrooms} bed`;
    };

    const getBathroomDisplay = (bathrooms: number) => {
      return `${bathrooms} bath`;
    };

    const getParkingDisplay = (parking: string) => {
      return parking === "yes" || parking === "included" ? "Parking" : "";
    };

    const getPropertyTypeDisplay = (propertyType: string) => {
      const types: { [key: string]: string } = {
        apartment: "Apartment",
        full_house: "Full House",
        duplex: "Duplex",
      };
      return types[propertyType] || propertyType;
    };

    const getLeaseDisplay = (leaseLength: string) => {
      const leases: { [key: string]: string} = {
        "12_months": "12 months",
        "6_months": "6 months",
        short_term: "Short Term",
        flexible: "Flexible",
      };
      return leases[leaseLength] || leaseLength;
    };

    let listingsTextContent = "";

    for (const listing of newListings) {
      const listingUrl = `${siteUrl}/listing/${listing.id}`;
      const ownerDisplay = listing.owner?.role === "agent" && listing.owner?.agency
        ? listing.owner.agency
        : "Owner";
      const hasParking = getParkingDisplay(listing.parking);
      const locationWithNeighborhood = listing.neighborhood
        ? `${listing.neighborhood}, ${listing.location}`
        : listing.location;

      listingsTextContent += `${formatPrice(listing)}\n`;

      let specs = `${getBedroomDisplay(listing)} | ${getBathroomDisplay(listing.bathrooms)}`;
      if (hasParking) {
        specs += ` | ${hasParking}`;
      }
      specs += ` | ${listing.broker_fee ? "Broker Fee" : "No Fee"}`;
      listingsTextContent += `${specs}\n`;

      listingsTextContent += `${locationWithNeighborhood}\n`;
      listingsTextContent += `${getPropertyTypeDisplay(listing.property_type)} | ${getLeaseDisplay(listing.lease_length)}\n`;
      listingsTextContent += `Posted by ${ownerDisplay}`;
      if (listing.is_featured) {
        listingsTextContent += " (FEATURED)";
      }
      listingsTextContent += `\n`;
      listingsTextContent += `View listing: ${listingUrl}\n`;
      listingsTextContent += `\n`;
    }

    const currentDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const bodyHtml = `
      <p>You have ${newListings.length} new approved and active listing${newListings.length !== 1 ? 's' : ''} from the past 24 hours.</p>
      <div style=\"background-color:#F7F9FC;padding:20px;border-radius:8px;margin:20px 0;\">
        <pre style=\"margin:0;font-family:monospace;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap;word-wrap:break-word;\">${listingsTextContent}</pre>
      </div>
    `;

    const emailHtml = renderBrandEmail({
      title: `Daily Listing Digest - ${currentDate}`,
      bodyHtml,
    });

    console.log(`\ud83d\udce4 Sending email to ${adminEmails.length} admin(s)`);

    const zeptoToken = Deno.env.get("ZEPTO_TOKEN");
    const zeptoFromAddress = Deno.env.get("ZEPTO_FROM_ADDRESS");
    const zeptoFromName = Deno.env.get("ZEPTO_FROM_NAME");

    if (!zeptoToken) {
      console.error("\u274c ZEPTO_TOKEN environment variable is not set");
      return new Response(
        JSON.stringify({
          error: "Configuration error",
          message: "Email service is not configured. Please set ZEPTO_TOKEN environment variable in Supabase Edge Functions settings.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!zeptoFromAddress || !zeptoFromName) {
      console.warn("\u26a0\ufe0f ZEPTO_FROM_ADDRESS or ZEPTO_FROM_NAME not set, using defaults");
    }

    console.log("\u2705 Email configuration verified");

    try {
      await sendViaZepto({
        to: adminEmails,
        subject: `Daily Listing Digest - ${currentDate}`,
        html: emailHtml,
        fromName: "HaDirot Admin",
      });
      console.log("\u2705 Email sent successfully");
    } catch (emailError) {
      console.error("\u274c Failed to send email:", emailError);
      return new Response(
        JSON.stringify({
          error: "Email service error",
          message: "Failed to send digest email",
          details: emailError instanceof Error ? emailError.message : String(emailError)
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const listingIds = newListings.map(l => l.id);
    const sentRecords = listingIds.map(id => ({
      listing_id: id,
      sent_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabaseAdmin
      .from("daily_admin_digest_sent_listings")
      .insert(sentRecords);

    if (insertError) {
      console.error("\u274c Error recording sent listings:", insertError);
    } else {
      console.log(`\u2705 Recorded ${listingIds.length} sent listing(s)`);
    }

    await supabaseAdmin.from("daily_admin_digest_logs").insert({
      run_at: new Date().toISOString(),
      listings_count: newListings.length,
      recipients_count: adminEmails.length,
      success: true,
      error_message: null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        listingCount: newListings.length,
        adminCount: adminEmails.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
    );
  } catch (error) {
    console.error("\u274c Unexpected error in daily admin digest job:", error);
    console.error("\u274c Error stack:", error instanceof Error ? error.stack : "No stack trace");

    try {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

      await supabaseAdmin.from("daily_admin_digest_logs").insert({
        run_at: new Date().toISOString(),
        listings_count: 0,
        recipients_count: 0,
        success: false,
        error_message: error instanceof Error ? error.message : String(error),
      });
    } catch (logError) {
      console.error("\u274c Failed to log error to database:", logError);
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error ? error.stack : undefined;

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: errorMessage,
        details: errorDetails,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
