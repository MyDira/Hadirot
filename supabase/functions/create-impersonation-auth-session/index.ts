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

    console.log('[create-impersonation-auth-session] Generating link for:', impersonatedUser.user.email);

    // Create a one-time sign-in link for the impersonated user
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: impersonatedUser.user.email!,
    });

    if (linkError) {
      console.error('[create-impersonation-auth-session] Link generation error:', linkError);
      throw new Error(`Failed to generate auth link: ${linkError.message}`);
    }

    if (!linkData) {
      throw new Error('Failed to generate auth link: no data returned');
    }

    console.log('[create-impersonation-auth-session] Link data received:', Object.keys(linkData));
    console.log('[create-impersonation-auth-session] Properties:', linkData.properties);

    // Parse the tokens from the hashed_token which is the actual auth token
    // The hashed_token IS the access token we can use
    const hashed_token = linkData.properties.hashed_token;

    if (!hashed_token) {
      console.error('[create-impersonation-auth-session] No hashed_token in response');
      throw new Error('Failed to extract token from link');
    }

    // For refresh token, we need to extract it from the action_link
    const actionLink = linkData.properties.action_link;
    console.log('[create-impersonation-auth-session] Action link:', actionLink);

    let access_token = hashed_token;
    let refresh_token = null;

    // Try to extract tokens from the URL fragment
    try {
      const url = new URL(actionLink);
      const fragment = url.hash.substring(1); // Remove the #
      const params = new URLSearchParams(fragment);

      const accessFromUrl = params.get('access_token');
      const refreshFromUrl = params.get('refresh_token');

      if (accessFromUrl) access_token = accessFromUrl;
      if (refreshFromUrl) refresh_token = refreshFromUrl;

      console.log('[create-impersonation-auth-session] Extracted tokens:', {
        hasAccess: !!access_token,
        hasRefresh: !!refresh_token
      });
    } catch (e) {
      console.error('[create-impersonation-auth-session] Failed to parse action link:', e);
    }

    if (!access_token) {
      throw new Error('Failed to extract access token');
    }

    // If we don't have a refresh token, that's ok - the access token should be enough for a short session
    return new Response(
      JSON.stringify({
        access_token,
        refresh_token: refresh_token || access_token // Use access token as fallback
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