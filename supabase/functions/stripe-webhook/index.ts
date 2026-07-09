import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { LISTING_SUBSCRIPTION_PRICES } from '../_shared/stripe-prices.ts';

const ZEPTO_API_URL = "https://api.zeptomail.com/v1.1/email";

const stripe = new Stripe(Deno.env.get('STRIPE_API_KEY')!, {
  apiVersion: '2023-10-16',
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function sendEmail(to: string | string[], subject: string, html: string) {
  const token = Deno.env.get("ZEPTO_TOKEN");
  const address = Deno.env.get("ZEPTO_FROM_ADDRESS") || "";
  const name = Deno.env.get("ZEPTO_FROM_NAME") || "";
  if (!token || !address || !name) {
    console.error("ZeptoMail not configured, skipping email");
    return;
  }
  const toList = Array.isArray(to) ? to : [to];
  const payload = {
    from: { address, name },
    to: toList.map((addr) => ({ email_address: { address: addr } })),
    subject,
    htmlbody: html,
    track_opens: false,
    track_clicks: false,
  };
  const res = await fetch(ZEPTO_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Zoho-enczapikey ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`ZeptoMail error: ${res.status} ${text}`);
  }
}

// Escape user-controlled strings (e.g. listing title) before interpolating into
// email HTML. Prevents broken markup / link injection in notification emails.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function brandWrap(title: string, bodyHtml: string) {
  return `
    <div style="font-family:Arial,sans-serif;background-color:#F7F9FC;padding:24px;">
      <div style="max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
        <div style="background-color:#1E4A74;color:#FFFFFF;padding:24px;text-align:center;">
          <h1 style="margin:0;font-size:24px;">Hadirot</h1>
        </div>
        <div style="padding:24px;color:#374151;font-size:16px;line-height:1.5;">
          <h2 style="margin:0 0 16px 0;font-size:20px;color:#1E4A74;">${title}</h2>
          ${bodyHtml}
        </div>
        <div style="background-color:#F7F9FC;color:#6B7280;text-align:center;font-size:12px;padding:16px;">
          &copy; ${new Date().getFullYear()} Hadirot. All rights reserved.
        </div>
      </div>
    </div>
  `;
}

async function getAdminEmails(supabaseAdmin: ReturnType<typeof createClient>): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('is_admin', true);
  return (data || []).map((p: { email: string }) => p.email).filter(Boolean);
}

// Resolve a user's email. Prefer the profiles row; fall back to the auth record
// (profiles.email can be null for some accounts).
async function getUserEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle();
  const profileEmail = (profile as { email?: string } | null)?.email;
  if (profileEmail) return profileEmail;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch (err) {
    console.error('Failed to resolve user email:', err);
    return null;
  }
}

// Format a date as a friendly "June 3, 2026" string for emails.
function formatEmailDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

