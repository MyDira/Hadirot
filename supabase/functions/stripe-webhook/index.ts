import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=denonext';

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

async function handleFeaturedCheckout(session: Stripe.Checkout.Session) {
  const { listing_id, user_id, plan, duration_days } = session.metadata || {};
  if (!listing_id || !user_id || !plan || !duration_days) {
    console.error('Missing metadata in featured checkout session:', session.id);
    return;
  }

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
    await supabaseAdmin.from('featured_purchases').insert({
      listing_id,
      user_id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent as string,
      plan,
      amount_cents: session.amount_total || 0,
      status: 'paid',
      purchased_at: new Date().toISOString(),
      duration_days: durationDaysNum,
    });
  }

  const { data: listing } = await supabaseAdmin
    .from('listings')
    .select('approved, is_active')
    .eq('id', listing_id)
    .maybeSingle();

  if (listing?.approved && listing?.is_active) {
    const now = new Date();
    const endDate = new Date(now.getTime() + durationDaysNum * 24 * 60 * 60 * 1000);

    await supabaseAdmin
      .from('featured_purchases')
      .update({
        status: 'active',
        featured_start: now.toISOString(),
        featured_end: endDate.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('stripe_checkout_session_id', session.id);

    await supabaseAdmin
      .from('listings')
      .update({
        is_featured: true,
        featured_started_at: now.toISOString(),
        featured_expires_at: endDate.toISOString(),
        featured_plan: plan,
        updated_at: now.toISOString(),
      })
      .eq('id', listing_id);

    console.log(`Featured activated for listing ${listing_id} until ${endDate.toISOString()}`);
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

  // Status mapping shared by both subscription tables.
  function computeUpdate(): Record<string, unknown> {
    const update: Record<string, unknown> = { current_period_end: periodEnd };
    if (subscription.cancel_at_period_end === true) {
      update.status = 'cancelled';
      update.cancelled_at = new Date().toISOString();
    } else if (subscription.cancel_at_period_end === false && subscription.status === 'active') {
      update.status = 'active';
      update.cancelled_at = null;
    } else {
      const statusMap: Record<string, string> = {
        active: 'active',
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
    const update = computeUpdate();
    const prevStatus = listingSubRow.status as string;
    const newStatus = update.status as string;

    await supabaseAdmin
      .from('listing_subscriptions')
      .update(update)
      .eq('id', listingSubRow.id);

    console.log(`Listing subscription ${listingSubRow.id} status -> ${newStatus}`);

    // Cascade-cancel any addon_concierge row linked to this parent.
    if (newStatus === 'cancelled' || newStatus === 'expired' || newStatus === 'past_due') {
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

    // If transitioning AWAY from an active state, cascade-deactivate the user's listings.
    const wasActive = prevStatus === 'active' || prevStatus === 'admin_active';
    const stillActive = newStatus === 'active' || newStatus === 'admin_active';
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

  // Idempotency: skip if a payment row already exists for this session.
  const { data: existingPayment } = await supabaseAdmin
    .from('paid_listing_payments')
    .select('id')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle();
  if (existingPayment) {
    console.log(`Idempotency: paid_listing_payment already exists for session ${session.id}`);
    return;
  }

  // Look up listing state (must exist).
  const { data: listing } = await supabaseAdmin
    .from('listings')
    .select('id, payment_kind, trial_started_at, paid_until, is_active, listing_type')
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

  // Compute new paid_until.
  const now = new Date();
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

  // Record the payment (ledger).
  await supabaseAdmin.from('paid_listing_payments').insert({
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

  // Pull the Stripe subscription to extract current_period_end + billing day.
  let currentPeriodEnd: string | null = null;
  let billingDayOfMonth: number | null = null;
  try {
    const sub = await stripe.subscriptions.retrieve(stripeSubId);
    currentPeriodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;
    if (sub.current_period_start) {
      const startDate = new Date(sub.current_period_start * 1000);
      const day = startDate.getUTCDate();
      // Clamp to 1-28 to avoid month-end rollover edge cases.
      billingDayOfMonth = Math.min(28, Math.max(1, day));
    }
  } catch (err) {
    console.error('Failed to retrieve Stripe subscription:', err);
  }

  const listingCap = plan === 'agent' ? 7 : null;

  const { data: newSub, error: insertErr } = await supabaseAdmin
    .from('listing_subscriptions')
    .insert({
      user_id,
      plan,
      status: 'active',
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
    console.error('Failed to insert listing_subscriptions row:', insertErr);
    return;
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
  // up to the cap. Pick newest first.
  const { data: candidates } = await supabaseAdmin
    .from('listings')
    .select('id')
    .eq('user_id', user_id)
    .eq('listing_type', 'rental')
    .eq('is_active', true)
    .in('payment_kind', ['individual_trial', 'individual_paid', 'legacy_free'])
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

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
});
