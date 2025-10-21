import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-id',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
};

Deno.serve(async (req: Request) => {
  console.log('[start-impersonation] Request received:', req.method);
  
  if (req.method === 'OPTIONS') {
    console.log('[start-impersonation] Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[start-impersonation] Getting auth header');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[start-impersonation] No authorization header');
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[start-impersonation] Verifying user');
    const token = authHeader.replace('Bearer ', '');

    // Create a client with the user's token to verify it
    const userSupabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    const { data: { user }, error: authError } = await userSupabase.auth.getUser();

    if (authError || !user) {
      console.error('[start-impersonation] Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[start-impersonation] Checking admin status for user:', user.id);
    const { data: adminProfile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !adminProfile?.is_admin) {
      console.error('[start-impersonation] Not admin:', profileError, adminProfile);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[start-impersonation] Parsing request body');
    const { impersonated_user_id } = await req.json();

    if (!impersonated_user_id) {
      console.error('[start-impersonation] Missing impersonated_user_id');
      return new Response(
        JSON.stringify({ error: 'Missing impersonated_user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[start-impersonation] Creating session for:', impersonated_user_id);
    const ip_address = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const user_agent = req.headers.get('user-agent') || 'unknown';

    const { data: sessionData, error: sessionError } = await supabase
      .rpc('start_impersonation_session', {
        p_admin_user_id: user.id,
        p_impersonated_user_id: impersonated_user_id,
        p_ip_address: ip_address,
        p_user_agent: user_agent
      });

    if (sessionError) {
      console.error('[start-impersonation] Session creation error:', sessionError);
      return new Response(
        JSON.stringify({ error: sessionError.message || 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[start-impersonation] Fetching impersonated profile');
    const { data: impersonatedProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, phone, agency, is_admin, created_at, updated_at')
      .eq('id', impersonated_user_id)
      .maybeSingle();

    if (fetchError || !impersonatedProfile) {
      console.error('[start-impersonation] Profile fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch impersonated user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[start-impersonation] Getting impersonated user auth data');
    const { data: impersonatedAuthUser, error: impersonatedUserError } = await supabase.auth.admin.getUserById(impersonated_user_id);

    if (impersonatedUserError || !impersonatedAuthUser?.user) {
      console.error('[start-impersonation] Failed to get impersonated user:', impersonatedUserError);
      return new Response(
        JSON.stringify({ error: 'Failed to get impersonated user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[start-impersonation] Success! Returning session data');
    return new Response(
      JSON.stringify({
        success: true,
        session: sessionData,
        impersonated_profile: impersonatedProfile,
        impersonated_user_id: impersonated_user_id,
        admin_user_id: user.id
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[start-impersonation] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});