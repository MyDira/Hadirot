import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_API_KEY')!, {
  apiVersion: '2024-11-20',
});

const VALID_PLANS: Record<string, number> = {
  '7day': 7,
  '14day': 14,
  '30day': 30,
};

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

    const { listing_id, plan, price_id } = await req.json();

    if (!listing_id || !plan || !price_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!VALID_PLANS[plan]) {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: listing, error: listingError } = await supabaseAdmin
      .from('listings')
      .select('id, user_id, title, is_featured, featured_expires_at, approved, is_active')
      .eq('id', listing_id)
      .maybeSingle();

    if (listingError || !listing) {
      return new Response(JSON.stringify({ error: 'Listing not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (listing.user_id !== user.id && !profile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Not authorized for this listing' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (listing.is_featured && listing.featured_expires_at && new Date(listing.featured_expires_at) > new Date()) {
      return new Response(JSON.stringify({ error: 'Listing is already featured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existingPurchase } = await supabaseAdmin
      .from('featured_purchases')
      .select('id')
      .eq('listing_id', listing_id)
      .in('status', ['pending', 'paid'])
      .limit(1)
      .maybeSingle();

    if (existingPurchase) {
      return new Response(JSON.stringify({ error: 'A purchase is already pending for this listing' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const origin = req.headers.get('origin') || 'https://hadirot.com';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: price_id, quantity: 1 }],
      metadata: {
        listing_id,
        user_id: user.id,
        plan,
        duration_days: String(VALID_PLANS[plan]),
        listing_title: (listing.title || 'Listing').substring(0, 100),
      },
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard?featured=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard?featured=cancelled`,
      customer_email: user.email,
    });

    const amountMap: Record<string, number> = { '7day': 2500, '14day': 4000, '30day': 7500 };

    await supabaseAdmin.from('featured_purchases').insert({
      listing_id,
      user_id: user.id,
      stripe_checkout_session_id: session.id,
      plan,
      amount_cents: amountMap[plan],
      status: 'pending',
      duration_days: VALID_PLANS[plan],
    });

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
