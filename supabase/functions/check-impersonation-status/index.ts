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

    // Parse request body
    const { session_token } = await req.json();

    if (!session_token) {
      throw new Error('Missing session_token');
    }

    // Get session from database
    const { data: session, error: sessionError } = await supabase
      .from('impersonation_sessions')
      .select('*')
      .eq('session_token', session_token)
      .eq('admin_user_id', user.id)
      .maybeSingle();

    if (sessionError) {
      throw sessionError;
    }

    if (!session) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Session not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if session has expired
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    const isExpired = now > expiresAt;

    // Check if session was manually ended
    const wasEnded = session.ended_at !== null;

    if (isExpired || wasEnded) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          expired: true,
          reason: wasEnded ? 'ended' : 'timeout'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate time remaining in seconds
    const timeRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);

    // Return valid status with remaining time
    return new Response(
      JSON.stringify({
        valid: true,
        session_id: session.id,
        impersonated_user_id: session.impersonated_user_id,
        expires_at: session.expires_at,
        time_remaining_seconds: timeRemaining
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in check-impersonation-status:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});