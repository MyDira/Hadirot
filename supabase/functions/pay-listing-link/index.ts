// Public, no-login "pay from your phone" redirect endpoint.
//
// SMS reminders (send-paid-listing-reminders) embed a signed token in a link.
// Tapping the link hits this function, which verifies the token, creates a
// Stripe Checkout session for the listing OWNER, and 302-redirects the phone
// straight to Stripe. On checkout completion, stripe-webhook updates the
// listing and Stripe sends the buyer to the branded thank-you page.
//
// verify_jwt = false (see supabase/config.toml) — the signed token IS the auth.
//
// Replay note (audit L3): a token is reusable until it expires (14 days). This
// is acceptable: each tap only opens a fresh Stripe Checkout that the visitor
// must actively complete — it never silently charges the owner's saved card,
// and any completed payment simply extends the OWNER's own listing.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { INDIVIDUAL_LISTING_PACKAGES } from "../_shared/stripe-prices.ts";
import { verifyListingPayToken } from "../_shared/sms-link-token.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY")!, {
  apiVersion: "2023-10-16",
});

const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://hadirot.com";

// Friendly HTML for the rare error case (expired/invalid link, listing gone).
function errorPage(message: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Hadirot</title>
    <style>body{font-family:Arial,sans-serif;background:#F7F9FC;color:#374151;margin:0;padding:24px;text-align:center}
    .card{max-width:480px;margin:48px auto;background:#fff;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden}
    .hd{background:#1E4A74;color:#fff;padding:20px;font-size:22px;font-weight:bold}
    .bd{padding:24px;font-size:16px;line-height:1.5}
    a.btn{display:inline-block;margin-top:16px;background:#1E4A74;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px}</style>
    </head><body><div class="card"><div class="hd">Hadirot</div>
    <div class="bd"><p>${message}</p>
    <a class="btn" href="${SITE_URL}/dashboard">Go to your dashboard</a></div></div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return errorPage("This payment link is missing its security token. Please use the link from your text message, or pay from your dashboard.");
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const payload = await verifyListingPayToken(token, serviceKey);
    if (!payload) {
      return errorPage("This payment link has expired or is invalid. You can still renew your listing from your dashboard.");
    }

    const listingId = payload.l;
    const days = payload.d;

    const pkg = INDIVIDUAL_LISTING_PACKAGES.find((p) => p.days === days);
    if (!pkg) {
      return errorPage("We couldn't determine the renewal package for this listing. Please pay from your dashboard.");
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const { data: listing } = await supabaseAdmin
      .from("listings")
      .select("id, user_id, listing_type, neighborhood, location, price, approved")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing || listing.listing_type !== "rental") {
      return errorPage("This listing could not be found, or is no longer eligible for individual payment.");
    }

    // Audit L2: only ever start a charge for an admin-approved listing. SMS
    // reminders are only sent for approved listings (active/expiring/recently
    // deactivated), so a token for an unapproved or removed listing should not
    // be payable even though it was validly signed at some earlier point.
    if (listing.approved !== true) {
      return errorPage("This listing is not currently eligible for payment. Please check your dashboard.");
    }

    const { data: ownerProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, stripe_customer_id")
      .eq("id", listing.user_id)
      .maybeSingle();

    // First-time vs renewal pricing based on prior payments.
    const { count: priorCount } = await supabaseAdmin
      .from("paid_listing_payments")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", listingId);
    const isFirstPayment = (priorCount ?? 0) === 0;
    const amountCents = isFirstPayment ? pkg.first_time_cents : pkg.renewal_cents;

    // Ensure the OWNER has a Stripe customer (charge/receipt belongs to owner).
    const ownerEmail = ownerProfile?.email || undefined;
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
          product_data: { name: productName },
        },
        quantity: 1,
      }],
      metadata: {
        type: "individual_listing",
        listing_id: listingId,
        user_id: listing.user_id,
        days: String(days),
        // SMS links are always renewals/reactivations — never the at-posting
        // initial purchase, so no 30-day bonus is granted by the webhook.
        is_initial_purchase: "false",
        is_first_payment: isFirstPayment ? "true" : "false",
        source: "sms_link",
      },
      allow_promotion_codes: true,
      success_url: `${SITE_URL}/listing-payment-success?listing=${listingId}`,
      cancel_url: `${SITE_URL}/listing-payment-cancelled?listing=${listingId}`,
    });

    if (!session.url) {
      return errorPage("We couldn't start the checkout. Please try again, or pay from your dashboard.");
    }

    // Straight to Stripe.
    return new Response(null, {
      status: 302,
      headers: { Location: session.url },
    });
  } catch (error) {
    console.error("pay-listing-link error:", error);
    return errorPage("Something went wrong starting your payment. Please try again, or pay from your dashboard.");
  }
});
