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
      const origin = 'https://hadirot.com';
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
        sources: null,
      });

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
        <p><strong>Listing Sources:</strong> Pending user setup</p>
        <p><strong>Subscription started:</strong> ${new Date().toLocaleDateString()}</p>
        `,
      );
      await sendEmail(adminEmails, `New VIP Concierge Subscriber \u2014 ${userName}`, html);
    }
    console.log(`Concierge Tier 3 VIP activated for user ${user_id}`);
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const supabaseAdmin = getSupabaseAdmin();
  const stripeSubId = subscription.id;

  const { data: record } = await supabaseAdmin
    .from('concierge_subscriptions')
    .select('id')
    .eq('stripe_subscription_id', stripeSubId)
    .maybeSingle();

  if (!record) return;

  const statusMap: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'cancelled',
    unpaid: 'past_due',
  };

  const newStatus = statusMap[subscription.status] || 'active';
  const update: Record<string, unknown> = { status: newStatus };
  if (subscription.status === 'canceled') {
    update.cancelled_at = new Date().toISOString();
  }

  await supabaseAdmin
    .from('concierge_subscriptions')
    .update(update)
    .eq('id', record.id);

  console.log(`Concierge subscription ${record.id} status updated to ${newStatus}`);
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
        Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')!,
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
      } else {
        await handleFeaturedCheckout(session);
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdate(subscription);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
});
