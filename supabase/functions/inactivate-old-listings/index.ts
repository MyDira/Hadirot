import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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

    const { data: residentialData, error: residentialError } = await supabaseClient.rpc(
      'auto_inactivate_old_listings'
    );

    if (residentialError) {
      console.error('Error calling auto_inactivate_old_listings:', residentialError);
    } else {
      console.log('Successfully inactivated old residential listings:', residentialData);
    }

    const { data: commercialData, error: commercialError } = await supabaseClient.rpc(
      'auto_inactivate_old_commercial_listings'
    );

    if (commercialError) {
      console.error('Error calling auto_inactivate_old_commercial_listings:', commercialError);
    } else {
      console.log('Successfully inactivated old commercial listings:', commercialData);
    }

    const bothFailed = residentialError && commercialError;

    return new Response(
      JSON.stringify({
        message: bothFailed ? 'Failed to inactivate listings' : 'Listings inactivated',
        residential: { data: residentialData ?? null, error: residentialError?.message ?? null },
        commercial: { data: commercialData ?? null, error: commercialError?.message ?? null },
      }),
      {
        status: bothFailed ? 500 : 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Unexpected error in inactivate-old-listings function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
