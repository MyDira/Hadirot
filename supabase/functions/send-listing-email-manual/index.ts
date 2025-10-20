import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendViaZepto } from "../_shared/zepto.ts";
import { generateListingCardHTML } from "../_shared/listingCardTemplate.ts";

interface ManualEmailRequest {
  listingId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase client with user's auth
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Verify user is authenticated and is admin
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      console.error("❌ Auth verification failed:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid authorization" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      console.error("❌ User is not admin");
      return new Response(
        JSON.stringify({ error: "Unauthorized - admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("✅ Admin user verified:", user.email);

    // Parse request body
    const { listingId }: ManualEmailRequest = await req.json();

    if (!listingId) {
      return new Response(
        JSON.stringify({ error: "Missing listingId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📧 Sending manual email for listing: ${listingId}`);

    // Create admin client for fetching data
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
      return new Response(
        JSON.stringify({ error: "No admin users found to send email to" }),
        {
          status: 404,
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
      return new Response(
        JSON.stringify({ error: "No admin email addresses found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get the listing
    const { data: listing, error: listingError } = await supabaseAdmin
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
        listing_images(image_url, is_featured, sort_order),
        owner:profiles!listings_user_id_fkey(full_name, role, agency)
      `)
      .eq("id", listingId)
      .single();

    if (listingError || !listing) {
      console.error("❌ Error fetching listing:", listingError);
      return new Response(
        JSON.stringify({ error: "Listing not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`✅ Found listing: ${listing.title}`);

    // Generate listing card image
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";
    const whatsappLink = "https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt";
    const htmlCssToImageUserId = Deno.env.get("HTMLCSSTOIMAGE_USER_ID");
    const htmlCssToImageApiKey = Deno.env.get("HTMLCSSTOIMAGE_API_KEY");

    if (!htmlCssToImageUserId || !htmlCssToImageApiKey) {
      console.error("❌ HTML/CSS to Image API credentials not configured");
      return new Response(
        JSON.stringify({ error: "Image generation service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get primary image
    const sortedImages = listing.listing_images?.sort((a, b) => {
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      return a.sort_order - b.sort_order;
    });
    const primaryImage = sortedImages?.[0]?.image_url || "";

    console.log("🎨 Generating listing card image");

    // Generate HTML for listing card
    const cardHtml = generateListingCardHTML({
      id: listing.id,
      title: listing.title,
      price: listing.price,
      call_for_price: listing.call_for_price,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      parking: listing.parking,
      broker_fee: listing.broker_fee,
      location: listing.location,
      neighborhood: listing.neighborhood,
      property_type: listing.property_type,
      lease_length: listing.lease_length,
      imageUrl: primaryImage,
      ownerName: listing.owner?.full_name,
      ownerRole: listing.owner?.role,
      ownerAgency: listing.owner?.agency,
      is_featured: listing.is_featured,
    });

    // Generate image using HTML/CSS to Image API
    const auth = btoa(`${htmlCssToImageUserId}:${htmlCssToImageApiKey}`);
    const imageResponse = await fetch("https://hcti.io/v1/image", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        html: cardHtml,
        viewport_width: 400,
        viewport_height: 600,
        device_scale: 2,
      }),
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error("❌ Image generation failed:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate listing card image" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const imageData = await imageResponse.json();
    console.log(`✅ Image generated: ${imageData.url}`);

    // Download the image and convert to base64
    const imageBlob = await fetch(imageData.url);
    const imageBuffer = await imageBlob.arrayBuffer();
    const base64Image = btoa(
      new Uint8Array(imageBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ''
      )
    );

    // Helper functions
    const formatPrice = () => {
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
      return parking === "yes" || parking === "included" ? "Parking" : "";
    };

    const listingUrl = `${siteUrl}/listing/${listing.id}`;
    const ownerDisplay = listing.owner?.role === "agent" && listing.owner?.agency
      ? listing.owner.agency
      : "Owner";
    const hasParking = getParkingDisplay(listing.parking);

    // Build email HTML
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #f9fafb; padding: 20px;">
        <div style="background: #1e4a74; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Hadirot</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.9;">New Approved Listing</p>
        </div>

        <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="margin: 0 0 8px 0; color: #1e4a74; font-size: 20px;">Listing Approved</h2>
          <p style="margin: 0 0 30px 0; color: #6b7280;">
            A new listing has been approved. See attached image for the listing card.
          </p>

          <div style="margin-bottom: 40px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background: white;">
            <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: bold; color: #1e4a74;">${formatPrice()}</h2>

            <div style="margin-bottom: 12px; color: #4b5563; font-size: 14px;">
              🛏️ ${getBedroomDisplay(listing.bedrooms)} |
              🛁 ${listing.bathrooms} bath${hasParking ? ' | 🅿️ ' + hasParking : ''} |
              <span style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px;">${listing.broker_fee ? "Broker Fee" : "No Fee"}</span>
            </div>

            <div style="margin-bottom: 12px; color: #4b5563; font-size: 14px;">
              📍 ${listing.neighborhood ? `${listing.neighborhood}, ${listing.location}` : listing.location}
            </div>

            <div style="margin-bottom: 16px; padding: 12px; background: #f0f9ff; border-left: 4px solid #25D366; border-radius: 4px;">
              <p style="margin: 0 0 8px 0; font-weight: 600; color: #333;">Join the Hadirot WhatsApp Community:</p>
              <a href="${whatsappLink}" style="color: #25D366; text-decoration: none; font-weight: 500;">${whatsappLink}</a>
            </div>

            <a href="${listingUrl}" style="display: inline-block; background: #1e4a74; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              View Listing
            </a>

            <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
              Posted by ${ownerDisplay}${listing.is_featured ? ' <span style="background: #7CB342; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">FEATURED</span>' : ''}
            </div>

            <div style="margin-top: 8px; font-size: 11px; color: #9ca3af;">
              📎 See attached image: listing-${listing.id}.png
            </div>
          </div>

          <div style="margin-top: 40px; padding-top: 30px; border-top: 2px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
            <p style="margin: 0;">© ${new Date().getFullYear()} Hadirot. All rights reserved.</p>
          </div>
        </div>
      </div>
    `;

    // Send email with attachment
    const zeptoFromAddress = Deno.env.get("ZEPTO_FROM_ADDRESS") || "noreply@hadirot.com";
    const zeptoFromName = Deno.env.get("ZEPTO_FROM_NAME") || "HaDirot";

    console.log(`📤 Sending email to ${adminEmails.length} admin(s) with attachment`);

    await sendViaZepto({
      to: adminEmails,
      subject: `New Approved Listing - ${listing.title}`,
      html: emailHtml,
      from: zeptoFromAddress,
      fromName: zeptoFromName,
      attachments: [{
        content: base64Image,
        mime_type: "image/png",
        name: `listing-${listing.id}.png`,
      }],
    });

    console.log("✅ Email sent successfully");

    return new Response(
      JSON.stringify({
        success: true,
        listingId: listing.id,
        adminCount: adminEmails.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error sending manual listing email:", error);
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
