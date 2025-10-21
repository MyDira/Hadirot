import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[admin-sign-in-as-user:${requestId}] Request received:`, req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error(`[admin-sign-in-as-user:${requestId}] No authorization header`);
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: adminUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !adminUser) {
      console.error(`[admin-sign-in-as-user:${requestId}] Auth failed:`, authError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-sign-in-as-user:${requestId}] Admin user:`, adminUser.id);

    // Verify admin status
    const { data: adminProfile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin, full_name')
      .eq('id', adminUser.id)
      .maybeSingle();

    if (profileError || !adminProfile?.is_admin) {
      console.error(`[admin-sign-in-as-user:${requestId}] Not admin:`, profileError?.message);
      return new Response(
        JSON.stringify({ error: 'Admin privileges required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-sign-in-as-user:${requestId}] Admin verified:`, adminProfile.full_name);

    // Get target user ID from request
    const { target_user_id } = await req.json();

    if (!target_user_id) {
      console.error(`[admin-sign-in-as-user:${requestId}] Missing target_user_id`);
      return new Response(
        JSON.stringify({ error: 'target_user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-sign-in-as-user:${requestId}] Target user ID:`, target_user_id);

    // Verify target user exists and is not an admin
    const { data: targetProfile, error: targetProfileError } = await supabase
      .from('profiles')
      .select('is_admin, full_name, email')
      .eq('id', target_user_id)
      .maybeSingle();

    if (targetProfileError || !targetProfile) {
      console.error(`[admin-sign-in-as-user:${requestId}] Target user not found:`, targetProfileError?.message);
      return new Response(
        JSON.stringify({ error: 'Target user not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (targetProfile.is_admin) {
      console.error(`[admin-sign-in-as-user:${requestId}] Cannot impersonate admin:`, targetProfile.full_name);
      return new Response(
        JSON.stringify({ error: 'Cannot sign in as another administrator' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-sign-in-as-user:${requestId}] Target user verified:`, targetProfile.full_name);

    // Get target user's auth record
    const { data: targetAuthUser, error: targetAuthError } = await supabase.auth.admin.getUserById(target_user_id);

    if (targetAuthError || !targetAuthUser?.user) {
      console.error(`[admin-sign-in-as-user:${requestId}] Failed to get auth user:`, targetAuthError?.message);
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve user authentication data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-sign-in-as-user:${requestId}] Target auth user email:`, targetAuthUser.user.email);

    // Generate authentication link (magic link) for the target user
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: targetAuthUser.user.email!,
    });

    if (linkError || !linkData) {
      console.error(`[admin-sign-in-as-user:${requestId}] Link generation failed:`, linkError?.message);
      return new Response(
        JSON.stringify({ error: 'Failed to generate authentication tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-sign-in-as-user:${requestId}] Link generated successfully`);

    // Extract the hashed_token from the generated link
    const hashedToken = linkData.properties?.hashed_token;

    if (!hashedToken) {
      console.error(`[admin-sign-in-as-user:${requestId}] No hashed_token in response`);
      return new Response(
        JSON.stringify({ error: 'Failed to extract authentication token from link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-sign-in-as-user:${requestId}] Hashed token extracted, verifying...`);

    // Verify the hashed_token to get valid JWT tokens
    // We need to use a client instance without the service role key for verifyOtp
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);

    const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
      token_hash: hashedToken,
      type: 'magiclink',
    });

    if (verifyError || !verifyData?.session) {
      console.error(`[admin-sign-in-as-user:${requestId}] Token verification failed:`, verifyError?.message);
      return new Response(
        JSON.stringify({ error: `Failed to verify authentication token: ${verifyError?.message || 'Unknown error'}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-sign-in-as-user:${requestId}] Token verified successfully`);

    // Extract the tokens from the verified session
    const { access_token, refresh_token } = verifyData.session;

    // Validate access token is a proper JWT (should have 3 parts separated by dots)
    if (!access_token || access_token.split('.').length !== 3) {
      console.error(`[admin-sign-in-as-user:${requestId}] Invalid access token structure`);
      console.error(`[admin-sign-in-as-user:${requestId}] Access token length:`, access_token?.length);
      return new Response(
        JSON.stringify({ error: 'Received invalid access token structure' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate refresh token exists (it may not be a JWT - can be an opaque token)
    if (!refresh_token) {
      console.error(`[admin-sign-in-as-user:${requestId}] Missing refresh token`);
      return new Response(
        JSON.stringify({ error: 'Missing refresh token in session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-sign-in-as-user:${requestId}] Tokens validated successfully`);
    console.log(`[admin-sign-in-as-user:${requestId}] Access token is JWT:`, access_token.split('.').length === 3);
    console.log(`[admin-sign-in-as-user:${requestId}] Refresh token length:`, refresh_token.length);
    console.log(`[admin-sign-in-as-user:${requestId}] SUCCESS - Admin ${adminProfile.full_name} signing in as ${targetProfile.full_name}`);

    // Log for security audit (server-side only)
    console.log(`[AUDIT] Admin ${adminUser.id} (${adminProfile.full_name}) signed in as user ${target_user_id} (${targetProfile.full_name}) at ${new Date().toISOString()}`);

    return new Response(
      JSON.stringify({
        access_token,
        refresh_token,
        user: {
          id: verifyData.user.id,
          email: verifyData.user.email,
          full_name: targetProfile.full_name
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[admin-sign-in-as-user:${requestId}] Unexpected error:`, error.message);
    console.error(`[admin-sign-in-as-user:${requestId}] Stack:`, error.stack);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        requestId: requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