async function handleFeaturedCheckout(session: Stripe.Checkout.Session) {
  const { listing_id, user_id, plan, duration_days, is_commercial } = session.metadata || {};
  if (!listing_id || !user_id || !plan || !duration_days) {
    console.error('Missing metadata in featured checkout session:', session.id);
    return;
  }

  const isCommercial = is_commercial === 'true';
  const listingTable = isCommercial ? 'commercial_listings' : 'listings';
  const durationDaysNum = parseInt(duration_days, 10);
  const supabaseAdmin = getSupabaseAdmin();

  const { data: existingPurchase } = await supabaseAdmin
    .from('featured_purchases')
    .select('id, status')
    .eq('stripe_checkout_session_id', session.id)
    .neq('status', 'pending')
    .maybeSingle();

  if (existingPurchase) {
    console.log(`Idempotency: featured purchase already processed for session ${session.id} (status: ${existingPurchase.status})`);
    return;
  }

  const { data: purchase, error: purchaseError } = await supabaseAdmin
    .from('featured_purchases')
    .update({
      status: 'paid',
      stripe_payment_intent_id: session.payment_intent as string,
      purchased_at: new Date().toISOString(),
      promo_code_used: session.total_details?.amount_discount ? 'discount_applied' : null,
      amount_cents: session.amount_total || 0,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_checkout_session_id', session.id)
    .select()
    .maybeSingle();

  if (purchaseError || !purchase) {
    console.error('Error updating purchase, creating fallback:', purchaseError);
    const { error: fallbackErr } = await supabaseAdmin.from('featured_purchases').insert({
      listing_id,
      user_id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent as string,
      plan,
      amount_cents: session.amount_total || 0,
      status: 'paid',
      purchased_at: new Date().toISOString(),
      duration_days: durationDaysNum,
      is_commercial: isCommercial,
    });
    // 23505 = another delivery already recorded this paid purchase; that's the
    // idempotency signal, not a failure. Any other error means the customer paid
    // but we recorded nothing -> throw so Stripe retries.
    if (fallbackErr && fallbackErr.code !== '23505') {
      throw new Error(
        `featured_purchases fallback insert failed for session ${session.id}: ${fallbackErr.message}`,
      );
    }
  }

  const { data: listing } = await supabaseAdmin
    .from(listingTable)
    .select('approved, is_active')
    .eq('id', listing_id)
    .maybeSingle();

  if (listing?.approved && listing?.is_active) {
    const now = new Date();
    const endDate = new Date(now.getTime() + durationDaysNum * 24 * 60 * 60 * 1000);

    const { error: fpActivateErr } = await supabaseAdmin
      .from('featured_purchases')
      .update({
        status: 'active',
        featured_start: now.toISOString(),
        featured_end: endDate.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('stripe_checkout_session_id', session.id);
    if (fpActivateErr) {
      throw new Error(
        `featured_purchases activation update failed for session ${session.id}: ${fpActivateErr.message}`,
      );
    }

    const { error: listingActivateErr } = await supabaseAdmin
      .from(listingTable)
      .update({
        is_featured: true,
        featured_started_at: now.toISOString(),
        featured_expires_at: endDate.toISOString(),
        featured_plan: plan,
        updated_at: now.toISOString(),
      })
      .eq('id', listing_id);
    if (listingActivateErr) {
      throw new Error(
        `${listingTable} featured activation failed for listing ${listing_id}: ${listingActivateErr.message}`,
      );
    }

    console.log(`Featured activated for ${listingTable} ${listing_id} until ${endDate.toISOString()}`);
  } else {
    console.log(`Payment recorded for listing ${listing_id} - will activate on approval`);
  }
}

async function handleConciergeCheckout(session: Stripe.Checkout.Session) {
  const { tier, user_id, email_handle, blurb } = session.metadata || {};
  if (!tier || !user_id) {
    console.error('Missing concierge metadata:', session.id);
    return;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const origin = Deno.env.get('PUBLIC_SITE_URL') || 'https://hadirot.com';

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name, email, phone, agency')
    .eq('id', user_id)
    .maybeSingle();

  const userName = profile?.full_name || 'Unknown User';
  const userEmail = profile?.email || '';

  if (tier === 'tier1_quick') {
    const { data: existingSub } = await supabaseAdmin
      .from('concierge_submissions')
      .select('id')
      .eq('stripe_checkout_session_id', session.id)
      .maybeSingle();
    if (existingSub) {
      console.log(`Idempotency: tier1 submission already exists for session ${session.id}`);
      return;
    }

    const { data: subscription } = await supabaseAdmin
      .from('concierge_subscriptions')
      .insert({
        user_id,
        tier: 'tier1_quick',
        status: 'active',
        stripe_customer_id: session.customer as string,
      })
      .select()
      .single();

    if (subscription) {
      await supabaseAdmin
        .from('concierge_submissions')
        .insert({
          user_id,
          subscription_id: subscription.id,
          blurb: blurb || '',
          status: 'paid',
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent as string,
        });
    }

    const adminEmails = await getAdminEmails(supabaseAdmin);
    if (adminEmails.length > 0) {
      const html = brandWrap(
        'New Concierge Submission',
        `
        <p><strong>From:</strong> ${userName}</p>
        <p><strong>Email:</strong> ${userEmail}</p>
        <p><strong>Phone:</strong> ${profile?.phone || 'Not provided'}</p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:16px 0;" />
        <p><strong>Listing Description:</strong></p>
        <div style="background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:16px;margin:8px 0;white-space:pre-wrap;">${blurb || ''}</div>
        <div style="text-align:center;margin:24px 0;">
          <a href="${origin}/admin?tab=concierge" style="background-color:#1E4A74;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">View in Admin Panel</a>
        </div>
        `,
      );
      await sendEmail(adminEmails, `New Concierge Submission \u2014 ${userName}`, html);
    }
    if (userEmail) {
      const userHtml = brandWrap(
        'Your Quick Post Has Been Submitted',
        `
        <p>Thank you for your submission, ${userName}! We've received your listing request.</p>
        <p><strong>Here's what you submitted:</strong></p>
        <div style="background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:16px;margin:8px 0;white-space:pre-wrap;">${blurb || ''}</div>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:16px 0;" />
        <p>Our team will review and post your listing shortly. You'll receive a notification once it's live.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${origin}/account?tab=billing" style="background-color:#1E4A74;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">View Your Account</a>
        </div>
        `,
      );
      await sendEmail(userEmail, 'Your Quick Post Has Been Submitted', userHtml);
    }
    console.log(`Concierge Tier 1 paid for user ${user_id}`);
  }

  if (tier === 'tier2_forward') {
    const stripeSubId = session.subscription as string;

    if (stripeSubId) {
      const { data: existing } = await supabaseAdmin
        .from('concierge_subscriptions')
        .select('id')
        .eq('stripe_subscription_id', stripeSubId)
        .maybeSingle();
      if (existing) {
        console.log(`Idempotency: tier2 subscription already exists for stripe sub ${stripeSubId}`);
        return;
      }
    }

    await supabaseAdmin
      .from('concierge_subscriptions')
      .insert({
        user_id,
        tier: 'tier2_forward',
        status: 'active',
        stripe_subscription_id: stripeSubId || null,
        stripe_customer_id: session.customer as string,
        email_handle: email_handle || null,
      });

    const handle = email_handle || '';
    const fullEmail = `${handle}@list.hadirot.com`;

    if (userEmail) {
      const html = brandWrap(
        'Your Hadirot Listing Email is Ready',
        `
        <p>Your custom forwarding address is:</p>
        <div style="background-color:#F0F9FF;border:2px solid #1E4A74;border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
          <span style="font-size:22px;font-weight:bold;color:#1E4A74;letter-spacing:0.5px;">${fullEmail}</span>
        </div>
        <p>Forward your listings to this address anytime and we'll post them for you.</p>
        <h3 style="color:#1E4A74;margin:20px 0 8px 0;font-size:16px;">What to include:</h3>
        <p><strong>For rentals:</strong> bedrooms, bathrooms, price (or "call for price"), contact number, and cross streets.</p>
        <p><strong>For sales:</strong> address, price, bedrooms, bathrooms, property type, building type, and a photo.</p>
        <p style="color:#6B7280;margin-top:16px;">The more details you include, the better &mdash; but those are the essentials.</p>
        `,
      );
      await sendEmail(userEmail, 'Your Hadirot Listing Email is Ready', html);
    }
    const adminEmails = await getAdminEmails(supabaseAdmin);
    if (adminEmails.length > 0) {
      const adminHtml = brandWrap(
        `New Forward &amp; Post Subscriber`,
        `
        <p><strong>Name:</strong> ${userName}</p>
        <p><strong>Agency:</strong> ${profile?.agency || 'None'}</p>
        <p><strong>Email:</strong> ${userEmail}</p>
        <p><strong>Phone:</strong> ${profile?.phone || 'Not provided'}</p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:16px 0;" />
        <p><strong>Assigned email handle:</strong></p>
        <div style="background-color:#F0F9FF;border:2px solid #1E4A74;border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
          <span style="font-size:20px;font-weight:bold;color:#1E4A74;letter-spacing:0.5px;">${fullEmail}</span>
        </div>
        <p><strong>Subscription started:</strong> ${new Date().toLocaleDateString()}</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${origin}/admin?tab=concierge" style="background-color:#1E4A74;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">View in Admin Panel</a>
        </div>
        `,
      );
      await sendEmail(adminEmails, `New Forward & Post Subscriber \u2014 ${userName}`, adminHtml);
    }
    console.log(`Concierge Tier 2 activated for user ${user_id}, handle: ${handle}`);
  }

  if (tier === 'tier3_vip') {
    const stripeSubId = session.subscription as string;

    if (stripeSubId) {
      const { data: existing } = await supabaseAdmin
        .from('concierge_subscriptions')
        .select('id')
        .eq('stripe_subscription_id', stripeSubId)
        .maybeSingle();
      if (existing) {
        console.log(`Idempotency: tier3 subscription already exists for stripe sub ${stripeSubId}`);
        return;
      }
    }

    await supabaseAdmin
      .from('concierge_subscriptions')
      .insert({
        user_id,
        tier: 'tier3_vip',
        status: 'active',
        stripe_subscription_id: stripeSubId || null,
        stripe_customer_id: session.customer as string,
        email_handle: email_handle || null,
        sources: null,
      });

    const handle = email_handle || '';
    const fullEmail = `${handle}@list.hadirot.com`;

    const adminEmails = await getAdminEmails(supabaseAdmin);
    if (adminEmails.length > 0) {
      const html = brandWrap(
        'New VIP Concierge Subscriber',
        `
        <p><strong>Name:</strong> ${userName}</p>
        <p><strong>Agency:</strong> ${profile?.agency || 'None'}</p>
        <p><strong>Email:</strong> ${userEmail}</p>
        <p><strong>Phone:</strong> ${profile?.phone || 'Not provided'}</p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:16px 0;" />
        ${handle ? `<p><strong>Assigned email handle:</strong></p>
        <div style="background-color:#F0F9FF;border:2px solid #1E4A74;border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
          <span style="font-size:20px;font-weight:bold;color:#1E4A74;letter-spacing:0.5px;">${fullEmail}</span>
        </div>` : ''}
        <p><strong>Listing Sources:</strong> Pending user setup</p>
        <p><strong>Subscription started:</strong> ${new Date().toLocaleDateString()}</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${origin}/admin?tab=concierge" style="background-color:#1E4A74;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">View in Admin Panel</a>
        </div>
        `,
      );
      await sendEmail(adminEmails, `New VIP Concierge Subscriber \u2014 ${userName}`, html);
    }
    if (userEmail) {
      const userHtml = brandWrap(
        'Welcome to Hadirot VIP Concierge',
        `
        <p>Welcome, ${userName}! You're now a Hadirot VIP Concierge member.</p>
        <p>We'll handle posting your listings for you — but first, we need to know where to find them.</p>
        ${handle ? `<hr style="border:none;border-top:1px solid #E5E7EB;margin:16px 0;" />
        <p>Your dedicated listing email address is:</p>
        <div style="background-color:#F0F9FF;border:2px solid #1E4A74;border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
          <span style="font-size:22px;font-weight:bold;color:#1E4A74;letter-spacing:0.5px;">${fullEmail}</span>
        </div>
        <p>You can also forward listings directly to this address and we'll post them for you.</p>` : ''}
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:16px 0;" />
        <p><strong>Next step:</strong> Set up your listing sources so we know where to find your listings.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${origin}/concierge/success?tier=tier3_vip" style="background-color:#1E4A74;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Set Up My Listing Sources</a>
        </div>
        <p style="color:#6B7280;font-size:14px;">You can also update your sources anytime from your <a href="${origin}/account?tab=billing" style="color:#1E4A74;">account billing page</a>.</p>
        `,
      );
      await sendEmail(userEmail, 'Welcome to Hadirot VIP Concierge', userHtml);
    }
    console.log(`Concierge Tier 3 VIP activated for user ${user_id}, handle: ${handle}`);
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const supabaseAdmin = getSupabaseAdmin();
  const stripeSubId = subscription.id;

  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  // Status mapping for the concierge table.
  function computeUpdate(): Record<string, unknown> {
    const update: Record<string, unknown> = { current_period_end: periodEnd };
    if (
      subscription.cancel_at_period_end === true &&
      (subscription.status === 'active' || subscription.status === 'trialing')
    ) {
      // Scheduled-to-cancel but still paid through the period: KEEP coverage
      // active (record the pending cancel via cancelled_at). Only move to
      // 'cancelled' when Stripe sends customer.subscription.deleted at period
      // end. Mirrors the listing_subscriptions semantics below — previously
      // concierge flipped to 'cancelled' immediately, cutting off a subscriber
      // who had paid for the remainder of the month.
      update.status = subscription.status === 'trialing' ? 'trial' : 'active';
      update.cancelled_at = new Date().toISOString();
    } else if (subscription.cancel_at_period_end === false && subscription.status === 'active') {
      update.status = 'active';
      update.cancelled_at = null;
    } else {
      const statusMap: Record<string, string> = {
        active: 'active',
        trialing: 'trial',
        past_due: 'past_due',
        canceled: 'cancelled',
        unpaid: 'past_due',
      };
      update.status = statusMap[subscription.status] || 'active';
      if (subscription.status === 'canceled') {
        update.cancelled_at = new Date().toISOString();
      }
    }
    return update;
  }

  // ---- concierge_subscriptions (existing) ----
  const { data: conciergeRow } = await supabaseAdmin
    .from('concierge_subscriptions')
    .select('id')
    .eq('stripe_subscription_id', stripeSubId)
    .maybeSingle();

  if (conciergeRow) {
    const update = computeUpdate();
    await supabaseAdmin
      .from('concierge_subscriptions')
      .update(update)
      .eq('id', conciergeRow.id);
    console.log(`Concierge subscription ${conciergeRow.id} status -> ${update.status}`);
  }

  // ---- listing_subscriptions (new) ----
  const { data: listingSubRow } = await supabaseAdmin
    .from('listing_subscriptions')
    .select('id, user_id, status')
    .eq('stripe_subscription_id', stripeSubId)
    .maybeSingle();

  if (listingSubRow) {
    // Listing subscriptions gate the user's listings, so the status mapping is
    // stricter than the concierge one above:
    //  • cancel_at_period_end=true does NOT flip the row to 'cancelled' — the
    //    user paid through the period and keeps coverage until Stripe sends
    //    customer.subscription.deleted at period end.
    //  • 'past_due' keeps coverage (Stripe dunning grace); terminal 'unpaid'
    //    maps to 'expired' (not covered).
    const update: Record<string, unknown> = { current_period_end: periodEnd };
    if (
      subscription.cancel_at_period_end === true &&
      (subscription.status === 'active' || subscription.status === 'trialing')
    ) {
      update.status = subscription.status === 'trialing' ? 'trial' : 'active';
    } else if (subscription.cancel_at_period_end === false && subscription.status === 'active') {
      update.status = 'active';
      update.cancelled_at = null;
    } else {
      const statusMap: Record<string, string> = {
        active: 'active',
        trialing: 'trial',
        past_due: 'past_due',
        canceled: 'cancelled',
        unpaid: 'expired',
      };
      update.status = statusMap[subscription.status] || 'active';
      if (subscription.status === 'canceled') {
        update.cancelled_at = new Date().toISOString();
      }
    }
    const prevStatus = listingSubRow.status as string;
    const newStatus = update.status as string;

    // Detect a plan change (e.g. agent -> vip upgrade via proration) by
    // matching the subscription's active price ids against our plan prices.
    // Keeps plan + listing_cap in sync no matter how the change was triggered
    // (our upgrade endpoint, the Stripe customer portal, or a manual edit).
    const priceIds = subscription.items?.data?.map((it) => it.price?.id) ?? [];
    if (priceIds.includes(LISTING_SUBSCRIPTION_PRICES.vip)) {
      update.plan = 'vip';
      update.listing_cap = null;
    } else if (priceIds.includes(LISTING_SUBSCRIPTION_PRICES.agent)) {
      update.plan = 'agent';
      update.listing_cap = 7;
    }

    await supabaseAdmin
      .from('listing_subscriptions')
      .update(update)
      .eq('id', listingSubRow.id);

    console.log(
      `Listing subscription ${listingSubRow.id} status -> ${newStatus}` +
      (update.plan ? `, plan -> ${update.plan}` : ''),
    );

    // Cascade-cancel any addon_concierge row linked to this parent. past_due
    // is a dunning grace state — the addon follows only on terminal statuses.
    if (newStatus === 'cancelled' || newStatus === 'expired') {
      await supabaseAdmin
        .from('concierge_subscriptions')
        .update({
          status: newStatus,
          cancelled_at: newStatus === 'cancelled' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('listing_subscription_id', listingSubRow.id)
        .eq('tier', 'addon_concierge');
    }

    // If transitioning AWAY from a covering state, cascade-deactivate the
    // user's listings. 'trial' and 'past_due' count as covering.
    const COVERING = ['active', 'admin_active', 'trial', 'past_due'];
    const wasActive = COVERING.includes(prevStatus);
    const stillActive = COVERING.includes(newStatus);
    if (wasActive && !stillActive) {
      try {
        await fetch(
          `${Deno.env.get('SUPABASE_URL')!}/functions/v1/cascade-deactivate-subscription`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_id: listingSubRow.user_id,
              listing_subscription_id: listingSubRow.id,
            }),
          },
        );
      } catch (err) {
        console.error('Cascade-deactivate call failed:', err);
        // Safety net: the auto_inactivate cron's "subscription gone" condition
        // will catch it within 24h.
      }
    }
  }
}

// ============================================================
// Individual listing payment (residential rental, one-off Stripe Checkout)
// ============================================================
async function handleIndividualListingCheckout(session: Stripe.Checkout.Session) {
  const supabaseAdmin = getSupabaseAdmin();
  const meta = session.metadata || {};
  const { listing_id, user_id, days, is_initial_purchase } = meta;

  if (!listing_id || !user_id || !days) {
    console.error('Missing metadata in individual_listing checkout:', session.id);
    return;
  }

  const daysGranted = parseInt(days, 10);
  if (!Number.isFinite(daysGranted) || daysGranted <= 0) {
    console.error('Invalid days in individual_listing checkout:', days);
    return;
  }

  // Idempotency is enforced ATOMICALLY by the paid_listing_payments insert
  // below (unique index on stripe_checkout_session_id), NOT by a read-then-act
  // check. A pre-read let two concurrent deliveries both pass and both apply the
  // day-math, stacking double the paid days for one payment. Now the day-math
  // runs only when THIS delivery actually created the ledger row.

  // Look up listing state (must exist).
  const { data: listing } = await supabaseAdmin
    .from('listings')
    .select('id, title, payment_kind, trial_started_at, paid_until, is_active, listing_type, approved')
    .eq('id', listing_id)
    .maybeSingle();
  if (!listing) {
    console.error(`Listing ${listing_id} not found for session ${session.id}`);
    return;
  }
  if (listing.listing_type !== 'rental') {
    console.error(`Listing ${listing_id} is not a rental; refusing to apply individual payment`);
    return;
  }

  // Prior-payments count → first-time pricing rule + bonus eligibility.
  const { count: priorCount } = await supabaseAdmin
    .from('paid_listing_payments')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listing_id);
  const hasPriorPayments = (priorCount ?? 0) > 0;

  const isInitialPurchase = is_initial_purchase === 'true';
  const grantBonus =
    isInitialPurchase &&
    !hasPriorPayments &&
    listing.payment_kind === 'individual_trial';
  const bonusDays = grantBonus ? 30 : 0;

  const now = new Date();
  const listingTitle = (listing as { title?: string }).title || 'your listing';
  const safeTitle = escapeHtml(listingTitle);
  const ownerEmail = await getUserEmail(supabaseAdmin, user_id);

  // Record the payment (ledger) — always, regardless of approval state. The
  // ledger is the source of truth that approve-listing reads when it re-anchors
  // the clock at approval time. This insert is ALSO the idempotency gate: a
  // 23505 unique-violation on stripe_checkout_session_id means another delivery
  // already recorded this payment, so we return WITHOUT re-applying day-math.
  const { error: paymentInsertErr } = await supabaseAdmin
    .from('paid_listing_payments')
    .insert({
      listing_id,
      user_id,
      amount_cents: session.amount_total || 0,
      days_granted: daysGranted,
      bonus_days: bonusDays,
      source: 'stripe',
      is_initial_purchase: isInitialPurchase,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent as string,
    });
  if (paymentInsertErr) {
    if (paymentInsertErr.code === '23505') {
      console.log(`Idempotency: paid_listing_payment already exists for session ${session.id}; skipping day-math.`);
      return;
    }
    // Customer paid but we couldn't record the ledger row — throw so Stripe
    // retries (the outer webhook handler converts this to a 500).
    throw new Error(
      `paid_listing_payments insert failed for session ${session.id}: ${paymentInsertErr.message}`,
    );
  }

  // Pre-approval payment (paid during posting, before an admin approves).
  // The clock must start at APPROVAL, not now — so defer all day-math to
  // approve-listing, which sums this ledger row. Do NOT change payment_kind,
  // set paid_until, or activate the listing here. Just confirm receipt.
  if (listing.approved === false) {
    console.log(
      `Pre-approval payment recorded for listing ${listing_id}; clock deferred to approval.`,
    );
    if (ownerEmail) {
      const bonusLine = bonusDays > 0
        ? `<p style="margin:0 0 16px 0;">As an early-payment bonus, you'll receive an extra <strong>30 days</strong> on top of your free trial and paid period — a great value.</p>`
        : '';
      await sendEmail(
        ownerEmail,
        'Payment received — your listing goes live once approved',
        brandWrap(
          'Payment received',
          `<p style="margin:0 0 16px 0;">Thank you! We've received your payment for <strong>${safeTitle}</strong>.</p>
           ${bonusLine}
           <p style="margin:0 0 16px 0;">Your listing is currently being reviewed by our team. As soon as it's approved, it will go live and your free trial and paid period will begin. You'll get a confirmation email at that point.</p>
           <p style="margin:0;">Thanks for choosing Hadirot.</p>`,
        ),
      );
    }
    return;
  }

  // Approved listing (dashboard renewal / reactivation): apply day-math now.
  let newPaidUntil: Date;

  if (grantBonus && listing.trial_started_at) {
    // At-posting payment with bonus: 14 trial + days + 30 bonus, measured from trial start.
    newPaidUntil = new Date(listing.trial_started_at);
    newPaidUntil.setUTCDate(newPaidUntil.getUTCDate() + 14 + daysGranted + bonusDays);
  } else if (listing.payment_kind === 'individual_trial' && listing.trial_started_at) {
    // Mid-trial conversion (no bonus): retain remaining trial time + add days.
    const trialEnd = new Date(listing.trial_started_at);
    trialEnd.setUTCDate(trialEnd.getUTCDate() + 14);
    const base = trialEnd > now ? trialEnd : now;
    newPaidUntil = new Date(base);
    newPaidUntil.setUTCDate(newPaidUntil.getUTCDate() + daysGranted);
  } else if (listing.paid_until && new Date(listing.paid_until) > now) {
    // Stacking on existing paid balance.
    newPaidUntil = new Date(listing.paid_until);
    newPaidUntil.setUTCDate(newPaidUntil.getUTCDate() + daysGranted);
  } else {
    // Fresh purchase (post-trial or reactivation).
    newPaidUntil = new Date(now);
    newPaidUntil.setUTCDate(newPaidUntil.getUTCDate() + daysGranted);
  }

  // Compute new expires_at = LEAST(now + 30, paid_until).
  const thirtyAhead = new Date(now);
  thirtyAhead.setUTCDate(thirtyAhead.getUTCDate() + 30);
  const newExpiresAt = newPaidUntil < thirtyAhead ? newPaidUntil : thirtyAhead;

  // Apply to the listing. If listing is inactive, also reactivate it; the trigger
  // will manage paused_paid_days restore (but since we set paid_until explicitly,
  // the trigger's clamp/restore for paid_until is idempotent).
  const update: Record<string, unknown> = {
    payment_kind: 'individual_paid',
    paid_until: newPaidUntil.toISOString(),
    expires_at: newExpiresAt.toISOString(),
    paused_paid_days: 0,
    updated_at: now.toISOString(),
  };
  if (!listing.is_active) {
    update.is_active = true;
  }

  await supabaseAdmin
    .from('listings')
    .update(update)
    .eq('id', listing_id);

  // Confirmation email — listing is live and paid.
  if (ownerEmail) {
    const amountStr = ((session.amount_total || 0) / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'usd',
    });
    await sendEmail(
      ownerEmail,
      'Payment confirmed — your listing is active',
      brandWrap(
        'Thank you for your payment',
        `<p style="margin:0 0 16px 0;">We've received your payment of <strong>${amountStr}</strong> for <strong>${safeTitle}</strong>.</p>
         <p style="margin:0 0 16px 0;">Your listing is active and paid through <strong>${formatEmailDate(newPaidUntil)}</strong>.</p>
         <p style="margin:0;">Thanks for choosing Hadirot.</p>`,
      ),
    );
  }

  console.log(
    `Individual listing payment applied: listing=${listing_id}, days=${daysGranted}, bonus=${bonusDays}, paid_until=${newPaidUntil.toISOString()}`,
  );
}

// ============================================================
// Listing subscription checkout (Agent / VIP, recurring)
// ============================================================
async function handleListingSubscriptionCheckout(session: Stripe.Checkout.Session) {
  const supabaseAdmin = getSupabaseAdmin();
  const meta = session.metadata || {};
  const { user_id, plan, include_concierge_addon } = meta;

  if (!user_id || (plan !== 'agent' && plan !== 'vip')) {
    console.error('Invalid metadata in listing_subscription checkout:', session.id);
    return;
  }

  const stripeSubId = session.subscription as string;
  if (!stripeSubId) {
    console.error('Missing subscription id in listing_subscription checkout:', session.id);
    return;
  }

  // Idempotency.
  const { data: existing } = await supabaseAdmin
    .from('listing_subscriptions')
    .select('id')
    .eq('stripe_subscription_id', stripeSubId)
    .maybeSingle();
  if (existing) {
    console.log(`Idempotency: listing_subscription already exists for ${stripeSubId}`);
    return;
  }

  // Pull the Stripe subscription to extract current_period_end, billing day,
  // and crucially the live status (trialing vs active) so we record the right
  // shape from the start.
  let currentPeriodEnd: string | null = null;
  let billingDayOfMonth: number | null = null;
  let stripeStatus: string = 'active';
  try {
    const sub = await stripe.subscriptions.retrieve(stripeSubId);
    stripeStatus = sub.status; // 'trialing' | 'active' | 'past_due' | ...
    currentPeriodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;
    // For trials, the billing day is when the trial ends (= when the first
    // invoice will charge), which is also current_period_end. Use it consistently.
    const billingAnchor = sub.status === 'trialing' && sub.trial_end
      ? new Date(sub.trial_end * 1000)
      : sub.current_period_start
        ? new Date(sub.current_period_start * 1000)
        : null;
    if (billingAnchor) {
      const day = billingAnchor.getUTCDate();
      // Clamp to 1-28 to avoid month-end rollover edge cases.
      billingDayOfMonth = Math.min(28, Math.max(1, day));
    }
  } catch (err) {
    console.error('Failed to retrieve Stripe subscription:', err);
  }

  // Map Stripe status → our enum. Match handleSubscriptionUpdate's mapping
  // so a status arriving via webhook on the same row produces the same value.
  const ourStatus =
    stripeStatus === 'trialing' ? 'trial'
    : stripeStatus === 'past_due' ? 'past_due'
    : stripeStatus === 'canceled' ? 'cancelled'
    : stripeStatus === 'unpaid' ? 'past_due'
    : 'active';

  const listingCap = plan === 'agent' ? 7 : null;

  // Supersede any existing complimentary / admin-granted (no-Stripe) subscription
  // for this user. When a comped Agent user converts to paid VIP via checkout,
  // they would otherwise end up with two active rows. Cancel the comp row so the
  // new paid subscription is the single source of truth. We only touch rows
  // WITHOUT a Stripe subscription id (true comps), never another Stripe sub.
  const { data: superseded, error: supersedeErr } = await supabaseAdmin
    .from('listing_subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      admin_notes: 'Superseded by paid Stripe subscription on conversion.',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user_id)
    .is('stripe_subscription_id', null)
    .in('status', ['admin_active', 'trial', 'active', 'past_due'])
    .select('id');
  if (supersedeErr) {
    console.error('Failed to supersede comp subscription(s):', supersedeErr);
  } else if (superseded && superseded.length > 0) {
    console.log(
      `Superseded ${superseded.length} comp subscription(s) for user ${user_id} on paid conversion.`,
    );
  }

  const { data: newSub, error: insertErr } = await supabaseAdmin
    .from('listing_subscriptions')
    .insert({
      user_id,
      plan,
      status: ourStatus,
      listing_cap: listingCap,
      stripe_subscription_id: stripeSubId,
      stripe_customer_id: session.customer as string,
      current_period_end: currentPeriodEnd,
      billing_day_of_month: billingDayOfMonth,
      is_admin_granted: false,
    })
    .select('id')
    .single();

  if (insertErr || !newSub) {
    // Duplicate active subscription for this user (one-active-per-user partial
    // unique index). This means the user already has a covering subscription and
    // this checkout created a SECOND live Stripe subscription with no DB home —
    // the double-click / double-charge case. Cancel the orphaned Stripe
    // subscription so the customer isn't billed twice, alert admins, and return
    // (do NOT throw/retry — retrying can't create the row).
    if (insertErr?.code === '23505') {
      console.error(
        `Duplicate active listing subscription for user ${user_id}; cancelling orphan Stripe sub ${stripeSubId}`,
      );
      try {
        await stripe.subscriptions.cancel(stripeSubId);
      } catch (cancelErr) {
        console.error(`Failed to cancel orphan Stripe subscription ${stripeSubId}:`, cancelErr);
      }
      const adminEmails = await getAdminEmails(supabaseAdmin);
      if (adminEmails.length > 0) {
        await sendEmail(
          adminEmails,
          'Duplicate subscription auto-cancelled',
          brandWrap(
            'Duplicate subscription detected',
            `<p>User <strong>${escapeHtml(user_id)}</strong> already had an active listing subscription, but a second checkout created Stripe subscription <strong>${escapeHtml(stripeSubId)}</strong>.</p>
             <p>The duplicate was automatically cancelled to prevent a double charge. Please verify in Stripe that no duplicate charge landed (and refund if it did).</p>`,
          ),
        );
      }
      return;
    }
    // Any other failure: money-critical (customer charged / trial card on file)
    // but no covering row recorded. Throw so the webhook returns 500 and Stripe
    // retries rather than silently losing the entitlement.
    console.error('Failed to insert listing_subscriptions row:', insertErr);
    throw new Error(
      `listing_subscriptions insert failed for stripe sub ${stripeSubId}: ${insertErr?.message ?? 'no row returned'}`,
    );
  }

  // Concierge add-on (optional).
  if (include_concierge_addon === 'true') {
    await supabaseAdmin
      .from('concierge_subscriptions')
      .insert({
        user_id,
        tier: 'addon_concierge',
        status: 'active',
        stripe_subscription_id: stripeSubId, // shared with parent
        stripe_customer_id: session.customer as string,
        listing_subscription_id: newSub.id,
      });
  }

  // Cover the user's existing residential rental listings under this subscription,
  // up to the cap. Pick newest first. Includes:
  //  • live listings (is_active=true), and
  //  • pending-approval listings (approved=false) — e.g. the wizard's
  //    "subscribe & post" flow creates the listing moments before this webhook
  //    fires, and an unpaid 'pending_payment' listing whose owner subscribes
  //    instead of paying individually should be covered too.
  const { data: candidates } = await supabaseAdmin
    .from('listings')
    .select('id')
    .eq('user_id', user_id)
    .eq('listing_type', 'rental')
    .in('payment_kind', ['individual_trial', 'individual_paid', 'legacy_free', 'pending_payment'])
    .or('is_active.eq.true,approved.eq.false')
    .order('created_at', { ascending: false });

  const toCover = listingCap === null ? (candidates || []) : (candidates || []).slice(0, listingCap);

  if (toCover.length > 0) {
    await supabaseAdmin
      .from('listings')
      .update({
        payment_kind: 'subscription',
        updated_at: new Date().toISOString(),
      })
      .in('id', toCover.map((l: { id: string }) => l.id));
  }

  // Confirmation email — subscription active (or trial started).
  const ownerEmail = await getUserEmail(supabaseAdmin, user_id);
  if (ownerEmail) {
    const planName = plan === 'agent' ? 'Agent' : 'VIP';
    const planLimit = plan === 'agent' ? 'up to 7 active listings' : 'unlimited active listings';
    const periodEndStr = currentPeriodEnd ? formatEmailDate(new Date(currentPeriodEnd)) : null;
    const coveredLine = toCover.length > 0
      ? `<p style="margin:0 0 16px 0;">We've automatically applied your subscription to <strong>${toCover.length}</strong> of your existing listing${toCover.length === 1 ? '' : 's'}.</p>`
      : '';
    const conciergeLine = include_concierge_addon === 'true'
      ? `<p style="margin:0 0 16px 0;">Your Concierge add-on is also active.</p>`
      : '';

    if (ourStatus === 'trial') {
      await sendEmail(
        ownerEmail,
        `Your ${planName} free trial has started`,
        brandWrap(
          `Welcome to Hadirot ${planName}`,
          `<p style="margin:0 0 16px 0;">Your <strong>${planName}</strong> plan free trial is now active, giving you ${planLimit}.</p>
           ${periodEndStr ? `<p style="margin:0 0 16px 0;">Your trial runs until <strong>${periodEndStr}</strong>, when your first payment will be charged. You can cancel anytime before then from your dashboard.</p>` : ''}
           ${coveredLine}
           ${conciergeLine}
           <p style="margin:0;">Thanks for choosing Hadirot.</p>`,
        ),
      );
    } else {
      await sendEmail(
        ownerEmail,
        `Your ${planName} subscription is active`,
        brandWrap(
          `Welcome to Hadirot ${planName}`,
          `<p style="margin:0 0 16px 0;">Thank you! Your <strong>${planName}</strong> subscription is now active, giving you ${planLimit}.</p>
           ${periodEndStr ? `<p style="margin:0 0 16px 0;">Your next billing date is <strong>${periodEndStr}</strong>. You can manage or cancel your subscription anytime from your dashboard.</p>` : ''}
           ${coveredLine}
           ${conciergeLine}
           <p style="margin:0;">Thanks for choosing Hadirot.</p>`,
        ),
      );
    }
  }

  console.log(
    `Listing subscription created: id=${newSub.id}, plan=${plan}, addon=${include_concierge_addon}, covered=${toCover.length} listings`,
  );
}

// ============================================================
// Refund logging (audit only — no automatic day-reversal)
// ============================================================
async function handleChargeRefunded(charge: Stripe.Charge) {
  if (!charge.payment_intent) return;
  const supabaseAdmin = getSupabaseAdmin();

  const { data: payment } = await supabaseAdmin
    .from('paid_listing_payments')
    .select('id, listing_id, user_id')
    .eq('stripe_payment_intent_id', charge.payment_intent as string)
    .maybeSingle();

  if (!payment) {
    // Not an individual-listing payment we track; ignore.
    return;
  }

  await supabaseAdmin.from('paid_listing_refunds').insert({
    payment_id: payment.id,
    listing_id: payment.listing_id,
    user_id: payment.user_id,
    amount_cents: charge.amount_refunded ?? 0,
    stripe_charge_id: charge.id,
    stripe_refund_id: (charge.refunds?.data?.[0]?.id) || null,
    reason: charge.refunds?.data?.[0]?.reason || null,
  });

  console.log(`Logged refund for payment ${payment.id}: ${charge.amount_refunded} cents (no auto day-reversal)`);
}

// ============================================================
// Chargeback / dispute (charge.dispute.created) — REVOKE entitlement
// ============================================================
// A card dispute claws the money back, so unlike a refund (logged only) we
// actively revoke whatever the charge paid for and alert admins. The lookup
// spans all three money paths: individual paid days, featured placement, and
// subscription coverage.
async function handleChargeDispute(dispute: Stripe.Dispute) {
  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();

  // Resolve the payment_intent and customer behind the disputed charge.
  let paymentIntentId = (dispute.payment_intent as string) || null;
  let customerId: string | null = null;
  const chargeId = (dispute.charge as string) || null;
  if (chargeId) {
    try {
      const charge = await stripe.charges.retrieve(chargeId);
      paymentIntentId = paymentIntentId || (charge.payment_intent as string) || null;
      customerId = (charge.customer as string) || null;
    } catch (err) {
      console.error('Failed to retrieve disputed charge:', err);
    }
  }

  const revoked: string[] = [];

  // (1) Individual-listing paid days.
  if (paymentIntentId) {
    const { data: payment } = await supabaseAdmin
      .from('paid_listing_payments')
      .select('id, listing_id, user_id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();
    if (payment) {
      // Cap the paid balance to now and deactivate so the cron/enforcement
      // treats it as expired immediately.
      const { error: listErr } = await supabaseAdmin
        .from('listings')
        .update({
          paid_until: nowIso,
          expires_at: nowIso,
          is_active: false,
          updated_at: nowIso,
        })
        .eq('id', payment.listing_id);
      if (listErr) {
        throw new Error(`Dispute revoke (paid listing ${payment.listing_id}) failed: ${listErr.message}`);
      }
      // Record it in the refunds ledger too (money left the account).
      await supabaseAdmin.from('paid_listing_refunds').insert({
        payment_id: payment.id,
        listing_id: payment.listing_id,
        user_id: payment.user_id,
        amount_cents: dispute.amount ?? 0,
        stripe_charge_id: chargeId,
        stripe_refund_id: null,
        reason: `chargeback:${dispute.reason ?? 'unknown'}`,
      });
      revoked.push(`individual paid days on listing ${payment.listing_id}`);
    }
  }

  // (2) Featured placement.
  if (paymentIntentId) {
    const { data: featured } = await supabaseAdmin
      .from('featured_purchases')
      .select('id, listing_id, is_commercial')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();
    if (featured) {
      const listingTable = featured.is_commercial ? 'commercial_listings' : 'listings';
      const { error: fpErr } = await supabaseAdmin
        .from('featured_purchases')
        .update({ status: 'cancelled', featured_end: nowIso, updated_at: nowIso })
        .eq('id', featured.id);
      if (fpErr) {
        throw new Error(`Dispute revoke (featured purchase ${featured.id}) failed: ${fpErr.message}`);
      }
      const { error: listErr } = await supabaseAdmin
        .from(listingTable)
        .update({
          is_featured: false,
          featured_expires_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', featured.listing_id);
      if (listErr) {
        throw new Error(`Dispute revoke (featured ${listingTable} ${featured.listing_id}) failed: ${listErr.message}`);
      }
      revoked.push(`featured placement on ${listingTable} ${featured.listing_id}`);
    }
  }

  // (3) Subscription coverage. A subscription invoice charge has no direct
  // paid_listing/featured row; match by customer and expire the covering
  // subscription, then cascade-deactivate the user's listings.
  if (customerId && revoked.length === 0) {
    const { data: subs } = await supabaseAdmin
      .from('listing_subscriptions')
      .select('id, user_id, status')
      .eq('stripe_customer_id', customerId)
      .in('status', ['active', 'admin_active', 'trial', 'past_due']);
    for (const sub of (subs || []) as Array<{ id: string; user_id: string; status: string }>) {
      const { error: subErr } = await supabaseAdmin
        .from('listing_subscriptions')
        .update({ status: 'expired', cancelled_at: nowIso, updated_at: nowIso })
        .eq('id', sub.id);
      if (subErr) {
        throw new Error(`Dispute revoke (subscription ${sub.id}) failed: ${subErr.message}`);
      }
      try {
        await fetch(
          `${Deno.env.get('SUPABASE_URL')!}/functions/v1/cascade-deactivate-subscription`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: sub.user_id, listing_subscription_id: sub.id }),
          },
        );
      } catch (err) {
        console.error('Dispute cascade-deactivate call failed (cron will catch up):', err);
      }
      revoked.push(`subscription ${sub.id}`);
    }
  }

  // Always alert admins — even if nothing matched (manual reconciliation).
  const adminEmails = await getAdminEmails(supabaseAdmin);
  if (adminEmails.length > 0) {
    const amountStr = ((dispute.amount ?? 0) / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: (dispute.currency || 'usd').toUpperCase(),
    });
    const revokedHtml = revoked.length > 0
      ? `<ul>${revoked.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
      : `<p><strong>No matching entitlement was found</strong> — please reconcile manually in Stripe.</p>`;
    await sendEmail(
      adminEmails,
      `Chargeback opened — ${amountStr}`,
      brandWrap(
        'Chargeback / dispute opened',
        `<p>A card dispute was opened for <strong>${amountStr}</strong> (reason: ${escapeHtml(dispute.reason ?? 'unknown')}).</p>
         <p><strong>Dispute:</strong> ${escapeHtml(dispute.id)}<br/>
            <strong>Charge:</strong> ${escapeHtml(chargeId ?? 'n/a')}</p>
         <p>Revoked entitlements:</p>
         ${revokedHtml}`,
      ),
    );
  }

  console.log(`Dispute ${dispute.id} processed; revoked: ${revoked.join('; ') || 'none'}`);
}

Deno.serve(async (req) => {
  try {
    const signature = req.headers.get('Stripe-Signature');
    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 400 });
    }

    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
        undefined,
        cryptoProvider
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 });
    }

    console.log(`Stripe event received: ${event.type} (${event.id})`);

    // ---- Idempotency + retry-safety (stripe_webhook_events) ----
    // A row with processed_at SET = already processed successfully -> skip.
    // A row with processed_at NULL = seen but not yet done (a prior attempt
    // failed after a charge) -> reprocess; per-handler atomic unique-index
    // inserts prevent any double-grant. On money-critical failure we record the
    // error here and re-throw so the outer catch returns 500 and Stripe retries.
    const eventLog = getSupabaseAdmin();
    const { data: priorEvent } = await eventLog
      .from('stripe_webhook_events')
      .select('event_id, processed_at')
      .eq('event_id', event.id)
      .maybeSingle();

    if (priorEvent?.processed_at) {
      console.log(`Idempotency: event ${event.id} already processed; skipping.`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
    }

    if (!priorEvent) {
      // Claim the event. processed_at NULL until the handler succeeds. Under a
      // concurrent double-delivery the loser's insert hits the PK and errors
      // silently — harmless, the row already exists.
      await eventLog
        .from('stripe_webhook_events')
        .insert({ event_id: event.id, type: event.type, processed_at: null });
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata || {};

        if (metadata.type === 'concierge') {
          await handleConciergeCheckout(session);
        } else if (metadata.type === 'individual_listing') {
          await handleIndividualListingCheckout(session);
        } else if (metadata.type === 'listing_subscription') {
          await handleListingSubscriptionCheckout(session);
        } else {
          await handleFeaturedCheckout(session);
        }
      }

      if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
      }

      if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(charge);
      }

      if (event.type === 'charge.dispute.created') {
        const dispute = event.data.object as Stripe.Dispute;
        await handleChargeDispute(dispute);
      }
    } catch (handlerError) {
      // Record the failure for admin visibility and re-throw so the outer catch
      // returns 500 -> Stripe retries. processed_at stays NULL so the retry
      // reprocesses (handler atomic inserts guard against double-grant).
      const msg = handlerError instanceof Error ? handlerError.message : String(handlerError);
      await eventLog
        .from('stripe_webhook_events')
        .update({ error: msg.slice(0, 2000) })
        .eq('event_id', event.id);
      throw handlerError;
    }

    // Success: mark processed and clear any prior error.
    await eventLog
      .from('stripe_webhook_events')
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq('event_id', event.id);

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
});
