import { createClient } from 'npm:@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the user is authenticated
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Verify the user is an admin
    const { data: adminProfile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !adminProfile?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { impersonated_user_id } = await req.json();

    if (!impersonated_user_id) {
      throw new Error('Missing impersonated_user_id');
    }

    // Get client IP and user agent
    const ip_address = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const user_agent = req.headers.get('user-agent') || 'unknown';

    // Call the database function to start impersonation
    const { data: sessionData, error: sessionError } = await supabase
      .rpc('start_impersonation_session', {
        p_admin_user_id: user.id,
        p_impersonated_user_id: impersonated_user_id,
        p_ip_address: ip_address,
        p_user_agent: user_agent
      });

    if (sessionError) {
      console.error('Session creation error:', sessionError);
      throw sessionError;
    }

    // Fetch the impersonated user's full profile
    const { data: impersonatedProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, phone, agency, is_admin, created_at, updated_at')
      .eq('id', impersonated_user_id)
      .maybeSingle();

    if (fetchError || !impersonatedProfile) {
      throw new Error('Failed to fetch impersonated user profile');
    }

    // Return success with session data and profile
    return new Response(
      JSON.stringify({
        success: true,
        session: sessionData,
        impersonated_profile: impersonatedProfile
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in start-impersonation:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});