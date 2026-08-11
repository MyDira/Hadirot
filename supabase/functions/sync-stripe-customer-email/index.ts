// Pushes the caller's current Supabase Auth email onto their Stripe customer
// record, so invoices and receipts follow an email change instead of going to
// the address they signed up with.
//
// Deliberately takes no email in the request body: it reads whatever address
// Supabase Auth has already verified for the caller. That makes the function
// safe to call at any time, idempotent, and impossible to use to point someone
// else's billing mail somewhere new.
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_API_KEY')!, {
  apiVersion: '2023-10-16',
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!user.email) {
      return new Response(JSON.stringify({ synced: false, reason: 'no_auth_email' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    const stripeCustomerId = profile?.stripe_customer_id || '';

    // Most users have never checked out, so they have no Stripe customer yet.
    // Their email gets set correctly whenever one is first created.
    if (!stripeCustomerId) {
      return new Response(JSON.stringify({ synced: false, reason: 'no_stripe_customer' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const customer = await stripe.customers.retrieve(stripeCustomerId);

    if (customer.deleted) {
      return new Response(JSON.stringify({ synced: false, reason: 'customer_deleted' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if ((customer.email || '').toLowerCase() === user.email.toLowerCase()) {
      return new Response(JSON.stringify({ synced: false, reason: 'already_current' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await stripe.customers.update(stripeCustomerId, { email: user.email });

    return new Response(JSON.stringify({ synced: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error syncing Stripe customer email:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
