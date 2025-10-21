import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-id',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
};

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[start-impersonation:${requestId}] Request received:`, req.method);

  if (req.method === 'OPTIONS') {
    console.log(`[start-impersonation:${requestId}] Handling OPTIONS request`);
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Admin client for privileged operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Regular client for verifying the user's JWT
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    console.log(`[start-impersonation:${requestId}] Getting auth header`);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error(`[start-impersonation:${requestId}] ❌ No authorization header`);
      return new Response(
        JSON.stringify({ error: 'No authorization header provided. Please ensure you are logged in.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[start-impersonation:${requestId}] Verifying user token`);
    const token = authHeader.replace('Bearer ', '');

    // Verify the JWT token using the anon client
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.error(`[start-impersonation:${requestId}] ❌ Auth error:`, authError?.message || 'No user');
      return new Response(
        JSON.stringify({ error: `Authentication failed: ${authError?.message || 'Invalid session'}` }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[start-impersonation:${requestId}] ✓ User verified:`, user.id);

    console.log(`[start-impersonation:${requestId}] Checking admin status for user:`, user.id);
    const { data: adminProfile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !adminProfile?.is_admin) {
      console.error(`[start-impersonation:${requestId}] ❌ Not admin:`, profileError?.message, 'is_admin:', adminProfile?.is_admin);
      return new Response(
        JSON.stringify({ error: 'Access denied: Only administrators can use impersonation' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[start-impersonation:${requestId}] ✓ Admin verified:`, adminProfile.full_name);

    console.log(`[start-impersonation:${requestId}] Parsing request body`);
    const { impersonated_user_id } = await req.json();

    if (!impersonated_user_id) {
      console.error(`[start-impersonation:${requestId}] ❌ Missing impersonated_user_id`);
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: impersonated_user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[start-impersonation:${requestId}] Creating session for:`, impersonated_user_id);
    const ip_address = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const user_agent = req.headers.get('user-agent') || 'unknown';

    console.log(`[start-impersonation:${requestId}] Session metadata:`, { ip_address, user_agent: user_agent.substring(0, 50) });

    const { data: sessionData, error: sessionError } = await supabase
      .rpc('start_impersonation_session', {
        p_admin_user_id: user.id,
        p_impersonated_user_id: impersonated_user_id,
        p_ip_address: ip_address,
        p_user_agent: user_agent
      });

    if (sessionError) {
      console.error(`[start-impersonation:${requestId}] ❌ Session creation error:`, sessionError.message);
      return new Response(
        JSON.stringify({ error: `Failed to create impersonation session: ${sessionError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!sessionData) {
      console.error(`[start-impersonation:${requestId}] ❌ Session creation returned no data`);
      return new Response(
        JSON.stringify({ error: 'Failed to create impersonation session: No session data returned' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[start-impersonation:${requestId}] ✓ Session created:`, sessionData.session_token.substring(0, 8) + '...');

    console.log(`[start-impersonation:${requestId}] Fetching impersonated profile`);
    const { data: impersonatedProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, phone, agency, is_admin, created_at, updated_at')
      .eq('id', impersonated_user_id)
      .maybeSingle();

    if (fetchError || !impersonatedProfile) {
      console.error(`[start-impersonation:${requestId}] ❌ Profile fetch error:`, fetchError?.message);
      return new Response(
        JSON.stringify({ error: `Failed to fetch user profile: ${fetchError?.message || 'User not found'}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (impersonatedProfile.is_admin) {
      console.error(`[start-impersonation:${requestId}] ❌ Cannot impersonate admin user:`, impersonatedProfile.full_name);
      return new Response(
        JSON.stringify({ error: 'Cannot impersonate another administrator user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[start-impersonation:${requestId}] ✓ Target profile loaded:`, impersonatedProfile.full_name, `(${impersonatedProfile.role})`);

    console.log(`[start-impersonation:${requestId}] Verifying auth user exists`);
    const { data: impersonatedAuthUser, error: impersonatedUserError } = await supabase.auth.admin.getUserById(impersonated_user_id);

    if (impersonatedUserError || !impersonatedAuthUser?.user) {
      console.error(`[start-impersonation:${requestId}] ❌ Failed to get auth user:`, impersonatedUserError?.message);
      return new Response(
        JSON.stringify({ error: `Failed to verify user authentication: ${impersonatedUserError?.message || 'User not found'}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[start-impersonation:${requestId}] ✓ Auth user verified:`, impersonatedAuthUser.user.email);
    console.log(`[start-impersonation:${requestId}] ✅ SUCCESS - Returning session data`);

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
    console.error(`[start-impersonation:${requestId}] ❌ UNEXPECTED ERROR:`, error);
    console.error(`[start-impersonation:${requestId}] Error stack:`, error.stack);
    return new Response(
      JSON.stringify({
        error: `Impersonation failed: ${error.message || 'Internal server error'}`,
        requestId: requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});