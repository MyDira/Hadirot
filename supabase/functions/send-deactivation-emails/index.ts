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
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("🔄 Starting deactivation email notification job...");

    // Create Supabase admin client
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

    // Query for listings that need deactivation emails
    const { data: deactivatedListings, error: queryError } = await supabaseAdmin
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

    if (queryError) {
      console.error("❌ Error querying deactivated listings:", queryError);
      return new Response(
        JSON.stringify({ error: "Failed to query deactivated listings" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const listingsToEmail = (deactivatedListings || []).map((listing: any) => ({
      id: listing.id,
      title: listing.title,
      user_id: listing.user_id,
      deactivated_at: listing.deactivated_at,
      last_published_at: listing.last_published_at,
      last_deactivation_email_sent_at: listing.last_deactivation_email_sent_at,
      owner_email: listing.profiles.email,
      owner_name: listing.profiles.full_name,
    })) as DeactivatedListing[];

    console.log(`📊 Found ${listingsToEmail.length} listings needing deactivation emails`);

    let emailsSent = 0;
    let emailsSkipped = 0;
    let emailErrors = 0;

    // Process each listing
    for (const listing of listingsToEmail) {
      try {
        console.log(`📧 Processing listing: ${listing.title} (${listing.id})`);

        // Determine if this was an automatic or manual deactivation
        // Automatic: deactivated_at is approximately 30 days after last_published_at
        // Manual: deactivated_at is significantly before that 30-day mark
        const publishedDate = new Date(listing.last_published_at);
        const deactivatedDate = new Date(listing.deactivated_at);
        const daysSincePublished = (deactivatedDate.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);

        // If listing was deactivated 29+ days after publishing, consider it automatic
        const isAutomaticDeactivation = daysSincePublished >= 29;

        let emailHtml: string;
        let emailSubject: string;

        if (isAutomaticDeactivation) {
          // Automatic expiration email
          console.log(`  → Automatic deactivation detected (${Math.round(daysSincePublished)} days old)`);
          emailHtml = renderBrandEmail({
            title: "Your Listing Has Expired",
            intro: `Your listing "${listing.title}" has expired and is no longer visible to potential tenants.`,
            bodyHtml: `
              <p>Don't worry - you can easily renew your listing to make it active again.</p>
              <p>Simply log in to your dashboard to manage your listings and extend the expiration date.</p>
            `,
            ctaLabel: "Renew My Listing",
            ctaHref: "https://hadirot.com/dashboard",
          });
          emailSubject = `Your listing "${listing.title}" has expired on HaDirot`;
        } else {
          // Manual deactivation confirmation email
          console.log(`  → Manual deactivation detected (${Math.round(daysSincePublished)} days old)`);
          emailHtml = renderBrandEmail({
            title: "Listing Deactivation Confirmed",
            intro: `Your listing "${listing.title}" has been deactivated.`,
            bodyHtml: `
              <p>Your listing is no longer visible to potential tenants.</p>
              <p>You can reactivate it anytime from your dashboard.</p>
            `,
            ctaLabel: "Manage My Listings",
            ctaHref: "https://hadirot.com/dashboard",
          });
          emailSubject = `Listing deactivated: "${listing.title}" - HaDirot`;
        }

        // Send email via existing send-email function
        const { data: emailResult, error: emailError } = await supabaseAdmin.functions.invoke(
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
          console.error(`❌ Error sending email for listing ${listing.id}:`, emailError);
          emailErrors++;
          continue;
        }

        console.log(`✅ Email sent successfully for listing ${listing.id}`);

        // Update the listing to record that email was sent
        const { error: updateError } = await supabaseAdmin
          .from("listings")
          .update({
            last_deactivation_email_sent_at: new Date().toISOString(),
          })
          .eq("id", listing.id);

        if (updateError) {
          console.error(`❌ Error updating email timestamp for listing ${listing.id}:`, updateError);
          emailErrors++;
          continue;
        }

        emailsSent++;
        console.log(`📝 Updated email timestamp for listing ${listing.id}`);

      } catch (error) {
        console.error(`❌ Unexpected error processing listing ${listing.id}:`, error);
        emailErrors++;
      }
    }

    const summary = {
      listingsEvaluated: listingsToEmail.length,
      emailsSent,
      emailsSkipped,
      emailErrors,
      timestamp: new Date().toISOString(),
    };

    console.log("📈 Deactivation email job completed:", summary);

    return new Response(
      JSON.stringify({
        success: true,
        summary,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );

  } catch (error) {
    console.error("❌ Unexpected error in send-deactivation-emails function:", error);

    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});