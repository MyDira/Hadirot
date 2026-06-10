// Create a Stripe Checkout session for an individual residential-rental listing
// one-off payment ($25/$15 base, $40/$30 60d, ..., $190/$180 360d).
//
// Inputs:
//   - listing_id
//   - days: one of 30, 60, 90, 120, 180, 270, 360
//   - is_initial_purchase: true ONLY when called from the post-listing wizard
//     at posting time. The webhook uses this flag (combined with "no prior
//     payments for this listing") to decide whether to grant the 30-bonus-days
//     sweetener.
//
// Pricing:
//   - 0 prior paid_listing_payments rows → first-time pricing.
//   - ≥1 prior → renewal pricing (cheaper).
//   - Pricing table lives in _shared/stripe-prices.ts.
//
// Webhook:
//   - On checkout.session.completed with metadata.type='individual_listing',
//     stripe-webhook inserts paid_listing_payments and updates the listing.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { corsHeaders } from "../_shared/cors.ts";
import { INDIVIDUAL_LISTING_PACKAGES } from "../_shared/stripe-prices.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY")!, {
  apiVersion: "2023-10-16",
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { listing_id, days, is_initial_purchase } = body as {
      listing_id?: string;
      days?: number;
      is_initial_purchase?: boolean;
    };

    if (!listing_id || !days) {
      return new Response(JSON.stringify({ error: "Missing listing_id or days" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pkg = INDIVIDUAL_LISTING_PACKAGES.find((p) => p.days === days);
    if (!pkg) {
      return new Response(JSON.stringify({ error: "Invalid days package" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up listing + check ownership/admin.
    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id, user_id, listing_type, contact_phone, neighborhood, location, price, payment_kind")
      .eq("id", listing_id)
      .maybeSingle();

    if (listingError || !listing) {
      return new Response(JSON.stringify({ error: "Listing not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();
    const isAdmin = callerProfile?.is_admin === true;

    if (!isAdmin && listing.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The charge always belongs to the LISTING OWNER — for admin-on-behalf
    // (an admin keying in the caller's card over the phone) the Stripe
    // customer / receipt must attach to the owner, not the admin. For
    // self-serve the owner === caller, so this is a no-op.
    const onBehalf = isAdmin && listing.user_id !== user.id;
    const { data: ownerProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, stripe_customer_id")
      .eq("id", listing.user_id)
      .maybeSingle();

    if (listing.listing_type !== "rental") {
      return new Response(JSON.stringify({ error: "Only residential rentals can be paid individually" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pricing: first-time vs renewal based on count of prior paid_listing_payments rows.
    const { count: priorCount, error: countError } = await supabaseAdmin
      .from("paid_listing_payments")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", listing_id);

    if (countError) {
      console.error("Error counting prior payments:", countError);
      return new Response(JSON.stringify({ error: "Pricing lookup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isFirstPayment = (priorCount ?? 0) === 0;
    const amountCents = isFirstPayment ? pkg.first_time_cents : pkg.renewal_cents;

    // Ensure a Stripe customer for the LISTING OWNER.
    const ownerEmail = ownerProfile?.email || (onBehalf ? undefined : user.email) || undefined;
    let stripeCustomerId = ownerProfile?.stripe_customer_id || "";
    if (!stripeCustomerId) {
      if (ownerEmail) {
        const existing = await stripe.customers.list({ email: ownerEmail, limit: 1 });
        if (existing.data.length > 0) stripeCustomerId = existing.data[0].id;
      }
      if (!stripeCustomerId) {
        const created = await stripe.customers.create({
          email: ownerEmail,
          name: ownerProfile?.full_name || undefined,
          metadata: { supabase_user_id: listing.user_id },
        });
        stripeCustomerId = created.id;
      }
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", listing.user_id);
    }

    const origin = req.headers.get("origin") || "https://hadirot.com";

    // Build a friendly product description for the Stripe receipt.
    const locationDesc = listing.neighborhood || listing.location || "Hadirot listing";
    const priceStr = listing.price ? `$${listing.price.toLocaleString()}/mo` : "Call for price";
    const productName = `Hadirot listing · ${days} days · ${locationDesc} (${priceStr})`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: productName,
          },
        },
        quantity: 1,
      }],
      metadata: {
        type: "individual_listing",
        listing_id,
        user_id: listing.user_id,
        days: String(days),
        is_initial_purchase: is_initial_purchase ? "true" : "false",
        is_first_payment: isFirstPayment ? "true" : "false",
        ...(onBehalf ? { charged_by_admin_id: user.id } : {}),
      },
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard?listing=${listing_id}&payment=success`,
      cancel_url: `${origin}/dashboard?listing=${listing_id}&payment=cancelled`,
    });

    return new Response(JSON.stringify({
      url: session.url,
      session_id: session.id,
      amount_cents: amountCents,
      days,
      is_first_payment: isFirstPayment,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-individual-listing-checkout error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
