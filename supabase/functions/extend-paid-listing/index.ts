// Free renewal of an active paid residential-rental listing.
// User clicks "Renew for 30 more days" — this extends expires_at without charging,
// drawing on the listing's remaining paid_until balance.
//
// Rules:
//  - Caller must own the listing OR be an admin.
//  - Listing must be active.
//  - Listing must be residential rental (listing_type='rental').
//  - Listing must have one of: active subscription coverage, valid paid_until in the
//    future, or admin_granted payment_kind.
//  - New expires_at = LEAST(NOW() + 30 days, paid_until). For subscription-covered
//    or admin_granted listings (no paid_until), expires_at = NOW() + 30 days.
//
// Does NOT extend paid_until. Paid days continue to deplete naturally.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const FRESHNESS_DAYS = 30;

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

    const { listing_id } = await req.json();
    if (!listing_id) {
      return new Response(JSON.stringify({ error: "Missing listing_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Caller must own the listing OR be admin.
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();
    const isAdmin = callerProfile?.is_admin === true;

    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id, user_id, listing_type, is_active, payment_kind, paid_until, expires_at")
      .eq("id", listing_id)
      .maybeSingle();

    if (listingError || !listing) {
      return new Response(JSON.stringify({ error: "Listing not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAdmin && listing.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (listing.listing_type !== "rental") {
      return new Response(JSON.stringify({ error: "Renewal only applies to residential rentals" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!listing.is_active) {
      return new Response(JSON.stringify({ error: "Listing is not active. Use the reactivate flow instead." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine if listing is currently permitted to be active.
    const nowIso = new Date().toISOString();
    const hasPaidBalance =
      listing.payment_kind === "individual_paid" &&
      listing.paid_until !== null &&
      new Date(listing.paid_until) > new Date();

    const isAdminGranted = listing.payment_kind === "admin_granted";

    // Check subscription coverage (count of active subs for this user)
    let hasSubscription = false;
    if (listing.payment_kind === "subscription") {
      const { data: sub } = await supabaseAdmin
        .from("listing_subscriptions")
        .select("id, status")
        .eq("user_id", listing.user_id)
        .in("status", ["active", "admin_active", "trial", "past_due"])
        .limit(1)
        .maybeSingle();
      hasSubscription = !!sub;
    }

    if (!hasPaidBalance && !isAdminGranted && !hasSubscription) {
      return new Response(JSON.stringify({
        error: "Listing has no coverage to renew. Pay or subscribe first.",
        needs_payment: true,
      }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute new expires_at = LEAST(NOW + 30, paid_until).
    const baseline = new Date();
    baseline.setUTCDate(baseline.getUTCDate() + FRESHNESS_DAYS);

    let newExpiresAt = baseline;
    if (hasPaidBalance && listing.paid_until) {
      const paidUntil = new Date(listing.paid_until);
      if (paidUntil < baseline) newExpiresAt = paidUntil;
    }

    const { error: updateError } = await supabaseAdmin
      .from("listings")
      .update({
        expires_at: newExpiresAt.toISOString(),
        last_published_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", listing_id);

    if (updateError) {
      console.error("Failed to extend listing:", updateError);
      return new Response(JSON.stringify({ error: "Failed to extend listing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      new_expires_at: newExpiresAt.toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extend-paid-listing error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
