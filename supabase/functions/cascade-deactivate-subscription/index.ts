// When a listing_subscriptions row transitions away from 'active'/'admin_active'
// (Stripe webhook says canceled/past_due, OR admin flips the row), deactivate all
// of the user's subscription-covered residential rentals.
//
// Triggered by:
//  - The Stripe webhook on customer.subscription.deleted/updated for listing_subscriptions
//  - The admin panel when cancelling a manual subscription
//
// Listings whose payment_kind is 'subscription' but who also have an active
// individual paid balance are NOT deactivated — they fall back to that balance.
// To represent this we set payment_kind = 'individual_paid' before deactivating
// the subscription (so the listing stays active under the paid balance).
//
// Listings with only 'subscription' payment_kind and no paid balance get
// is_active=false. The set_listing_deactivated_timestamp trigger fires and
// records deactivated_at.
//
// Idempotent — safe to call multiple times.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { reportError } from "../_shared/reportError.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, listing_subscription_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // Authorization: this function deactivates other users' listings, so only
    // the service role (stripe-webhook, cron) or an admin user may call it.
    const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (bearer !== serviceKey) {
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${bearer}` } } },
      );
      const { data: { user } } = await supabaseAuth.auth.getUser();
      const { data: callerProfile } = user
        ? await supabaseAdmin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle()
        : { data: null };
      if (callerProfile?.is_admin !== true) {
        return new Response(JSON.stringify({ error: "Forbidden: admin or service role only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Confirm the user has no OTHER covering subscription (paid, admin-granted,
    // in-trial, or in dunning grace). If they do, we don't cascade.
    const { data: stillCovered } = await supabaseAdmin
      .from("listing_subscriptions")
      .select("id")
      .eq("user_id", user_id)
      .in("status", ["active", "admin_active", "trial", "past_due"])
      .neq("id", listing_subscription_id || "00000000-0000-0000-0000-000000000000")
      .limit(1)
      .maybeSingle();

    if (stillCovered) {
      console.log(`User ${user_id} still has an active subscription; skipping cascade.`);
      return new Response(JSON.stringify({ success: true, cascaded: 0, reason: "still_covered" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find this user's subscription-covered residential rentals.
    const { data: listings, error: queryError } = await supabaseAdmin
      .from("listings")
      .select("id, payment_kind, paid_until, paused_paid_days")
      .eq("user_id", user_id)
      .eq("listing_type", "rental")
      .eq("payment_kind", "subscription")
      .eq("is_active", true);

    if (queryError) {
      console.error("Error querying subscription listings:", queryError);
      return new Response(JSON.stringify({ error: queryError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!listings || listings.length === 0) {
      return new Response(JSON.stringify({ success: true, cascaded: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Three outcomes per listing:
    //  - Still has a future paid_until (purchased before the subscription
    //    covered it) → fall back to individual_paid, keep the remaining window.
    //  - Has banked paid days → restore as individual_paid (listing stays active).
    //  - Neither → deactivate (set is_active=false).
    let restoredCount = 0;
    let deactivatedCount = 0;
    const nowIso = new Date().toISOString();

    for (const l of listings as { id: string; paid_until: string | null; paused_paid_days: number | null }[]) {
      if (l.paid_until && new Date(l.paid_until) > new Date()) {
        await supabaseAdmin
          .from("listings")
          .update({
            payment_kind: "individual_paid",
            paused_paid_days: 0,
            updated_at: nowIso,
          })
          .eq("id", l.id);
        restoredCount++;
        continue;
      }
      const banked = l.paused_paid_days ?? 0;
      if (banked > 0) {
        // Restore individual paid coverage; trigger will hydrate paid_until on next
        // toggle (we don't toggle here; listing stays active).
        const paidUntil = new Date();
        paidUntil.setUTCDate(paidUntil.getUTCDate() + banked);
        await supabaseAdmin
          .from("listings")
          .update({
            payment_kind: "individual_paid",
            paid_until: paidUntil.toISOString(),
            paused_paid_days: 0,
            updated_at: nowIso,
          })
          .eq("id", l.id);
        restoredCount++;
      } else {
        // No paid balance — deactivate. Trigger sets deactivated_at.
        await supabaseAdmin
          .from("listings")
          .update({ is_active: false, updated_at: nowIso })
          .eq("id", l.id);
        deactivatedCount++;
      }
    }

    console.log(`Cascade for user ${user_id}: ${deactivatedCount} deactivated, ${restoredCount} fell back to paid balance`);

    return new Response(JSON.stringify({
      success: true,
      cascaded: deactivatedCount,
      restored: restoredCount,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("cascade-deactivate-subscription error:", error);
    await reportError(error, { functionName: "cascade-deactivate-subscription" });
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
