import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=denonext';

const stripe = new Stripe(Deno.env.get('STRIPE_API_KEY')!, {
  apiVersion: '2024-11-20',
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

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

    if (event.type !== 'checkout.session.completed') {
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const { listing_id, user_id, plan, duration_days } = session.metadata || {};

    if (!listing_id || !user_id || !plan || !duration_days) {
      console.error('Missing metadata in checkout session:', session.id);
      return new Response(JSON.stringify({ error: 'Missing metadata' }), { status: 400 });
    }

    const durationDaysNum = parseInt(duration_days, 10);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

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

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
});
