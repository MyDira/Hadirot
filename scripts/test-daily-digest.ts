/**
 * Test script for daily digest email system
 *
 * Usage:
 *   npm run test:digest
 *
 * Or add to package.json:
 *   "test:digest": "tsx scripts/test-daily-digest.ts"
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  console.error('Required: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testDailyDigest() {
  console.log('🧪 Testing Daily Digest System\n');

  try {
    // 1. Check database tables exist
    console.log('1️⃣ Checking database tables...');

    const { data: sentListings, error: sentError } = await supabase
      .from('daily_digest_sent_listings')
      .select('*')
      .limit(1);

    if (sentError) {
      console.error('❌ daily_digest_sent_listings table not found:', sentError.message);
    } else {
      console.log('✅ daily_digest_sent_listings table exists');
    }

    const { data: logs, error: logsError } = await supabase
      .from('daily_digest_logs')
      .select('*')
      .limit(1);

    if (logsError) {
      console.error('❌ daily_digest_logs table not found:', logsError.message);
    } else {
      console.log('✅ daily_digest_logs table exists');
    }

    // 2. Check for new listings in last 24 hours
    console.log('\n2️⃣ Checking for new listings...');
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: newListings, error: listingsError } = await supabase
      .from('listings')
      .select('id, title, created_at, is_active, status')
      .eq('is_active', true)
      .eq('status', 'approved')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false });

    if (listingsError) {
      console.error('❌ Error fetching listings:', listingsError.message);
    } else {
      console.log(`✅ Found ${newListings?.length || 0} approved listing(s) in last 24 hours`);
      if (newListings && newListings.length > 0) {
        newListings.forEach(listing => {
          console.log(`   - ${listing.title} (${listing.id})`);
        });
      }
    }

    // 3. Check for already-sent listings
    console.log('\n3️⃣ Checking sent listings history...');
    const { data: alreadySent, error: alreadySentError } = await supabase
      .from('daily_digest_sent_listings')
      .select('listing_id, sent_at, digest_date')
      .order('sent_at', { ascending: false })
      .limit(10);

    if (alreadySentError) {
      console.error('❌ Error fetching sent listings:', alreadySentError.message);
    } else {
      console.log(`✅ ${alreadySent?.length || 0} listing(s) previously sent in digests`);
      if (alreadySent && alreadySent.length > 0) {
        alreadySent.forEach(sent => {
          console.log(`   - Listing ${sent.listing_id.slice(0, 8)}... on ${sent.digest_date}`);
        });
      }
    }

    // 4. Check admin users
    console.log('\n4️⃣ Checking admin users...');
    const { data: admins, error: adminsError } = await supabase
      .from('profiles')
      .select('id, full_name, is_admin')
      .eq('is_admin', true);

    if (adminsError) {
      console.error('❌ Error fetching admins:', adminsError.message);
    } else {
      console.log(`✅ Found ${admins?.length || 0} admin user(s)`);
    }

    // 5. Check digest logs
    console.log('\n5️⃣ Checking digest execution logs...');
    const { data: digestLogs, error: digestLogsError } = await supabase
      .from('daily_digest_logs')
      .select('*')
      .order('run_at', { ascending: false })
      .limit(5);

    if (digestLogsError) {
      console.error('❌ Error fetching digest logs:', digestLogsError.message);
    } else {
      console.log(`✅ ${digestLogs?.length || 0} digest execution(s) logged`);
      if (digestLogs && digestLogs.length > 0) {
        digestLogs.forEach(log => {
          const status = log.success ? '✓' : '✗';
          console.log(`   ${status} ${new Date(log.run_at).toLocaleString()}: ${log.listings_count} listings to ${log.recipients_count} recipients`);
          if (log.error_message) {
            console.log(`     Error: ${log.error_message}`);
          }
        });
      }
    }

    // 6. Test Edge Function (optional - requires function to be deployed)
    console.log('\n6️⃣ Testing Edge Function (send-daily-digest)...');
    console.log('⚠️ Skipping function invocation test (would send real emails)');
    console.log('   To test manually, call: supabase functions invoke send-daily-digest');

    console.log('\n✅ Daily Digest System Test Complete!\n');

    // Summary
    console.log('📊 Summary:');
    console.log(`   - New listings available: ${newListings?.length || 0}`);
    console.log(`   - Admin recipients: ${admins?.length || 0}`);
    console.log(`   - Previous digests sent: ${digestLogs?.length || 0}`);

    if (newListings && newListings.length > 0 && admins && admins.length > 0) {
      const sentIds = new Set(alreadySent?.map(s => s.listing_id) || []);
      const unseenCount = newListings.filter(l => !sentIds.has(l.id)).length;

      if (unseenCount > 0) {
        console.log(`\n✨ ${unseenCount} new listing(s) would be included in next digest`);
      } else {
        console.log('\n⚠️ All recent listings have already been sent in previous digests');
      }
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

testDailyDigest();
