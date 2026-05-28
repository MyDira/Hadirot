// Create a Stripe Checkout session for an Agent ($50/mo) or VIP ($100/mo)
// listing subscription, optionally bundled with the Concierge add-on ($50/mo).
//
// Inputs:
//   - plan: 'agent' | 'vip'
//   - include_concierge_addon: boolean
//
// Output: { url, session_id }
//
// Webhook:
//   - On checkout.session.completed with metadata.type='listing_subscription',
//     stripe-webhook creates the listing_subscriptions row + optional
//     concierge_subscriptions(tier='addon_concierge') row.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { corsHeaders } from "../_shared/cors.ts";
import { LISTING_SUBSCRIPTION_PRICES } from "../_shared/stripe-prices.ts";

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

    const { plan, include_concierge_addon } = await req.json() as {
      plan?: "agent" | "vip";
      include_concierge_addon?: boolean;
    };

    if (plan !== "agent" && plan !== "vip") {
      return new Response(JSON.stringify({ error: "Invalid plan (must be 'agent' or 'vip')" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Block if user already has an active listing subscription.
    const { data: existingSub } = await supabaseAdmin
      .from("listing_subscriptions")
      .select("id, plan, status")
      .eq("user_id", user.id)
      .in("status", ["active", "admin_active", "past_due", "pending"])
      .limit(1)
      .maybeSingle();

    if (existingSub) {
      return new Response(JSON.stringify({
        error: `You already have a ${existingSub.plan} subscription (${existingSub.status}). Cancel it via the customer portal before subscribing to a new plan.`,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    // Ensure a Stripe customer.
    let stripeCustomerId = callerProfile?.stripe_customer_id || "";
    if (!stripeCustomerId) {
      const existing = await stripe.customers.list({ email: user.email!, limit: 1 });
      if (existing.data.length > 0) {
        stripeCustomerId = existing.data[0].id;
      } else {
        const created = await stripe.customers.create({
          email: user.email!,
          name: callerProfile?.full_name || undefined,
          metadata: { supabase_user_id: user.id },
        });
        stripeCustomerId = created.id;
      }
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", user.id);
    }

    const lineItems: Array<{ price: string; quantity: number }> = [
      { price: LISTING_SUBSCRIPTION_PRICES[plan], quantity: 1 },
    ];
    if (include_concierge_addon) {
      lineItems.push({ price: LISTING_SUBSCRIPTION_PRICES.addon_concierge, quantity: 1 });
    }

    const origin = req.headers.get("origin") || "https://hadirot.com";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: lineItems,
      metadata: {
        type: "listing_subscription",
        user_id: user.id,
        plan,
        include_concierge_addon: include_concierge_addon ? "true" : "false",
      },
      subscription_data: {
        metadata: {
          type: "listing_subscription",
          user_id: user.id,
          plan,
          include_concierge_addon: include_concierge_addon ? "true" : "false",
        },
      },
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard?subscription=success`,
      cancel_url: `${origin}/dashboard?subscription=cancelled`,
    });

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-listing-subscription-checkout error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
