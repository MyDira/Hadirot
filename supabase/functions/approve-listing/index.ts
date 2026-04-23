import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sendViaZepto, renderBrandEmail } from '../_shared/zepto.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const supabaseAuthClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAuthClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: profile } = await supabaseAuthClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { listingId, isCommercial } = await req.json();
    console.log('[EDGE] approve-listing called', { listingId, isCommercial, at: new Date().toISOString() });

    if (!listingId) {
      return new Response(
        JSON.stringify({ error: 'Missing listingId parameter' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let listingData: { id: string; title: string | null; user_id: string } | null = null;

    if (isCommercial) {
      const { data, error } = await supabaseClient
        .from('commercial_listings')
        .update({ approved: true, is_active: true, updated_at: new Date().toISOString() })
        .eq('id', listingId)
        .select('id, title, user_id')
        .single();

      console.log('[EDGE] approve-listing updated commercial listing to approved/active', { listingId });

      if (error) {
        console.error('Error approving commercial listing:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to approve listing' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      listingData = data;
    } else {
      const { data, error } = await supabaseClient
        .from('listings')
        .update({ approved: true, is_active: true })
        .eq('id', listingId)
        .select('id, title, user_id')
        .single();

      console.log('[EDGE] approve-listing updated listing to approved/active', { listingId });

      if (error) {
        console.error('Error approving listing:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to approve listing' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      listingData = data;
    }

    // Fetch owner email from auth.users via service role — profiles does not store email
    const { data: userData, error: userError } = await supabaseClient.auth.admin.getUserById(listingData.user_id);
    const ownerEmail = userData?.user?.email ?? null;

    if (userError || !ownerEmail) {
      console.warn('[EDGE] approve-listing: could not fetch owner email, skipping notification', {
        listingId,
        userId: listingData.user_id,
        userError,
      });
    } else {
      try {
        const listingTitle = listingData.title ?? 'Your listing';
        const siteUrl = Deno.env.get('SITE_URL') ?? 'https://hadirot.com';
        const listingUrl = `${siteUrl}/listing/${listingData.id}`;

        const html = renderBrandEmail({
          title: 'Your Listing Has Been Approved',
          intro: 'Great news!',
          bodyHtml: `<p>Your listing <strong>${listingTitle}</strong> has been approved and is now live on Hadirot.</p>`,
          ctaLabel: 'View Live Listing',
          ctaHref: listingUrl,
        });

        await sendViaZepto({
          to: ownerEmail,
          subject: `Listing Approved: ${listingTitle} is now live! - Hadirot`,
          html,
        });

        console.log('[EDGE] approve-listing: approval email sent', { listingId, to: ownerEmail });
      } catch (emailErr) {
        console.error('[EDGE] approve-listing: failed to send approval email (approval still succeeded)', emailErr);
      }
    }

    return new Response(
      JSON.stringify({ message: 'Listing approved', listing: listingData }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Unexpected error in approve-listing function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
