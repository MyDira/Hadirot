import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY")!, {
  apiVersion: "2023-10-16",
});

const PRICE_MAP: Record<string, { priceId: string; amount: number; days: number }> = {
  "7day":  { priceId: "price_1SzMw9JvRPzH20A9CJA2SQ87", amount: 2500, days: 7 },
  "14day": { priceId: "price_1SzeDPJvRPzH20A9i8bj9rrN", amount: 4000, days: 14 },
  "30day": { priceId: "price_1SzMz3JvRPzH20A9pA8pBPwj", amount: 7500, days: 30 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { listing_id, plan } = await req.json();

    if (!listing_id || !plan) {
      return new Response(JSON.stringify({ error: "Missing listing_id or plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const planConfig = PRICE_MAP[plan];
    if (!planConfig) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id, user_id, title, is_featured, featured_expires_at, is_active")
      .eq("id", listing_id)
      .maybeSingle();

    if (listingError || !listing) {
      return new Response(JSON.stringify({ error: "Listing not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!listing.is_active) {
      return new Response(JSON.stringify({ error: "Listing is no longer active" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (
      listing.is_featured &&
      listing.featured_expires_at &&
      new Date(listing.featured_expires_at) > new Date()
    ) {
      return new Response(JSON.stringify({ error: "Listing is already featured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingPurchase } = await supabaseAdmin
      .from("featured_purchases")
      .select("id")
      .eq("listing_id", listing_id)
      .in("status", ["pending", "paid"])
      .limit(1)
      .maybeSingle();

    if (existingPurchase) {
      return new Response(
        JSON.stringify({ error: "A purchase is already pending for this listing" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const origin = req.headers.get("origin") || "https://hadirot.com";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      metadata: {
        listing_id,
        user_id: listing.user_id,
        plan,
        duration_days: String(planConfig.days),
        listing_title: (listing.title || "Listing").substring(0, 100),
        source: "sms_boost",
      },
      allow_promotion_codes: true,
      success_url: `${origin}/boost/success?listing_id=${listing_id}`,
      cancel_url: `${origin}/boost/${listing_id}?cancelled=true`,
    });

    await supabaseAdmin.from("featured_purchases").insert({
      listing_id,
      user_id: listing.user_id,
      stripe_checkout_session_id: session.id,
      plan,
      amount_cents: planConfig.amount,
      status: "pending",
      duration_days: planConfig.days,
    });

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating boost checkout:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
