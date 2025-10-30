import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendViaZepto, renderBrandEmail } from "../_shared/zepto.ts";

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
  cross_streets: string | null;
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
    console.log("📧 Starting daily admin digest email job");

    let force = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        force = body.force === true;
      } catch {
        // Ignore JSON parse errors
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

    const { data: config, error: configError } = await supabaseAdmin
      .from("daily_admin_digest_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (configError) {
      console.error("❌ Error fetching config:", configError);
      throw configError;
    }

    if (!force && (!config || !config.enabled)) {
      console.log("⏸️ Daily digest is disabled");
      return new Response(
        JSON.stringify({ message: "Daily digest is disabled" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (force) {
      console.log("🔧 Force parameter set - bypassing enabled check");
    }

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
        cross_streets,
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
      console.error("❌ Error fetching listings:", listingsError);
      throw listingsError;
    }

    if (!listings || listings.length === 0) {
      console.log("ℹ️ No new approved listings in last 24 hours");

      await supabaseAdmin.from("daily_admin_digest_logs").insert({
        run_at: new Date().toISOString(),
        listings_count: 0,
        recipients_count: adminEmails.length,
        success: true,
        error_message: "No new listings to send",
      });

      return new Response(
        JSON.stringify({ message: "No new approved listings in last 24 hours" }),
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
      console.log("ℹ️ All listings already sent within past 7 days");

      await supabaseAdmin.from("daily_admin_digest_logs").insert({
        run_at: new Date().toISOString(),
        listings_count: 0,
        recipients_count: adminEmails.length,
        success: true,
        error_message: "All listings already sent within 7 days",
      });

      return new Response(
        JSON.stringify({ message: "All listings already sent within past 7 days" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📋 Found ${newListings.length} new listing(s) to send`);

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
      const leases: { [key: string]: string } = {
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
      const location = listing.cross_streets || listing.location;
      const locationWithNeighborhood = listing.neighborhood
        ? `${listing.neighborhood}, ${location}`
        : location;

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
      <div style="background-color:#F7F9FC;padding:20px;border-radius:8px;margin:20px 0;">
        <pre style="margin:0;font-family:monospace;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap;word-wrap:break-word;">${listingsTextContent}</pre>
      </div>
    `;

    const emailHtml = renderBrandEmail({
      title: `Daily Listing Digest - ${currentDate}`,
      bodyHtml,
    });

    console.log(`📤 Sending email to ${adminEmails.length} admin(s)`);

    await sendViaZepto({
      to: adminEmails,
      subject: `Daily Listing Digest - ${currentDate}`,
      html: emailHtml,
      fromName: "HaDirot Admin",
    });

    console.log("✅ Email sent successfully");

    const listingIds = newListings.map(l => l.id);
    const sentRecords = listingIds.map(id => ({
      listing_id: id,
      sent_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabaseAdmin
      .from("daily_admin_digest_sent_listings")
      .insert(sentRecords);

    if (insertError) {
      console.error("❌ Error recording sent listings:", insertError);
    } else {
      console.log(`✅ Recorded ${listingIds.length} sent listing(s)`);
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
    console.error("❌ Error in daily admin digest job:", error);

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
