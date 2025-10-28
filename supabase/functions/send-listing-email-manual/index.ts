import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendViaZepto } from "../_shared/zepto.ts";
import { generateManualListingEmail } from "../_shared/manualEmailTemplate.ts";

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

    // Get primary image
    const sortedImages = listing.listing_images?.sort((a, b) => {
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      return a.sort_order - b.sort_order;
    });
    const primaryImage = sortedImages?.[0]?.image_url || "";

    // Generate email HTML using simple template
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";
    const whatsappLink = "https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt";
    const listingUrl = `${siteUrl}/listing/${listing.id}`;

    const emailHtml = generateManualListingEmail(
      {
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
        imageUrl: primaryImage,
        ownerName: listing.owner?.full_name,
        ownerRole: listing.owner?.role,
        ownerAgency: listing.owner?.agency,
        is_featured: listing.is_featured,
      },
      listingUrl,
      whatsappLink
    );

    // Send email without attachments (using embedded image)
    const zeptoFromAddress = Deno.env.get("ZEPTO_FROM_ADDRESS") || "noreply@hadirot.com";
    const zeptoFromName = Deno.env.get("ZEPTO_FROM_NAME") || "HaDirot";

    console.log(`📤 Sending email to ${adminEmails.length} admin(s)`);

    await sendViaZepto({
      to: adminEmails,
      subject: `New Approved Listing - ${listing.title}`,
      html: emailHtml,
      from: zeptoFromAddress,
      fromName: zeptoFromName,
    });

    console.log("✅ Email sent successfully");

    return new Response(
      JSON.stringify({
        success: true,
        listingId: listing.id,
        listingTitle: listing.title,
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
