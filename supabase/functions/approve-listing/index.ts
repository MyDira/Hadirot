import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ ok: false, source: 'request', message: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { listingId } = await req.json();
    if (!listingId) {
      return new Response(
        JSON.stringify({ ok: false, source: 'request', message: 'listingId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!supabaseUrl || !supabaseKey || !resendApiKey) {
      console.error('Missing environment variables', { supabaseUrl, supabaseKey, resendApiKey });
      return new Response(
        JSON.stringify({ ok: false, source: 'env', message: 'Missing environment variables' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: listing, error } = await supabase
      .from('listings')
      .update({ approved: true, is_active: true })
      .eq('id', listingId)
      .select('id, title, profiles!listings_user_id_fkey(email, full_name)')
      .single();

    if (error || !listing) {
      console.error('Failed to update listing', error);
      return new Response(
        JSON.stringify({ ok: false, source: 'database', message: 'Failed to update listing', details: error?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ownerEmail = listing.profiles?.email;
    const ownerName = listing.profiles?.full_name;
    if (!ownerEmail || !ownerName) {
      console.error('Missing owner contact information', listing);
      return new Response(
        JSON.stringify({ ok: false, source: 'data', message: 'Owner contact information missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const siteUrl = Deno.env.get('VITE_SITE_URL') || 'http://localhost:5173';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9;">
        <div style="background-color: #28a745; color: white; padding: 30px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
            <svg width="40" height="40" viewBox="0 0 32 32" style="color: white; margin-right: 10px;">
              <path d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
              <circle cx="23" cy="8" r="1" fill="currentColor"/>
            </svg>
            <span style="font-size: 28px; font-weight: bold;">HaDirot</span>
          </div>
          <h1 style="margin: 0; font-size: 24px;">🎉 Listing Approved!</h1>
        </div>

        <div style="padding: 30px; background-color: white; margin: 0 20px;">
          <h2 style="color: #4E4B43; margin-top: 0; font-size: 20px;">Congratulations ${ownerName}!</h2>

          <p style="color: #333; line-height: 1.6; font-size: 16px;">
            Your listing "<strong>${listing.title}</strong>" has been approved and is now live on HaDirot!
          </p>

          <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h3 style="color: #155724; margin-top: 0; font-size: 18px;">✅ Your listing is now:</h3>
            <ul style="color: #155724; line-height: 1.6; margin: 0; padding-left: 20px;">
              <li>Visible to thousands of potential tenants</li>
              <li>Searchable in our browse section</li>
              <li>Ready to receive inquiries</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${siteUrl}/listing/${listingId}"
               style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px; margin-right: 10px;">
              View Live Listing
            </a>
            <a href="${siteUrl}/dashboard"
               style="background-color: #4E4B43; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
              My Dashboard
            </a>
          </div>

          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
            <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0;">
              <strong>What's next?</strong> Keep your listing updated and respond promptly to inquiries.
              You can edit your listing details anytime from your dashboard.
            </p>
          </div>
        </div>

        <div style="background-color: #4E4B43; color: #E5D8C1; padding: 20px; text-align: center; margin: 0 20px;">
          <p style="margin: 0; font-size: 14px;">
            © 2025 HaDirot. All rights reserved.<br>
            NYC's premier Jewish rental platform
          </p>
        </div>
      </div>
    `;

    const emailPayload = {
      from: 'HaDirot <noreply@hadirot.com>',
      to: [ownerEmail],
      subject: `🎉 Listing Approved: ${listing.title} is now live! - HaDirot`,
      html,
    };

    const resendResponse = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error('Failed to send email via Resend', { status: resendResponse.status, body: errorText });
      return new Response(
        JSON.stringify({ ok: false, source: 'email', message: 'Failed to send approval email', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error in approve-listing', error);
    return new Response(
      JSON.stringify({ ok: false, source: 'unknown', message: 'Unexpected error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
