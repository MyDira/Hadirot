// Upgrade an existing Agent ($50/mo) listing subscription to VIP ($100/mo)
// WITHOUT a fresh checkout. The user pays only the prorated difference
// (~$50/mo) for the remainder of the current billing cycle, not a new $100.
//
// How it works:
//   - Stripe-backed subscription: stripe.subscriptions.update() swaps the
//     Agent price line item to the VIP price with proration_behavior:
//     'always_invoice'. Stripe credits the unused Agent portion and immediately
//     invoices the prorated VIP difference, charging the card on file now.
//   - Admin-granted (manual, no Stripe subscription): just flips plan/cap in
//     the DB — there's no Stripe object to prorate.
//
// The listing_subscriptions row (plan='vip', listing_cap=NULL) is updated
// optimistically here AND again via the stripe-webhook
// customer.subscription.updated handler (which derives plan from the price id),
// so the two converge.
//
// Input:  { } (or { plan: 'vip' } — only agent→vip is supported today)
// Output: { upgraded: true, prorated: boolean, manual: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { corsHeaders } from "../_shared/cors.ts";
import { LISTING_SUBSCRIPTION_PRICES } from "../_shared/stripe-prices.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY")!, {
  apiVersion: "2023-10-16",
});

const ACTIVE_STATUSES = ["active", "admin_active", "past_due", "trial"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as { plan?: "vip" };
    const targetPlan = body.plan ?? "vip";
    if (targetPlan !== "vip") {
      return json({ error: "Only upgrades to 'vip' are supported." }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find the caller's active listing subscription.
    const { data: sub } = await supabaseAdmin
      .from("listing_subscriptions")
      .select("id, plan, status, stripe_subscription_id")
      .eq("user_id", user.id)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub) {
      return json({ error: "You don't have an active subscription to upgrade." }, 404);
    }
    if (sub.plan === "vip") {
      return json({ error: "You're already on the VIP plan." }, 409);
    }
    if (sub.plan !== "agent") {
      return json({ error: `Can't upgrade a '${sub.plan}' subscription.` }, 400);
    }

    const dbUpdate = {
      plan: "vip",
      listing_cap: null,
      updated_at: new Date().toISOString(),
    };

    // Manual / admin-granted (comped) subscription: there's no card on file and
    // no Stripe object to prorate. We do NOT free-flip these to VIP — that would
    // hand out an unlimited plan for free. The client converts these users into
    // real paying VIP subscribers via Stripe Checkout instead (the webhook then
    // supersedes this comp row). Reject here so this can't be used as a
    // free-upgrade loophole.
    if (!sub.stripe_subscription_id) {
      return json({
        error:
          "This is a complimentary admin-managed plan. To move to VIP, start a paid VIP subscription through checkout.",
        requires_checkout: true,
      }, 409);
    }

    // Stripe-backed: swap the Agent price item to the VIP price with proration.
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const agentPriceId = LISTING_SUBSCRIPTION_PRICES.agent;
    const vipPriceId = LISTING_SUBSCRIPTION_PRICES.vip;

    const agentItem = stripeSub.items.data.find((it) => it.price.id === agentPriceId);
    if (!agentItem) {
      return json({
        error: "Couldn't find the Agent plan line item on your Stripe subscription.",
      }, 422);
    }

    // 'always_invoice' immediately invoices + charges the prorated difference,
    // so the user pays only the delta now (not a fresh $100).
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: agentItem.id, price: vipPriceId }],
      proration_behavior: "always_invoice",
      metadata: {
        ...(stripeSub.metadata || {}),
        plan: "vip",
      },
    });

    // Optimistic DB sync (webhook customer.subscription.updated will reconcile).
    const { error: updErr } = await supabaseAdmin
      .from("listing_subscriptions")
      .update(dbUpdate)
      .eq("id", sub.id);
    if (updErr) {
      console.error("Stripe upgraded but DB sync failed (webhook will retry):", updErr);
    }

    console.log(`Subscription ${sub.id} upgraded agent -> vip via Stripe proration.`);
    return json({ upgraded: true, prorated: true, manual: false });
  } catch (error) {
    console.error("upgrade-listing-subscription error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
