import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Verify user is admin
    const { data: adminProfile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !adminProfile?.is_admin) {
      throw new Error('Unauthorized: Admin access required');
    }

    const { session_token, impersonated_user_id } = await req.json();

    if (!session_token || !impersonated_user_id) {
      throw new Error('Missing required fields');
    }

    // Verify the session token exists and belongs to this admin
    const { data: session, error: sessionError } = await supabase
      .from('impersonation_sessions')
      .select('id, impersonated_user_id, admin_user_id')
      .eq('session_token', session_token)
      .eq('admin_user_id', user.id)
      .eq('impersonated_user_id', impersonated_user_id)
      .maybeSingle();

    if (sessionError || !session) {
      throw new Error('Invalid or expired impersonation session');
    }

    // Get the impersonated user's email
    const { data: impersonatedUser, error: userError } = await supabase.auth.admin.getUserById(impersonated_user_id);

    if (userError || !impersonatedUser?.user) {
      throw new Error('Failed to get impersonated user');
    }

    // Create a one-time sign-in link for the impersonated user
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: impersonatedUser.user.email!,
    });

    if (linkError || !linkData) {
      throw new Error('Failed to generate auth link');
    }

    // Parse the tokens from the action link
    const actionLink = linkData.properties.action_link;
    const urlParams = new URL(actionLink).hash.substring(1);
    const params = new URLSearchParams(urlParams);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');

    if (!access_token || !refresh_token) {
      throw new Error('Failed to extract tokens from link');
    }

    return new Response(
      JSON.stringify({
        access_token,
        refresh_token
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-impersonation-auth-session:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});