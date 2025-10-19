#!/usr/bin/env tsx

/**
 * Test Data Seeding Script for Deactivation Email System
 *
 * This script creates various test scenarios for manual and automated testing
 * of the deactivation email system.
 *
 * Usage: npm run seed:deactivation-tests
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface TestScenario {
  name: string;
  description: string;
  listingData: any;
}

async function getOrCreateTestUser() {
  console.log('📝 Getting or creating test user...');

  // Try to find existing test user
  const { data: existingUser } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .ilike('email', '%test%')
    .limit(1)
    .maybeSingle();

  if (existingUser) {
    console.log('✅ Using existing test user:', existingUser.email);
    return existingUser;
  }

  // Use any existing user if no test user found
  const { data: anyUser } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .limit(1)
    .single();

  if (anyUser) {
    console.log('✅ Using existing user:', anyUser.email);
    return anyUser;
  }

  console.error('❌ No users found in database. Please create a user first.');
  process.exit(1);
}

async function cleanupTestData() {
  console.log('🧹 Cleaning up old test data...');

  const { error } = await supabase
    .from('listings')
    .delete()
    .ilike('title', '%[TEST]%');

  if (error) {
    console.warn('⚠️  Warning: Failed to clean up test listings:', error.message);
  } else {
    console.log('✅ Test data cleaned up');
  }
}

async function seedTestScenarios(userId: string) {
  const now = new Date();

  const scenarios: TestScenario[] = [
    {
      name: 'Scenario 1: Active Listing Ready for Auto-Deactivation',
      description: 'Listing published 31 days ago, still active, will be auto-deactivated',
      listingData: {
        title: '[TEST] Scenario 1: 31-Day-Old Active Listing',
        description: 'This listing is 31 days old and should be auto-deactivated by the system',
        price: 1500,
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: userId,
        is_active: true,
        last_published_at: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: null,
        last_deactivation_email_sent_at: null,
      },
    },
    {
      name: 'Scenario 2: Inactive Listing Needs Auto-Expiration Email',
      description: 'Listing auto-deactivated 30 days ago, needs automatic expiration email',
      listingData: {
        title: '[TEST] Scenario 2: Inactive - Needs Auto Email',
        description: 'This listing was auto-deactivated and needs an expiration email',
        price: 1800,
        bedrooms: 3,
        bathrooms: 2,
        property_type: 'house',
        city: 'Test City',
        user_id: userId,
        is_active: false,
        last_published_at: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        last_deactivation_email_sent_at: null,
      },
    },
    {
      name: 'Scenario 3: Recently Deactivated Manually - Needs Manual Email',
      description: 'Listing manually deactivated 2 days after posting, needs manual deactivation email',
      listingData: {
        title: '[TEST] Scenario 3: Manual Deactivation',
        description: 'User manually deactivated this listing after 2 days',
        price: 2000,
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: userId,
        is_active: false,
        last_published_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        last_deactivation_email_sent_at: null,
      },
    },
    {
      name: 'Scenario 4: Email Already Sent - Should Skip',
      description: 'Listing deactivated with email already sent, should not send duplicate',
      listingData: {
        title: '[TEST] Scenario 4: Email Already Sent',
        description: 'Email was already sent for this deactivation',
        price: 1600,
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: userId,
        is_active: false,
        last_published_at: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        last_deactivation_email_sent_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      },
    },
    {
      name: 'Scenario 5: Very Old Inactive - Ready for Deletion',
      description: 'Listing inactive for 31+ days, ready for permanent deletion',
      listingData: {
        title: '[TEST] Scenario 5: Ready for Deletion',
        description: 'This listing has been inactive for 31 days and should be deleted',
        price: 1400,
        bedrooms: 1,
        bathrooms: 1,
        property_type: 'studio',
        city: 'Test City',
        user_id: userId,
        is_active: false,
        last_published_at: new Date(now.getTime() - 65 * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString(),
        last_deactivation_email_sent_at: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString(),
      },
    },
    {
      name: 'Scenario 6: Boundary Test - Exactly 29 Days',
      description: 'Listing deactivated exactly 29 days after publishing, tests template detection',
      listingData: {
        title: '[TEST] Scenario 6: 29-Day Boundary Test',
        description: 'Testing the 29-day threshold for template detection',
        price: 1700,
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: userId,
        is_active: false,
        last_published_at: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        last_deactivation_email_sent_at: null,
      },
    },
    {
      name: 'Scenario 7: Fresh Active Listing',
      description: 'Recently posted listing, should not be affected by any automation',
      listingData: {
        title: '[TEST] Scenario 7: Fresh Active Listing',
        description: 'Newly posted listing, should remain active',
        price: 2200,
        bedrooms: 3,
        bathrooms: 2,
        property_type: 'house',
        city: 'Test City',
        user_id: userId,
        is_active: true,
        last_published_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: null,
        last_deactivation_email_sent_at: null,
      },
    },
    {
      name: 'Scenario 8: Renewal Cycle Test',
      description: 'Listing that was deactivated, renewed, and deactivated again',
      listingData: {
        title: '[TEST] Scenario 8: Renewal Cycle',
        description: 'Tests the renewal cycle - this is the second deactivation',
        price: 1900,
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: userId,
        is_active: false,
        last_published_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), // Renewed 3 days ago
        deactivated_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), // Deactivated 30 min ago
        last_deactivation_email_sent_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), // Old email from first deactivation
      },
    },
    {
      name: 'Scenario 9: Edge Case - Deactivated Same Day',
      description: 'Listing published and immediately deactivated same day',
      listingData: {
        title: '[TEST] Scenario 9: Same-Day Deactivation',
        description: 'Published and deactivated on the same day',
        price: 1550,
        bedrooms: 1,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: userId,
        is_active: false,
        last_published_at: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
        deactivated_at: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
        last_deactivation_email_sent_at: null,
      },
    },
    {
      name: 'Scenario 10: Multiple Deactivations Test Set',
      description: 'Part of a set to test bulk email processing',
      listingData: {
        title: '[TEST] Scenario 10: Bulk Test 1',
        description: 'First of multiple listings for bulk processing test',
        price: 1650,
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: userId,
        is_active: false,
        last_published_at: new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        last_deactivation_email_sent_at: null,
      },
    },
  ];

  // Add additional bulk test listings
  for (let i = 2; i <= 5; i++) {
    scenarios.push({
      name: `Scenario 10.${i}: Bulk Test ${i}`,
      description: `Part ${i} of bulk processing test set`,
      listingData: {
        title: `[TEST] Scenario 10: Bulk Test ${i}`,
        description: `Listing ${i} for bulk processing test`,
        price: 1650 + (i * 50),
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: userId,
        is_active: false,
        last_published_at: new Date(now.getTime() - (32 + i) * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        last_deactivation_email_sent_at: null,
      },
    });
  }

  console.log(`\n📦 Creating ${scenarios.length} test scenarios...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const scenario of scenarios) {
    try {
      console.log(`⏳ ${scenario.name}`);
      console.log(`   ${scenario.description}`);

      const { data, error } = await supabase
        .from('listings')
        .insert(scenario.listingData)
        .select()
        .single();

      if (error) {
        console.log(`   ❌ Failed: ${error.message}`);
        failCount++;
      } else {
        console.log(`   ✅ Created: ID ${data.id}`);
        console.log(`   📊 State: ${data.is_active ? 'Active' : 'Inactive'} | Deactivated: ${data.deactivated_at ? 'Yes' : 'No'} | Email Sent: ${data.last_deactivation_email_sent_at ? 'Yes' : 'No'}`);
        successCount++;
      }
      console.log('');
    } catch (error: any) {
      console.log(`   ❌ Exception: ${error.message}`);
      failCount++;
      console.log('');
    }
  }

  console.log('═'.repeat(60));
  console.log(`📈 Summary: ${successCount} created, ${failCount} failed`);
  console.log('═'.repeat(60));
}

async function displayTestSummary() {
  console.log('\n📊 Test Data Summary:\n');

  // Count listings by state
  const { data: allTestListings } = await supabase
    .from('listings')
    .select('id, title, is_active, deactivated_at, last_deactivation_email_sent_at, last_published_at')
    .ilike('title', '%[TEST]%');

  if (!allTestListings || allTestListings.length === 0) {
    console.log('No test listings found');
    return;
  }

  const active = allTestListings.filter(l => l.is_active).length;
  const inactive = allTestListings.filter(l => !l.is_active).length;
  const needingEmail = allTestListings.filter(l =>
    !l.is_active &&
    l.deactivated_at &&
    (!l.last_deactivation_email_sent_at || new Date(l.last_deactivation_email_sent_at) < new Date(l.deactivated_at))
  ).length;
  const readyForDeletion = allTestListings.filter(l => {
    if (!l.deactivated_at) return false;
    const deactivatedDate = new Date(l.deactivated_at);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return deactivatedDate < thirtyDaysAgo;
  }).length;

  console.log(`Total Test Listings: ${allTestListings.length}`);
  console.log(`  • Active: ${active}`);
  console.log(`  • Inactive: ${inactive}`);
  console.log(`  • Needing Email: ${needingEmail}`);
  console.log(`  • Ready for Deletion: ${readyForDeletion}`);
  console.log('');

  console.log('📋 Listings by Scenario:\n');
  allTestListings.forEach(listing => {
    const daysSincePublished = listing.last_published_at
      ? Math.floor((Date.now() - new Date(listing.last_published_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const daysSinceDeactivated = listing.deactivated_at
      ? Math.floor((Date.now() - new Date(listing.deactivated_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    console.log(`  ${listing.is_active ? '🟢' : '🔴'} ${listing.title}`);
    console.log(`     Published: ${daysSincePublished} days ago`);
    if (daysSinceDeactivated !== null) {
      console.log(`     Deactivated: ${daysSinceDeactivated} days ago`);
    }
    console.log(`     Email Sent: ${listing.last_deactivation_email_sent_at ? '✅ Yes' : '❌ No'}`);
    console.log('');
  });
}

async function generateTestingInstructions() {
  console.log('\n' + '═'.repeat(60));
  console.log('  TESTING INSTRUCTIONS');
  console.log('═'.repeat(60) + '\n');

  console.log('✨ Test data has been seeded! Here\'s what to test:\n');

  console.log('1️⃣  AUTO-INACTIVATION TEST:');
  console.log('   Run: SELECT * FROM auto_inactivate_old_listings();');
  console.log('   Expected: Should deactivate Scenario 1 (31-day-old active listing)\n');

  console.log('2️⃣  AUTO-DELETION TEST:');
  console.log('   Run: SELECT * FROM auto_delete_very_old_listings();');
  console.log('   Expected: Should delete Scenario 5 (31+ days inactive)\n');

  console.log('3️⃣  EMAIL FUNCTION TEST:');
  console.log('   Run: supabase functions invoke send-deactivation-emails');
  console.log('   Expected: Should send emails for Scenarios 2, 3, 6, 8, 9, and 10.x\n');

  console.log('4️⃣  TEMPLATE DETECTION TEST:');
  console.log('   Check emails received:');
  console.log('   • Scenario 2: Should get "expired" template (30+ days old)');
  console.log('   • Scenario 3: Should get "manual" template (2 days old)');
  console.log('   • Scenario 6: Should get "automatic" template (29 days = boundary)\n');

  console.log('5️⃣  IDEMPOTENCY TEST:');
  console.log('   Scenario 4 should NOT receive email (already sent)');
  console.log('   Scenario 8 SHOULD receive email (renewal cycle)\n');

  console.log('6️⃣  MANUAL FRONTEND TEST:');
  console.log('   • Use Scenario 7 (fresh active listing)');
  console.log('   • Manually unpublish via dashboard');
  console.log('   • Check that deactivated_at is set automatically');
  console.log('   • Wait for email function to run\n');

  console.log('📝 To run automated tests:');
  console.log('   npm run test:deactivation\n');

  console.log('🧹 To clean up test data:');
  console.log('   DELETE FROM listings WHERE title ILIKE \'%[TEST]%\';\n');
}

async function main() {
  console.log('\n🚀 Deactivation Email System - Test Data Seeder\n');

  try {
    // Get test user
    const testUser = await getOrCreateTestUser();

    // Clean up old test data
    await cleanupTestData();

    // Seed test scenarios
    await seedTestScenarios(testUser.id);

    // Display summary
    await displayTestSummary();

    // Show testing instructions
    await generateTestingInstructions();

    console.log('✨ Test data seeding complete!\n');

  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
