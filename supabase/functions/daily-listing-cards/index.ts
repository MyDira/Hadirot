/**
 * Daily Listing Cards Email Function - Pure Text Format
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sendViaZepto } from '../_shared/zepto.ts';
import { generateDailyCardsTextEmail } from '../_shared/dailyCardsEmailTemplate.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface DailyCardsConfig {
  enabled: boolean;
  delivery_time: string;
  recipient_emails: string[];
  max_listings: number;
  include_featured_only: boolean;
  days_to_include: number;
  timezone: string;
  whatsapp_group_url: string;
}

interface Listing {
  id: string;
  title: string;
  price: number | null;
  call_for_price: boolean;
  bedrooms: number;
  bathrooms: number;
  location: string;
  cross_streets: string | null;
  broker_fee: boolean;
  parking: string | null;
  created_at: string;
}

async function generateAndSendDailyCards(triggeredBy = 'cron') {
  const startTime = Date.now();
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let success = false;
  let listingsCount = 0;
  let emailSent = false;
  let errorMessage: string | null = null;

  try {
    console.log('Starting daily listing cards generation...');

    const { data: config, error: configError } = await supabase
      .from('daily_cards_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      throw new Error('Failed to fetch configuration: ' + configError?.message);
    }

    const typedConfig = config as unknown as DailyCardsConfig;

    if (!typedConfig.enabled && triggeredBy === 'cron') {
      console.log('Automation is disabled. Skipping execution.');
      return { success: true, message: 'Automation disabled' };
    }

    if (!typedConfig.recipient_emails || typedConfig.recipient_emails.length === 0) {
      throw new Error('No recipient emails configured');
    }

    const whatsappGroupUrl = typedConfig.whatsapp_group_url || 'https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt';

    console.log('Configuration loaded:', {
      enabled: typedConfig.enabled,
      recipients: typedConfig.recipient_emails.length,
      maxListings: typedConfig.max_listings,
      whatsappGroup: whatsappGroupUrl,
    });

    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 24);

    let query = supabase
      .from('listings')
      .select('*')
      .eq('approved', true)
      .eq('is_active', true)
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(typedConfig.max_listings);

    if (typedConfig.include_featured_only) {
      query = query.eq('is_featured', true);
    }

    const { data: listings, error: listingsError } = await query;

    if (listingsError) {
      throw new Error('Failed to fetch listings: ' + listingsError.message);
    }

    if (!listings || listings.length === 0) {
      console.log('No listings found matching criteria');
      success = true;
      await logExecution(supabase, {
        success: true,
        listings_count: 0,
        images_generated: 0,
        email_sent: false,
        error_message: 'No listings to process',
        execution_time_ms: Date.now() - startTime,
        triggered_by: triggeredBy,
      });
      return { success: true, message: 'No listings to process' };
    }

    listingsCount = listings.length;
    console.log(`Found ${listingsCount} listings to process`);

    const listingsData = (listings as Listing[]).map((listing) => ({
      id: listing.id,
      title: listing.title,
      price: listing.price,
      call_for_price: listing.call_for_price,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      location: listing.location,
      cross_streets: listing.cross_streets,
      broker_fee: listing.broker_fee,
      parking: listing.parking,
      listingUrl: `https://hadirot.com/listing/${listing.id}`,
    }));

    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const textContent = generateDailyCardsTextEmail(listingsData, dateStr, whatsappGroupUrl);

    console.log('Sending email to:', typedConfig.recipient_emails);

    await sendViaZepto({
      to: typedConfig.recipient_emails,
      subject: `Today's Hadirot Listings - ${dateStr} (${listingsCount} listings)`,
      text: textContent,
      html: textContent,
      fromName: 'Hadirot Daily Listings',
    });

    emailSent = true;
    success = true;

    console.log('Email sent successfully!');

    await logExecution(supabase, {
      success: true,
      listings_count: listingsCount,
      images_generated: 0,
      email_sent: true,
      error_message: null,
      execution_time_ms: Date.now() - startTime,
      triggered_by: triggeredBy,
    });

    return {
      success: true,
      listingsCount,
      emailSent: true,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    errorMessage = error.message || String(error);
    console.error('Error in daily cards generation:', errorMessage);

    await logExecution(supabase, {
      success: false,
      listings_count: listingsCount,
      images_generated: 0,
      email_sent: emailSent,
      error_message: errorMessage,
      execution_time_ms: Date.now() - startTime,
      triggered_by: triggeredBy,
    });

    throw error;
  }
}

async function logExecution(
  supabase: ReturnType<typeof createClient>,
  log: {
    success: boolean;
    listings_count: number;
    images_generated: number;
    email_sent: boolean;
    error_message: string | null;
    execution_time_ms: number;
    triggered_by: string;
  }
) {
  const { error } = await supabase.from('daily_cards_logs').insert({
    run_at: new Date().toISOString(),
    success: log.success,
    listings_count: log.listings_count,
    images_generated: log.images_generated,
    email_sent: log.email_sent,
    error_message: log.error_message,
    execution_time_ms: log.execution_time_ms,
    triggered_by: log.triggered_by,
  });

  if (error) {
    console.error('Failed to log execution:', error);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await generateAndSendDailyCards('manual');

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

Deno.cron('daily-listing-cards', '0 17 * * *', async () => {
  try {
    console.log('Cron triggered at 5:00 PM');
    await generateAndSendDailyCards('cron');
  } catch (error) {
    console.error('Cron job failed:', error);
  }
});
