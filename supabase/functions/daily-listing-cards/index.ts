/**
 * Daily Listing Cards Email Function
 *
 * Runs automatically via cron job to generate listing card images and email them.
 * Can also be triggered manually by admins.
 *
 * Schedule: Daily at 6:00 AM (configurable via database)
 * Deno.cron("daily-listing-cards", "0 6 * * *", async () => { ... })
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sendViaZepto } from '../_shared/zepto.ts';
import {
  generateDailyCardsEmail,
  generatePlainTextEmail,
} from '../_shared/dailyCardsEmailTemplate.ts';

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
  neighborhood: string | null;
  broker_fee: boolean;
  parking: string | null;
  is_featured: boolean;
  property_type: string | null;
  lease_length: string | null;
  created_at: string;
  owner?: {
    full_name: string;
    role: string;
    agency: string | null;
  };
  listing_images?: Array<{
    image_url: string;
    is_featured: boolean;
    sort_order: number;
  }>;
}

/**
 * Main function to generate and send daily listing cards
 */
async function generateAndSendDailyCards(triggeredBy = 'cron') {
  const startTime = Date.now();
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let success = false;
  let listingsCount = 0;
  let imagesGenerated = 0;
  let emailSent = false;
  let errorMessage: string | null = null;

  try {
    console.log('🚀 Starting daily listing cards generation...');

    // 1. Fetch configuration
    const { data: config, error: configError } = await supabase
      .from('daily_cards_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      throw new Error('Failed to fetch configuration: ' + configError?.message);
    }

    const typedConfig = config as unknown as DailyCardsConfig;

    // Check if automation is enabled
    if (!typedConfig.enabled && triggeredBy === 'cron') {
      console.log('⏸️ Automation is disabled. Skipping execution.');
      return { success: true, message: 'Automation disabled' };
    }

    // Check if recipients are configured
    if (!typedConfig.recipient_emails || typedConfig.recipient_emails.length === 0) {
      throw new Error('No recipient emails configured');
    }

    console.log('✅ Configuration loaded:', {
      enabled: typedConfig.enabled,
      recipients: typedConfig.recipient_emails.length,
      maxListings: typedConfig.max_listings,
    });

    // 2. Fetch active listings
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - typedConfig.days_to_include);

    let query = supabase
      .from('listings')
      .select(
        `
        *,
        owner:profiles!listings_user_id_fkey(full_name, role, agency),
        listing_images(image_url, is_featured, sort_order)
      `
      )
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
      console.log('ℹ️ No listings found matching criteria');
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
    console.log(`📋 Found ${listingsCount} listings to process`);

    // 3. Generate images and upload to storage
    const listingsWithImages: Array<{
      id: string;
      title: string;
      price: number | null;
      call_for_price: boolean;
      bedrooms: number;
      bathrooms: number;
      location: string;
      cross_streets: string | null;
      neighborhood: string | null;
      broker_fee: boolean;
      parking: string | null;
      imageUrl: string;
      listingUrl: string;
    }> = [];

    const today = new Date().toISOString().split('T')[0];
    const storagePath = `${today}`;

    for (const listing of listings as Listing[]) {
      try {
        console.log(`📋 Processing listing: ${listing.id}`);

        // Get primary image URL from listing_images
        const sortedImages = listing.listing_images?.sort((a, b) => {
          if (a.is_featured && !b.is_featured) return -1;
          if (!a.is_featured && b.is_featured) return 1;
          return a.sort_order - b.sort_order;
        });

        const primaryImageUrl = sortedImages?.[0]?.image_url || 'https://via.placeholder.com/400x267?text=No+Image';

        imagesGenerated++;

        // Use existing listing image - no need to generate new cards
        listingsWithImages.push({
          id: listing.id,
          title: listing.title,
          price: listing.price,
          call_for_price: listing.call_for_price,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          location: listing.location,
          cross_streets: listing.cross_streets,
          neighborhood: listing.neighborhood,
          broker_fee: listing.broker_fee,
          parking: listing.parking,
          imageUrl: primaryImageUrl,
          listingUrl: `https://hadirot.com/listing/${listing.id}`,
        });

        console.log(`✅ Listing processed: ${listing.id}`);
      } catch (imageError) {
        console.error(`❌ Error processing listing ${listing.id}:`, imageError);
        // Continue with other listings even if one fails
      }
    }

    if (listingsWithImages.length === 0) {
      throw new Error('Failed to generate any images');
    }

    console.log(`✅ Generated ${imagesGenerated} images successfully`);

    // 4. Generate and send email
    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const htmlContent = generateDailyCardsEmail(listingsWithImages, dateStr);
    const textContent = generatePlainTextEmail(listingsWithImages, dateStr);

    console.log('📧 Sending email to:', typedConfig.recipient_emails);

    await sendViaZepto({
      to: typedConfig.recipient_emails,
      subject: `Daily Listing Cards - ${dateStr} (${listingsWithImages.length} listings)`,
      html: htmlContent,
      fromName: 'Hadirot Daily Listings',
    });

    emailSent = true;
    success = true;

    console.log('✅ Email sent successfully!');

    // 5. Log successful execution
    await logExecution(supabase, {
      success: true,
      listings_count: listingsCount,
      images_generated: imagesGenerated,
      email_sent: true,
      error_message: null,
      execution_time_ms: Date.now() - startTime,
      triggered_by: triggeredBy,
    });

    return {
      success: true,
      listingsCount,
      imagesGenerated,
      emailSent: true,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    errorMessage = error.message || String(error);
    console.error('❌ Error in daily cards generation:', errorMessage);

    // Log failed execution
    await logExecution(supabase, {
      success: false,
      listings_count: listingsCount,
      images_generated: imagesGenerated,
      email_sent: emailSent,
      error_message: errorMessage,
      execution_time_ms: Date.now() - startTime,
      triggered_by: triggeredBy,
    });

    throw error;
  }
}

/**
 * Log execution to database
 */
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

/**
 * HTTP handler for both cron and manual triggers
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Check authentication
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

    // Check if user is admin
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

    // Execute the daily cards generation
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