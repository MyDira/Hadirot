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

    const { plan, include_concierge_addon, with_trial, target_user_id } = await req.json() as {
      plan?: "agent" | "vip";
      include_concierge_addon?: boolean;
      /** When true, attach Stripe's 14-day trial_period_days. User's card is collected
       *  but not charged until the trial ends. */
      with_trial?: boolean;
      /** Admin-only: subscribe on behalf of this user (admin keys the caller's card).
       *  The Stripe customer / subscription attach to the target, not the admin. */
      target_user_id?: string;
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

    // Resolve the subscription OWNER. For admin-on-behalf the owner is
    // target_user_id; otherwise it's the caller.
    let ownerId = user.id;
    let onBehalf = false;
    if (target_user_id && target_user_id !== user.id) {
      const { data: callerAdmin } = await supabaseAdmin
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (callerAdmin?.is_admin !== true) {
        return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      ownerId = target_user_id;
      onBehalf = true;
    }

    // Block if the OWNER already has an active listing subscription — EXCEPT a
    // complimentary admin-granted (comp) one with no Stripe object. Those users
    // are allowed to convert to a real paid plan through checkout; the
    // stripe-webhook supersedes (cancels) the comp row when this checkout
    // completes, so they don't end up with two active rows.
    const { data: existingSub } = await supabaseAdmin
      .from("listing_subscriptions")
      .select("id, plan, status, stripe_subscription_id")
      .eq("user_id", ownerId)
      .in("status", ["active", "admin_active", "past_due", "pending"])
      .limit(1)
      .maybeSingle();

    const isCompConversion = !!existingSub && !existingSub.stripe_subscription_id;

    if (existingSub && !isCompConversion) {
      return new Response(JSON.stringify({
        error: onBehalf
          ? `This user already has a ${existingSub.plan} subscription (${existingSub.status}). Cancel it before subscribing to a new plan.`
          : `You already have a ${existingSub.plan} subscription (${existingSub.status}). Cancel it via the customer portal before subscribing to a new plan.`,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ownerProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, stripe_customer_id")
      .eq("id", ownerId)
      .maybeSingle();

    const ownerEmail = ownerProfile?.email || (onBehalf ? undefined : user.email) || undefined;

    // Ensure a Stripe customer for the OWNER.
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
          metadata: { supabase_user_id: ownerId },
        });
        stripeCustomerId = created.id;
      }
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", ownerId);
    }

    const lineItems: Array<{ price: string; quantity: number }> = [
      { price: LISTING_SUBSCRIPTION_PRICES[plan], quantity: 1 },
    ];
    if (include_concierge_addon) {
      lineItems.push({ price: LISTING_SUBSCRIPTION_PRICES.addon_concierge, quantity: 1 });
    }

    const origin = req.headers.get("origin") || "https://hadirot.com";

    const isTrial = with_trial === true;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: lineItems,
      metadata: {
        type: "listing_subscription",
        user_id: ownerId,
        plan,
        include_concierge_addon: include_concierge_addon ? "true" : "false",
        with_trial: isTrial ? "true" : "false",
        ...(onBehalf ? { charged_by_admin_id: user.id } : {}),
      },
      subscription_data: {
        metadata: {
          type: "listing_subscription",
          user_id: ownerId,
          plan,
          include_concierge_addon: include_concierge_addon ? "true" : "false",
          with_trial: isTrial ? "true" : "false",
          ...(onBehalf ? { charged_by_admin_id: user.id } : {}),
        },
        // 14-day Stripe-managed trial. Card is collected at checkout, no charge
        // during trial, auto-charges on day 14 (or fails → past_due).
        ...(isTrial ? { trial_period_days: 14 } : {}),
      },
      // Force card capture during trial — gives us the commitment we want.
      payment_method_collection: "always",
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard?subscription=${isTrial ? "trial_started" : "success"}`,
      cancel_url: `${origin}/dashboard?subscription=cancelled`,
    });

    return new Response(JSON.stringify({
      url: session.url,
      session_id: session.id,
      with_trial: isTrial,
    }), {
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
