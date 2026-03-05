import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY")!, {
  apiVersion: "2023-10-16",
});

const TIER2_PRICE_ID = "price_1T5Tx4JvRPzH20A995RVffU5";
const TIER3_PRICE_ID = "price_1T5TybJvRPzH20A9GrEh0jTD";

function generateEmailHandle(fullName: string): string {
  const parts = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "user";
  let firstName = parts[0];
  if (firstName.length > 10) firstName = firstName.slice(0, 10);
  if (parts.length === 1) return firstName;
  const lastInitial = parts[parts.length - 1][0];
  return `${firstName}${lastInitial}`;
}

async function findUniqueHandle(
  supabaseAdmin: ReturnType<typeof createClient>,
  fullName: string,
): Promise<string> {
  const base = generateEmailHandle(fullName);
  const parts = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";

  const { data: existing } = await supabaseAdmin
    .from("concierge_subscriptions")
    .select("email_handle")
    .not("email_handle", "is", null);

  const taken = new Set((existing || []).map((r: { email_handle: string }) => r.email_handle));

  if (!taken.has(base)) return base;

  for (let i = 2; i <= lastName.length; i++) {
    const candidate = `${parts[0].length > 10 ? parts[0].slice(0, 10) : parts[0]}${lastName.slice(0, i)}`;
    if (!taken.has(candidate)) return candidate;
  }

  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}${n}`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${base}${Date.now().toString(36).slice(-4)}`;
}

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

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action } = await req.json();

    if (!action || !["upgrade", "downgrade", "cancel"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid action. Must be upgrade, downgrade, or cancel" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subscription, error: subError } = await supabaseAdmin
      .from("concierge_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .in("tier", ["tier2_forward", "tier3_vip"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) throw subError;

    if (!subscription) {
      return new Response(JSON.stringify({ error: "No active subscription found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upgrade") {
      if (subscription.tier === "tier3_vip") {
        return new Response(JSON.stringify({ error: "Already on VIP tier" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const stripeSubId = subscription.stripe_subscription_id;
      const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);

      await stripe.subscriptions.update(stripeSubId, {
        items: [{ id: stripeSub.items.data[0].id, price: TIER3_PRICE_ID }],
        proration_behavior: "create_prorations",
      });

      let emailHandle = subscription.email_handle;
      if (!emailHandle) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name, email")
          .eq("id", user.id)
          .maybeSingle();
        emailHandle = await findUniqueHandle(supabaseAdmin, profile?.full_name || profile?.email || "user");
      }

      const updateData: Record<string, unknown> = { tier: "tier3_vip" };
      if (!subscription.email_handle) updateData.email_handle = emailHandle;

      await supabaseAdmin
        .from("concierge_subscriptions")
        .update(updateData)
        .eq("id", subscription.id);

      return new Response(
        JSON.stringify({ success: true, tier: "tier3_vip", email_handle: emailHandle }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "downgrade") {
      if (subscription.tier === "tier2_forward") {
        return new Response(JSON.stringify({ error: "Already on Forward & Post tier" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const stripeSubId = subscription.stripe_subscription_id;
      const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);

      await stripe.subscriptions.update(stripeSubId, {
        items: [{ id: stripeSub.items.data[0].id, price: TIER2_PRICE_ID }],
        proration_behavior: "none",
      });

      await supabaseAdmin
        .from("concierge_subscriptions")
        .update({ tier: "tier2_forward" })
        .eq("id", subscription.id);

      return new Response(
        JSON.stringify({ success: true, tier: "tier2_forward", effective: "next_cycle" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "cancel") {
      const stripeSubId = subscription.stripe_subscription_id;
      const updatedSub = await stripe.subscriptions.update(stripeSubId, {
        cancel_at_period_end: true,
      });

      return new Response(
        JSON.stringify({ success: true, cancel_at: updatedSub.current_period_end }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("Error updating concierge subscription:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
