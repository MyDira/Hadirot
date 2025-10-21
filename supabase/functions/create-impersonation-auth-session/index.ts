import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[create-auth-session:${requestId}] Request received:`, req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error(`[create-auth-session:${requestId}] ❌ No authorization header`);
      throw new Error('No authorization header provided');
    }

    const token = authHeader.replace('Bearer ', '');
    console.log(`[create-auth-session:${requestId}] Verifying admin token`);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error(`[create-auth-session:${requestId}] ❌ Auth failed:`, authError?.message);
      throw new Error(`Authentication failed: ${authError?.message || 'Invalid token'}`);
    }

    console.log(`[create-auth-session:${requestId}] ✓ Admin authenticated:`, user.id);

    // Verify user is admin
    console.log(`[create-auth-session:${requestId}] Verifying admin status`);
    const { data: adminProfile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !adminProfile?.is_admin) {
      console.error(`[create-auth-session:${requestId}] ❌ Not admin:`, profileError?.message);
      throw new Error('Access denied: Admin privileges required');
    }

    console.log(`[create-auth-session:${requestId}] ✓ Admin verified:`, adminProfile.full_name);

    const { session_token, impersonated_user_id } = await req.json();

    console.log(`[create-auth-session:${requestId}] Session token:`, session_token?.substring(0, 8) + '...');
    console.log(`[create-auth-session:${requestId}] Impersonated user:`, impersonated_user_id);

    if (!session_token || !impersonated_user_id) {
      console.error(`[create-auth-session:${requestId}] ❌ Missing required fields`);
      throw new Error('Missing required fields: session_token and impersonated_user_id');
    }

    // Verify the session token exists and belongs to this admin
    console.log(`[create-auth-session:${requestId}] Validating impersonation session`);
    const { data: session, error: sessionError } = await supabase
      .from('impersonation_sessions')
      .select('id, impersonated_user_id, admin_user_id, expires_at')
      .eq('session_token', session_token)
      .eq('admin_user_id', user.id)
      .eq('impersonated_user_id', impersonated_user_id)
      .maybeSingle();

    if (sessionError) {
      console.error(`[create-auth-session:${requestId}] ❌ Session query error:`, sessionError.message);
      throw new Error(`Failed to validate session: ${sessionError.message}`);
    }

    if (!session) {
      console.error(`[create-auth-session:${requestId}] ❌ Session not found`);
      throw new Error('Impersonation session not found or expired');
    }

    // Check if session has expired
    const expiresAt = new Date(session.expires_at);
    const now = new Date();
    if (now >= expiresAt) {
      console.error(`[create-auth-session:${requestId}] ❌ Session expired:`, expiresAt);
      throw new Error('Impersonation session has expired');
    }

    console.log(`[create-auth-session:${requestId}] ✓ Session validated, expires:`, expiresAt.toISOString());

    // Get the impersonated user's email
    console.log(`[create-auth-session:${requestId}] Fetching impersonated user auth data`);
    const { data: impersonatedUser, error: userError } = await supabase.auth.admin.getUserById(impersonated_user_id);

    if (userError || !impersonatedUser?.user) {
      console.error(`[create-auth-session:${requestId}] ❌ Failed to get user:`, userError?.message);
      throw new Error(`Failed to get impersonated user: ${userError?.message || 'User not found'}`);
    }

    console.log(`[create-auth-session:${requestId}] ✓ User email:`, impersonatedUser.user.email);
    console.log(`[create-auth-session:${requestId}] Generating authentication link...`);

    // Create a one-time sign-in link for the impersonated user
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: impersonatedUser.user.email!,
    });

    if (linkError) {
      console.error(`[create-auth-session:${requestId}] ❌ Link generation error:`, linkError.message);
      throw new Error(`Failed to generate authentication link: ${linkError.message}`);
    }

    if (!linkData) {
      console.error(`[create-auth-session:${requestId}] ❌ No link data returned`);
      throw new Error('Failed to generate auth link: no data returned');
    }

    console.log(`[create-auth-session:${requestId}] ✓ Link data structure:`, Object.keys(linkData));
    console.log(`[create-auth-session:${requestId}] Properties keys:`, Object.keys(linkData.properties || {}));

    // Extract tokens from the link data
    const hashed_token = linkData.properties?.hashed_token;
    const actionLink = linkData.properties?.action_link;

    console.log(`[create-auth-session:${requestId}] Has hashed_token:`, !!hashed_token);
    console.log(`[create-auth-session:${requestId}] Has action_link:`, !!actionLink);

    if (!hashed_token) {
      console.error(`[create-auth-session:${requestId}] ❌ No hashed_token in response`);
      console.error(`[create-auth-session:${requestId}] Link data properties:`, JSON.stringify(linkData.properties, null, 2));
      throw new Error('Failed to extract token from link: missing hashed_token');
    }

    let access_token = hashed_token;
    let refresh_token: string | null = null;

    // Try to extract tokens from the URL fragment if action_link is available
    if (actionLink) {
      console.log(`[create-auth-session:${requestId}] Parsing action link for tokens`);
      try {
        const url = new URL(actionLink);
        const fragment = url.hash.substring(1); // Remove the #

        if (fragment) {
          const params = new URLSearchParams(fragment);
          const accessFromUrl = params.get('access_token');
          const refreshFromUrl = params.get('refresh_token');

          console.log(`[create-auth-session:${requestId}] Fragment tokens - access:`, !!accessFromUrl, 'refresh:', !!refreshFromUrl);

          // Prefer tokens from URL fragment as they are the most complete
          if (accessFromUrl) {
            access_token = accessFromUrl;
            console.log(`[create-auth-session:${requestId}] Using access token from URL fragment`);
          }
          if (refreshFromUrl) {
            refresh_token = refreshFromUrl;
            console.log(`[create-auth-session:${requestId}] Using refresh token from URL fragment`);
          }
        } else {
          console.log(`[create-auth-session:${requestId}] No hash fragment in action link`);
        }
      } catch (e) {
        console.error(`[create-auth-session:${requestId}] Failed to parse action link:`, e.message);
        console.log(`[create-auth-session:${requestId}] Will use hashed_token as fallback`);
      }
    } else {
      console.log(`[create-auth-session:${requestId}] No action_link provided, using hashed_token only`);
    }

    if (!access_token) {
      console.error(`[create-auth-session:${requestId}] ❌ No access token available`);
      throw new Error('Failed to extract access token from authentication link');
    }

    console.log(`[create-auth-session:${requestId}] ✓ Token extraction complete`);
    console.log(`[create-auth-session:${requestId}] Access token length:`, access_token.length);
    console.log(`[create-auth-session:${requestId}] Refresh token available:`, !!refresh_token);

    // Return the tokens - use access token as fallback for refresh if not available
    console.log(`[create-auth-session:${requestId}] ✅ SUCCESS - Returning tokens`);

    const response = {
      access_token,
      refresh_token: refresh_token || access_token // Use access token as fallback for 2-hour session
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[create-auth-session:${requestId}] ❌ UNEXPECTED ERROR:`, error.message);
    console.error(`[create-auth-session:${requestId}] Error stack:`, error.stack);
    return new Response(
      JSON.stringify({
        error: `Authentication session creation failed: ${error.message || 'Internal server error'}`,
        requestId: requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});