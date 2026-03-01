import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY")!, {
  apiVersion: "2023-10-16",
});

const TIER_CONFIG: Record<string, { priceId: string; mode: "payment" | "subscription" }> = {
  tier1_quick: { priceId: "price_PLACEHOLDER_tier1", mode: "payment" },
  tier2_forward: { priceId: "price_PLACEHOLDER_tier2", mode: "subscription" },
  tier3_vip: { priceId: "price_PLACEHOLDER_tier3", mode: "subscription" },
};

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

    const { tier, blurb } = await req.json();

    if (!tier || !TIER_CONFIG[tier]) {
      return new Response(JSON.stringify({ error: "Invalid tier" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tier === "tier1_quick" && (!blurb || !blurb.trim())) {
      return new Response(JSON.stringify({ error: "Blurb is required for Quick Post" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, phone, agency, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    let stripeCustomerId = profile?.stripe_customer_id || "";

    if (!stripeCustomerId) {
      const existing = await stripe.customers.list({ email: user.email!, limit: 1 });
      if (existing.data.length > 0) {
        stripeCustomerId = existing.data[0].id;
      } else {
        const created = await stripe.customers.create({
          email: user.email!,
          name: profile?.full_name || undefined,
          metadata: { supabase_user_id: user.id },
        });
        stripeCustomerId = created.id;
      }
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", user.id);
    }

    const config = TIER_CONFIG[tier];
    const origin = req.headers.get("origin") || "https://hadirot.com";

    let emailHandle: string | null = null;
    if (tier === "tier2_forward") {
      emailHandle = await findUniqueHandle(supabaseAdmin, profile?.full_name || user.email || "user");
    }

    const metadata: Record<string, string> = {
      type: "concierge",
      tier,
      user_id: user.id,
    };
    if (tier === "tier1_quick") metadata.blurb = blurb.trim().slice(0, 500);
    if (emailHandle) metadata.email_handle = emailHandle;

    const session = await stripe.checkout.sessions.create({
      mode: config.mode,
      customer: stripeCustomerId,
      line_items: [{ price: config.priceId, quantity: 1 }],
      metadata,
      allow_promotion_codes: true,
      success_url: `${origin}/concierge/success?tier=${tier}&session_id={CHECKOUT_SESSION_ID}${emailHandle ? `&handle=${emailHandle}` : ""}`,
      cancel_url: `${origin}/concierge?cancelled=true`,
    });

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id, email_handle: emailHandle }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error creating concierge checkout:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
