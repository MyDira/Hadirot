import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendViaZepto } from "../_shared/zepto.ts";
import { generateDailyDigestEmail, DigestListing } from "../_shared/dailyDigestTemplate.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("🚀 Starting daily digest email process");

  const logId = crypto.randomUUID();
  let listingsCount = 0;
  let recipientsCount = 0;

  try {
    // Create admin Supabase client
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
      await logDigestRun(supabaseAdmin, 0, 0, true, "No admin users found");
      return new Response(
        JSON.stringify({ success: true, message: "No admin users to send to" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get admin emails from auth.users
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
      await logDigestRun(supabaseAdmin, 0, 0, true, "No admin emails found");
      return new Response(
        JSON.stringify({ success: true, message: "No admin emails found" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    recipientsCount = adminEmails.length;
    console.log(`✅ Found ${recipientsCount} admin recipient(s)`);

    // Get listings from last 24 hours that haven't been sent yet
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // First, get IDs of listings already sent in digests
    const { data: sentListings, error: sentError } = await supabaseAdmin
      .from("daily_digest_sent_listings")
      .select("listing_id");

    if (sentError) {
      console.error("❌ Error fetching sent listings:", sentError);
      throw sentError;
    }

    const sentListingIds = new Set(sentListings?.map(sl => sl.listing_id) || []);
    console.log(`📋 ${sentListingIds.size} listing(s) already sent in previous digests`);

    // Get new listings from last 24 hours
    const { data: newListings, error: listingsError } = await supabaseAdmin
      .from("listings")
      .select(`
        id,
        price,
        call_for_price,
        bedrooms,
        bathrooms,
        parking,
        broker_fee,
        location,
        neighborhood,
        created_at,
        owner:profiles!listings_user_id_fkey(role, agency)
      `)
      .eq("is_active", true)
      .eq("status", "approved")
      .gte("created_at", twentyFourHoursAgo)
      .order("created_at", { ascending: false });

    if (listingsError) {
      console.error("❌ Error fetching listings:", listingsError);
      throw listingsError;
    }

    // Filter out already-sent listings
    const unseenListings = newListings?.filter(
      listing => !sentListingIds.has(listing.id)
    ) || [];

    console.log(`📊 Found ${newListings?.length || 0} new listing(s) in last 24h`);
    console.log(`✨ ${unseenListings.length} listing(s) not yet sent in digest`);

    if (unseenListings.length === 0) {
      console.log("⚠️ No new unsent listings to include in digest");
      await logDigestRun(supabaseAdmin, 0, recipientsCount, true, "No new listings");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No new listings to send",
          recipientsCount,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    listingsCount = unseenListings.length;

    // Format listings for email
    const formattedListings: DigestListing[] = unseenListings.map(listing => ({
      id: listing.id,
      price: listing.price,
      call_for_price: listing.call_for_price,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      parking: listing.parking,
      broker_fee: listing.broker_fee,
      location: listing.location,
      neighborhood: listing.neighborhood,
      owner: listing.owner,
    }));

    // Generate email
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";
    const whatsappLink = "https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt";

    const emailHtml = generateDailyDigestEmail(formattedListings, siteUrl, whatsappLink);

    // Send email
    const zeptoFromAddress = Deno.env.get("ZEPTO_FROM_ADDRESS") || "noreply@hadirot.com";
    const zeptoFromName = Deno.env.get("ZEPTO_FROM_NAME") || "HaDirot";

    console.log(`📤 Sending digest to ${recipientsCount} admin(s) with ${listingsCount} listing(s)`);

    await sendViaZepto({
      to: adminEmails,
      subject: `Hadirot Daily Digest - ${listingsCount} New Listing${listingsCount !== 1 ? "s" : ""}`,
      html: emailHtml,
      from: zeptoFromAddress,
      fromName: zeptoFromName,
    });

    console.log("✅ Email sent successfully");

    // Record sent listings
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const sentRecords = unseenListings.map(listing => ({
      listing_id: listing.id,
      digest_date: today,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("daily_digest_sent_listings")
      .insert(sentRecords);

    if (insertError) {
      console.error("⚠️ Error recording sent listings:", insertError);
      // Don't throw - email was sent successfully
    } else {
      console.log(`✅ Recorded ${listingsCount} listing(s) as sent`);
    }

    // Log successful run
    await logDigestRun(supabaseAdmin, listingsCount, recipientsCount, true);

    return new Response(
      JSON.stringify({
        success: true,
        listingsCount,
        recipientsCount,
        message: "Digest sent successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error in daily digest:", error);

    // Try to log the error
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

      await logDigestRun(
        supabaseAdmin,
        listingsCount,
        recipientsCount,
        false,
        error instanceof Error ? error.message : String(error)
      );
    } catch (logError) {
      console.error("❌ Failed to log error:", logError);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to send daily digest",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function logDigestRun(
  supabase: any,
  listingsCount: number,
  recipientsCount: number,
  success: boolean,
  errorMessage?: string
) {
  try {
    await supabase.from("daily_digest_logs").insert({
      listings_count: listingsCount,
      recipients_count: recipientsCount,
      success,
      error_message: errorMessage || null,
    });
  } catch (error) {
    console.error("❌ Failed to log digest run:", error);
  }
}
