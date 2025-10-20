import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendViaZepto } from "../_shared/zepto.ts";

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
  updated_at: string;
  approval_email_sent_at: string | null;
  listing_images: Array<{
    image_url: string;
    is_featured: boolean;
    sort_order: number;
  }>;
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
    console.log("📧 Starting daily approved listings email job");

    // Create Supabase admin client
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

    // Get all admin users
    const { data: adminProfiles, error: adminsError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("is_admin", true);

    if (adminsError) {
      console.error("❌ Error fetching admins:", adminsError);
      throw adminsError;
    }

    if (!adminProfiles || adminProfiles.length === 0) {
      console.log("⚠️ No admin users found");
      return new Response(
        JSON.stringify({ message: "No admin users to send email to" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get emails from auth.users
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      console.error("❌ Error fetching user emails:", usersError);
      throw usersError;
    }

    const adminIds = new Set(adminProfiles.map(p => p.id));
    const adminEmails = users
      ?.filter(u => adminIds.has(u.id))
      .map(u => u.email)
      .filter((email): email is string => !!email) || [];

    if (adminEmails.length === 0) {
      console.log("⚠️ No admin email addresses found");
      return new Response(
        JSON.stringify({ message: "No admin email addresses to send to" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`👥 Found ${adminEmails.length} admin user(s)`);

    // Get listings approved in last 24 hours that haven't been emailed
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

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
        updated_at,
        approval_email_sent_at,
        listing_images(image_url, is_featured, sort_order),
        owner:profiles!listings_user_id_fkey(full_name, role, agency)
      `)
      .eq("approved", true)
      .eq("is_active", true)
      .gte("updated_at", twentyFourHoursAgo)
      .or(`approval_email_sent_at.is.null,approval_email_sent_at.lt.${twentyFourHoursAgo}`)
      .order("updated_at", { ascending: false });

    if (listingsError) {
      console.error("❌ Error fetching listings:", listingsError);
      throw listingsError;
    }

    if (!listings || listings.length === 0) {
      console.log("ℹ️ No new approved listings to send");
      return new Response(
        JSON.stringify({ message: "No new approved listings in last 24 hours" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📋 Found ${listings.length} new approved listing(s)`);

    // Generate email content with listings
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";
    const whatsappLink = "https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt";

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

    const getBedroomDisplay = (bedrooms: number) => {
      return bedrooms === 0 ? "Studio" : `${bedrooms} bed`;
    };

    const getParkingDisplay = (parking: string) => {
      return parking === "yes" || parking === "included" ? "🅿️ Parking" : "";
    };

    // Build email HTML
    let listingsHtml = "";

    for (const listing of listings as unknown as Listing[]) {
      // Get primary image
      const sortedImages = listing.listing_images?.sort((a, b) => {
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        return a.sort_order - b.sort_order;
      });
      const primaryImage = sortedImages?.[0]?.image_url || "";
      const listingUrl = `${siteUrl}/listing/${listing.id}`;
      const ownerDisplay = listing.owner?.role === "agent" && listing.owner?.agency
        ? listing.owner.agency
        : "Owner";
      const hasParking = getParkingDisplay(listing.parking);

      listingsHtml += `
        <div style="margin-bottom: 40px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: white;">
          ${primaryImage ? `
            <img src="${primaryImage}" alt="${listing.title}" style="width: 100%; height: 300px; object-fit: cover; display: block;">
          ` : ''}

          <div style="padding: 20px;">
            <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; color: #1e4a74;">${formatPrice(listing)}</h2>

            <div style="margin-bottom: 12px; color: #4b5563; font-size: 14px;">
              🛏️ ${getBedroomDisplay(listing.bedrooms)} |
              🛁 ${listing.bathrooms} bath ${hasParking ? '| ' + hasParking : ''} |
              <span style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px;">${listing.broker_fee ? "Broker Fee" : "No Fee"}</span>
            </div>

            <div style="margin-bottom: 12px; color: #4b5563; font-size: 14px;">
              📍 ${listing.neighborhood ? `${listing.neighborhood}, ${listing.location}` : listing.location}
            </div>

            <div style="margin-bottom: 16px; padding: 12px; background: #f0f9ff; border-left: 4px solid #25D366; border-radius: 4px;">
              <p style="margin: 0 0 8px 0; font-weight: 600; color: #333;">Join the Hadirot WhatsApp Community:</p>
              <a href="${whatsappLink}" style="color: #25D366; text-decoration: none; font-weight: 500;">
                ${whatsappLink}
              </a>
            </div>

            <a href="${listingUrl}" style="display: inline-block; background: #1e4a74; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              View Listing
            </a>

            <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
              Posted by ${ownerDisplay}
              ${listing.is_featured ? ' <span style="background: #7CB342; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">FEATURED</span>' : ''}
            </div>
          </div>
        </div>
      `;
    }

    const currentDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f9fafb; padding: 20px;">
        <div style="background: #1e4a74; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Hadirot</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.9;">Daily Approved Listings</p>
        </div>

        <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="margin: 0 0 8px 0; color: #1e4a74; font-size: 20px;">New Listings - ${currentDate}</h2>
          <p style="margin: 0 0 30px 0; color: #6b7280;">You have ${listings.length} new approved listing${listings.length !== 1 ? 's' : ''} to review.</p>

          ${listingsHtml}

          <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
            <p style="margin: 0;">© ${new Date().getFullYear()} Hadirot. All rights reserved.</p>
          </div>
        </div>
      </div>
    `;

    // Send email to all admins
    // adminEmails already defined above
    const zeptoFromAddress = Deno.env.get("ZEPTO_FROM_ADDRESS") || "noreply@hadirot.com";
    const zeptoFromName = Deno.env.get("ZEPTO_FROM_NAME") || "HaDirot";

    console.log(`📤 Sending email to ${adminEmails.length} admin(s)`);

    await sendViaZepto({
      to: adminEmails,
      subject: `Daily Approved Listings - ${currentDate}`,
      html: emailHtml,
      from: zeptoFromAddress,
      fromName: zeptoFromName,
    });

    console.log("✅ Email sent successfully");

    // Update approval_email_sent_at for all listings
    const listingIds = listings.map((l) => l.id);
    const now = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("listings")
      .update({ approval_email_sent_at: now })
      .in("id", listingIds);

    if (updateError) {
      console.error("❌ Error updating approval_email_sent_at:", updateError);
      // Don't throw - email was sent successfully
    } else {
      console.log(`✅ Updated approval_email_sent_at for ${listingIds.length} listing(s)`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        listingCount: listings.length,
        adminCount: adminEmails.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error in daily approved listings job:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
