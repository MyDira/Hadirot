import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface TrackRequest {
  event_name: string;
  session_id: string;
  user_id?: string;
  page?: string;
  referrer?: string;
  props?: Record<string, any>;
}

// Bot detection patterns
const BOT_PATTERNS = [
  /bot/i,
  /spider/i,
  /crawler/i,
  /scraper/i,
  /lighthouse/i,
  /pagespeed/i,
  /gtmetrix/i,
  /pingdom/i,
  /uptime/i,
  /monitor/i,
  /headless/i,
  /phantom/i,
  /selenium/i,
  /webdriver/i,
  /playwright/i,
  /puppeteer/i,
  /cypress/i,
  /jest/i,
  /jsdom/i,
];

function isBot(userAgent: string): boolean {
  if (!userAgent) return true;
  return BOT_PATTERNS.some(pattern => pattern.test(userAgent));
}

function getClientIP(req: Request): string | null {
  // Try various headers that might contain the real client IP
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'cf-connecting-ip', // Cloudflare
    'x-client-ip',
    'x-forwarded',
    'forwarded-for',
    'forwarded',
  ];

  for (const header of headers) {
    const value = req.headers.get(header);
    if (value) {
      // x-forwarded-for can contain multiple IPs, take the first one
      const ip = value.split(',')[0].trim();
      if (ip) return ip;
    }
  }

  return null;
}

function truncateIP(ip: string): string {
  if (!ip) return '';
  
  // IPv4: truncate to /24 (remove last octet)
  if (ip.includes('.') && !ip.includes(':')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
  }
  
  // IPv6: truncate to /64 (keep first 4 groups)
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 4) {
      return `${parts.slice(0, 4).join(':')}::`;
    }
  }
  
  // Return original if we can't parse it
  return ip;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user agent and IP for enrichment and bot detection
    const userAgent = req.headers.get('User-Agent') || '';
    const rawIP = getClientIP(req);
    
    // Check for test bypass header
    const allowBot = req.headers.get('x-allow-bot') === 'true';
    
    // Bot filtering (unless bypassed for testing)
    if (!allowBot && isBot(userAgent)) {
      console.log('🤖 Bot detected, skipping analytics:', userAgent);
      return new Response(JSON.stringify({ success: true, skipped: 'bot' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    let trackData: TrackRequest;
    try {
      trackData = await req.json();
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate required fields
    if (!trackData.event_name || !trackData.session_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: event_name and session_id' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Prepare event data with enrichment
    const eventData = {
      session_id: trackData.session_id,
      user_id: trackData.user_id || null,
      event_name: trackData.event_name,
      page: trackData.page || null,
      referrer: trackData.referrer || null,
      user_agent: userAgent || null,
      ip: rawIP ? truncateIP(rawIP) : null,
      props: {
        ...trackData.props,
        schema_version: 1, // Add schema versioning
      },
    };

    // Insert into analytics_events table
    const { data, error } = await supabaseAdmin
      .from('analytics_events')
      .insert(eventData)
      .select('id')
      .single();

    if (error) {
      console.error('❌ Error inserting analytics event:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to record analytics event' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('✅ Analytics event recorded:', {
      id: data.id,
      event_name: trackData.event_name,
      session_id: trackData.session_id,
      user_id: trackData.user_id,
      page: trackData.page,
    });

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Unexpected error in track function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});