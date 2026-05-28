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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Confirm the user has no OTHER active subscription. If they do, we don't
    // cascade (they're still covered).
    const { data: stillCovered } = await supabaseAdmin
      .from("listing_subscriptions")
      .select("id")
      .eq("user_id", user_id)
      .in("status", ["active", "admin_active"])
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

    // Two outcomes per listing:
    //  - Has banked paid days → restore as individual_paid (listing stays active).
    //  - No banked balance     → deactivate (set is_active=false).
    let restoredCount = 0;
    let deactivatedCount = 0;
    const nowIso = new Date().toISOString();

    for (const l of listings as { id: string; paused_paid_days: number | null }[]) {
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
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
