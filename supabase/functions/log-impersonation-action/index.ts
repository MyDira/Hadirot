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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { session_token, action_type, action_details, page_path } = await req.json();

    if (!session_token || !action_type) {
      throw new Error('Missing required fields');
    }

    const { data: session, error: sessionError } = await supabase
      .from('impersonation_sessions')
      .select('id, impersonated_user_id')
      .eq('session_token', session_token)
      .eq('admin_user_id', user.id)
      .maybeSingle();

    if (sessionError || !session) {
      throw new Error('Invalid session');
    }

    const { error: logError } = await supabase
      .from('impersonation_audit_log')
      .insert({
        session_id: session.id,
        admin_user_id: user.id,
        impersonated_user_id: session.impersonated_user_id,
        action_type,
        action_details: action_details || {},
        page_path: page_path || null
      });

    if (logError) {
      throw logError;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in log-impersonation-action:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});