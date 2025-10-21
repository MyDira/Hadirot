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

    // Extract tokens from the generated link
    let access_token: string | null = null;
    let refresh_token: string | null = null;

    // Try to get tokens from the action_link URL fragment
    const actionLink = linkData.properties?.action_link;
    if (actionLink) {
      try {
        const url = new URL(actionLink);
        const fragment = url.hash.substring(1);
        if (fragment) {
          const params = new URLSearchParams(fragment);
          access_token = params.get('access_token');
          refresh_token = params.get('refresh_token');
        }
      } catch (e) {
        console.error(`[admin-sign-in-as-user:${requestId}] Failed to parse action link:`, e.message);
      }
    }

    // Fallback to hashed_token if URL parsing didn't work
    if (!access_token) {
      access_token = linkData.properties?.hashed_token || null;
    }

    if (!access_token) {
      console.error(`[admin-sign-in-as-user:${requestId}] No access token available`);
      return new Response(
        JSON.stringify({ error: 'Failed to extract authentication tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-sign-in-as-user:${requestId}] Tokens extracted successfully`);
    console.log(`[admin-sign-in-as-user:${requestId}] SUCCESS - Admin ${adminProfile.full_name} signing in as ${targetProfile.full_name}`);

    // Log for security audit (server-side only)
    console.log(`[AUDIT] Admin ${adminUser.id} (${adminProfile.full_name}) signed in as user ${target_user_id} (${targetProfile.full_name}) at ${new Date().toISOString()}`);

    return new Response(
      JSON.stringify({
        access_token,
        refresh_token: refresh_token || access_token,
        user: {
          id: targetAuthUser.user.id,
          email: targetAuthUser.user.email,
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
