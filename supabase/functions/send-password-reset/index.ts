import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ ok: false, message: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    let body: { to?: string | string[]; subject?: string };
    try {
      body = await req.json();
    } catch (jsonError) {
      console.error('Invalid JSON body:', jsonError);
      return new Response(
        JSON.stringify({ ok: false, message: 'Invalid JSON body', details: jsonError }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const { to, subject } = body;
    if (!to) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Missing to field' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Server configuration error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const redirectUrl = `${Deno.env.get('VITE_SITE_URL') || 'http://localhost:5173'}/auth`;
    const email = Array.isArray(to) ? to[0] : to;

    let actionLink: string;
    try {
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: redirectUrl },
      });
      if (error) throw error;
      actionLink = data?.properties?.action_link || data?.action_link;
      if (!actionLink) throw new Error('Missing action link');
    } catch (supabaseError: unknown) {
      console.error('Supabase generateLink error:', supabaseError);
      const err = supabaseError as { code?: string; message?: string };
      return new Response(
        JSON.stringify({
          ok: false,
          source: 'supabase',
          code: err.code,
          message: err.message || 'Failed to generate reset link',
          details: err,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const html = `<p>Click the link below to reset your password:</p><p><a href="${actionLink}">Reset Password</a></p>`;

    const emailPayload = {
      from: 'HaDirot <noreply@hadirot.com>',
      to: Array.isArray(to) ? to : [to],
      subject: subject || 'Reset your password',
      html,
    };

    let resendData: { id: string };
    try {
      const resendResponse = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      });
      const resendJson: unknown = await resendResponse.json();
      if (!resendResponse.ok) throw resendJson;
      resendData = resendJson as { id: string };
    } catch (resendError: unknown) {
      console.error('Resend email error:', resendError);
      const err = resendError as { message?: string };
      return new Response(
        JSON.stringify({
          ok: false,
          source: 'resend',
          message: err.message || 'Failed to send email',
          details: err,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, id: resendData.id }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Unexpected error in send-password-reset function:', error);
    return new Response(
      JSON.stringify({ ok: false, message: 'Internal server error', details: error }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
