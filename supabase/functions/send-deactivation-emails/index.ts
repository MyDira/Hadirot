import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { renderBrandEmail } from "../_shared/zepto.ts";

interface DeactivatedListing {
  id: string;
  title: string;
  user_id: string;
  deactivated_at: string;
  last_published_at: string;
  last_deactivation_email_sent_at: string | null;
  owner_email: string;
  owner_name: string;
  is_commercial: boolean;
  commercial_space_type?: string;
  full_address?: string;
}

function formatSpaceType(raw: string): string {
  const map: Record<string, string> = {
    storefront: "Retail",
    retail: "Retail",
    restaurant: "Restaurant",
    office: "Office",
    warehouse: "Warehouse",
    medical: "Medical",
    flex: "Flex Space",
    industrial: "Industrial",
    mixed_use: "Mixed Use",
    coworking: "Coworking",
    gallery: "Gallery",
    event_space: "Event Space",
  };
  return map[raw?.toLowerCase()] ?? (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Commercial");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const { data: residentialListings, error: residentialError } = await supabaseAdmin
      .from("listings")
      .select(`
        id,
        title,
        user_id,
        deactivated_at,
        last_published_at,
        last_deactivation_email_sent_at,
        profiles!inner(
          email,
          full_name
        )
      `)
      .eq("is_active", false)
      .not("deactivated_at", "is", null)
      .or("last_deactivation_email_sent_at.is.null,last_deactivation_email_sent_at.lt.deactivated_at");

    if (residentialError) {
      console.error("Error querying deactivated residential listings:", residentialError);
      return new Response(
        JSON.stringify({ error: "Failed to query deactivated listings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: commercialListings, error: commercialError } = await supabaseAdmin
      .from("commercial_listings")
      .select("id, title, user_id, deactivated_at, last_published_at, last_deactivation_email_sent_at, commercial_space_type, full_address")
      .eq("is_active", false)
      .not("deactivated_at", "is", null)
      .or("last_deactivation_email_sent_at.is.null,last_deactivation_email_sent_at.lt.deactivated_at");

    if (commercialError) {
      console.error("Error querying deactivated commercial listings:", commercialError);
    }

    const residentialMapped: DeactivatedListing[] = (residentialListings ?? []).map((listing: any) => ({
      id: listing.id,
      title: listing.title,
      user_id: listing.user_id,
      deactivated_at: listing.deactivated_at,
      last_published_at: listing.last_published_at,
      last_deactivation_email_sent_at: listing.last_deactivation_email_sent_at,
      owner_email: listing.profiles.email,
      owner_name: listing.profiles.full_name,
      is_commercial: false,
    }));

    const commercialRaw = commercialListings ?? [];
    const commercialUserIds = [...new Set(commercialRaw.map((l: any) => l.user_id))];

    const profileMap: Record<string, { email: string; full_name: string }> = {};
    if (commercialUserIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .in("id", commercialUserIds);
      for (const p of profiles ?? []) {
        profileMap[p.id] = { email: p.email, full_name: p.full_name };
      }
    }

    const commercialMapped: DeactivatedListing[] = commercialRaw
      .filter((l: any) => profileMap[l.user_id])
      .map((l: any) => ({
        id: l.id,
        title: l.title ?? (l.full_address ? `Commercial at ${l.full_address}` : "Commercial Listing"),
        user_id: l.user_id,
        deactivated_at: l.deactivated_at,
        last_published_at: l.last_published_at,
        last_deactivation_email_sent_at: l.last_deactivation_email_sent_at,
        owner_email: profileMap[l.user_id].email,
        owner_name: profileMap[l.user_id].full_name,
        is_commercial: true,
        commercial_space_type: l.commercial_space_type,
        full_address: l.full_address,
      }));

    const listingsToEmail: DeactivatedListing[] = [...residentialMapped, ...commercialMapped];

    console.log(`Found ${listingsToEmail.length} listings needing deactivation emails (${residentialMapped.length} residential, ${commercialMapped.length} commercial)`);

    let emailsSent = 0;
    let emailsSkipped = 0;
    let emailErrors = 0;

    for (const listing of listingsToEmail) {
      try {
        const publishedDate = new Date(listing.last_published_at);
        const deactivatedDate = new Date(listing.deactivated_at);
        const daysSincePublished = (deactivatedDate.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
        const isAutomaticDeactivation = daysSincePublished >= 29;

        let listingLabel: string;
        if (listing.is_commercial) {
          const spaceType = formatSpaceType(listing.commercial_space_type ?? "");
          const location = listing.full_address ? ` at ${listing.full_address}` : "";
          listingLabel = `${spaceType}${location}`;
        } else {
          listingLabel = `"${listing.title}"`;
        }

        let emailHtml: string;
        let emailSubject: string;

        if (isAutomaticDeactivation) {
          emailHtml = renderBrandEmail({
            title: "Your Listing Has Expired",
            intro: `Your listing ${listingLabel} has expired and is no longer visible to potential ${listing.is_commercial ? "tenants or buyers" : "tenants"}.`,
            bodyHtml: `
              <p>Don't worry - you can easily renew your listing to make it active again.</p>
              <p>Simply log in to your dashboard to manage your listings and extend the expiration date.</p>
            `,
            ctaLabel: "Renew My Listing",
            ctaHref: "https://hadirot.com/dashboard",
          });
          emailSubject = listing.is_commercial
            ? `Your ${listingLabel} listing has expired on HaDirot`
            : `Your listing ${listingLabel} has expired on HaDirot`;
        } else {
          emailHtml = renderBrandEmail({
            title: "Listing Deactivation Confirmed",
            intro: `Your listing ${listingLabel} has been deactivated.`,
            bodyHtml: `
              <p>Your listing is no longer visible to potential ${listing.is_commercial ? "tenants or buyers" : "tenants"}.</p>
              <p>You can reactivate it anytime from your dashboard.</p>
            `,
            ctaLabel: "Manage My Listings",
            ctaHref: "https://hadirot.com/dashboard",
          });
          emailSubject = listing.is_commercial
            ? `Listing deactivated: ${listingLabel} - HaDirot`
            : `Listing deactivated: ${listingLabel} - HaDirot`;
        }

        const { error: emailError } = await supabaseAdmin.functions.invoke(
          "send-email",
          {
            body: {
              to: listing.owner_email,
              subject: emailSubject,
              html: emailHtml,
              type: "general",
            },
          },
        );

        if (emailError) {
          console.error(`Error sending email for listing ${listing.id}:`, emailError);
          emailErrors++;
          continue;
        }

        const table = listing.is_commercial ? "commercial_listings" : "listings";
        const { error: updateError } = await supabaseAdmin
          .from(table)
          .update({ last_deactivation_email_sent_at: new Date().toISOString() })
          .eq("id", listing.id);

        if (updateError) {
          console.error(`Error updating email timestamp for listing ${listing.id}:`, updateError);
          emailErrors++;
          continue;
        }

        emailsSent++;
        console.log(`Email sent for ${listing.is_commercial ? "commercial" : "residential"} listing ${listing.id}`);

      } catch (error) {
        console.error(`Unexpected error processing listing ${listing.id}:`, error);
        emailErrors++;
      }
    }

    const summary = {
      listingsEvaluated: listingsToEmail.length,
      residentialEvaluated: residentialMapped.length,
      commercialEvaluated: commercialMapped.length,
      emailsSent,
      emailsSkipped,
      emailErrors,
      timestamp: new Date().toISOString(),
    };

    console.log("Deactivation email job completed:", summary);

    return new Response(
      JSON.stringify({ success: true, summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error) {
    console.error("Unexpected error in send-deactivation-emails function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
