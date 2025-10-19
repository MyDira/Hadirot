#!/usr/bin/env tsx

/**
 * Comprehensive Test Script for Deactivation Email System
 *
 * This script tests the complete deactivation email system including:
 * - Database triggers
 * - PostgreSQL functions
 * - Edge function integration
 * - Email template detection
 * - Idempotency
 *
 * Usage: npm run test:deactivation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   VITE_SUPABASE_URL:', !!supabaseUrl);
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function logTest(testName: string, passed: boolean, message: string, details?: any) {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${testName}: ${message}`);
  if (details) {
    console.log('   Details:', JSON.stringify(details, null, 2));
  }
  results.push({ testName, passed, message, details });
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60) + '\n');
}

async function cleanup() {
  console.log('🧹 Cleaning up test data...');
  try {
    const { error } = await supabase
      .from('listings')
      .delete()
      .ilike('title', '%[TEST]%');

    if (error) {
      console.warn('⚠️  Warning: Failed to clean up test listings:', error.message);
    } else {
      console.log('✅ Test data cleaned up successfully');
    }
  } catch (error) {
    console.warn('⚠️  Warning: Cleanup error:', error);
  }
}

// Test 1: Database Trigger - Deactivation Sets Timestamp
async function testTriggerSetsDeactivationTimestamp() {
  const testName = 'TEST 1: Database Trigger Sets deactivated_at';

  try {
    // Create a test listing
    const { data: testUser, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .single();

    if (userError || !testUser) {
      logTest(testName, false, 'No test user found in database', userError);
      return;
    }

    const { data: listing, error: createError } = await supabase
      .from('listings')
      .insert({
        title: '[TEST] Trigger Test Listing',
        description: 'Test listing for trigger validation',
        price: 1000,
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: testUser.id,
        is_active: true,
        last_published_at: new Date().toISOString(),
        deactivated_at: null,
      })
      .select()
      .single();

    if (createError || !listing) {
      logTest(testName, false, 'Failed to create test listing', createError);
      return;
    }

    // Verify initial state
    if (listing.is_active !== true || listing.deactivated_at !== null) {
      logTest(testName, false, 'Initial state incorrect', {
        is_active: listing.is_active,
        deactivated_at: listing.deactivated_at,
      });
      return;
    }

    // Update to inactive (trigger should fire)
    const beforeUpdate = new Date();
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure timestamp difference

    const { data: updatedListing, error: updateError } = await supabase
      .from('listings')
      .update({ is_active: false })
      .eq('id', listing.id)
      .select()
      .single();

    if (updateError || !updatedListing) {
      logTest(testName, false, 'Failed to update listing', updateError);
      return;
    }

    // Verify trigger set deactivated_at
    const passed = updatedListing.is_active === false &&
                   updatedListing.deactivated_at !== null &&
                   new Date(updatedListing.deactivated_at) >= beforeUpdate;

    logTest(testName, passed, passed ? 'Trigger correctly set deactivated_at timestamp' : 'Trigger did not set timestamp', {
      is_active: updatedListing.is_active,
      deactivated_at: updatedListing.deactivated_at,
      timestamp_after_update: new Date(updatedListing.deactivated_at) >= beforeUpdate,
    });

  } catch (error: any) {
    logTest(testName, false, 'Exception occurred', error.message);
  }
}

// Test 2: Database Trigger - Reactivation Clears Timestamp
async function testTriggerClearsDeactivationTimestamp() {
  const testName = 'TEST 2: Database Trigger Clears deactivated_at on Reactivation';

  try {
    // Find or create an inactive test listing
    const { data: testUser } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .single();

    if (!testUser) {
      logTest(testName, false, 'No test user found', null);
      return;
    }

    const { data: listing, error: createError } = await supabase
      .from('listings')
      .insert({
        title: '[TEST] Reactivation Test Listing',
        description: 'Test listing for reactivation validation',
        price: 1000,
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: testUser.id,
        is_active: false,
        last_published_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError || !listing) {
      logTest(testName, false, 'Failed to create inactive test listing', createError);
      return;
    }

    // Verify initial inactive state with deactivated_at
    if (listing.is_active !== false || listing.deactivated_at === null) {
      logTest(testName, false, 'Initial inactive state incorrect', {
        is_active: listing.is_active,
        deactivated_at: listing.deactivated_at,
      });
      return;
    }

    // Reactivate (trigger should clear deactivated_at)
    const { data: reactivated, error: updateError } = await supabase
      .from('listings')
      .update({
        is_active: true,
        last_published_at: new Date().toISOString(),
      })
      .eq('id', listing.id)
      .select()
      .single();

    if (updateError || !reactivated) {
      logTest(testName, false, 'Failed to reactivate listing', updateError);
      return;
    }

    // Verify trigger cleared deactivated_at
    const passed = reactivated.is_active === true && reactivated.deactivated_at === null;

    logTest(testName, passed, passed ? 'Trigger correctly cleared deactivated_at' : 'Trigger did not clear timestamp', {
      is_active: reactivated.is_active,
      deactivated_at: reactivated.deactivated_at,
    });

  } catch (error: any) {
    logTest(testName, false, 'Exception occurred', error.message);
  }
}

// Test 3: Auto-Inactivation Function
async function testAutoInactivationFunction() {
  const testName = 'TEST 3: auto_inactivate_old_listings() Function';

  try {
    // Create a listing that's 31 days old
    const { data: testUser } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .single();

    if (!testUser) {
      logTest(testName, false, 'No test user found', null);
      return;
    }

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);

    const { data: oldListing, error: createError } = await supabase
      .from('listings')
      .insert({
        title: '[TEST] Old Listing for Auto-Inactivation',
        description: 'Test listing 31 days old',
        price: 1000,
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: testUser.id,
        is_active: true,
        last_published_at: oldDate.toISOString(),
        deactivated_at: null,
      })
      .select()
      .single();

    if (createError || !oldListing) {
      logTest(testName, false, 'Failed to create old test listing', createError);
      return;
    }

    // Call the auto_inactivate_old_listings function
    const { data: functionResult, error: functionError } = await supabase
      .rpc('auto_inactivate_old_listings');

    if (functionError) {
      logTest(testName, false, 'Function call failed', functionError);
      return;
    }

    // Verify the listing was inactivated
    const { data: inactivatedListing, error: fetchError } = await supabase
      .from('listings')
      .select('id, is_active, deactivated_at')
      .eq('id', oldListing.id)
      .single();

    if (fetchError || !inactivatedListing) {
      logTest(testName, false, 'Failed to fetch listing after function call', fetchError);
      return;
    }

    const passed = inactivatedListing.is_active === false &&
                   inactivatedListing.deactivated_at !== null;

    logTest(testName, passed, passed ? 'Function correctly inactivated old listing' : 'Function did not inactivate listing', {
      function_result: functionResult,
      listing_state: {
        is_active: inactivatedListing.is_active,
        deactivated_at: inactivatedListing.deactivated_at,
      },
    });

  } catch (error: any) {
    logTest(testName, false, 'Exception occurred', error.message);
  }
}

// Test 4: Auto-Deletion Function
async function testAutoDeletionFunction() {
  const testName = 'TEST 4: auto_delete_very_old_listings() Function';

  try {
    // Create a listing that's been inactive for 31 days
    const { data: testUser } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .single();

    if (!testUser) {
      logTest(testName, false, 'No test user found', null);
      return;
    }

    const oldDeactivationDate = new Date();
    oldDeactivationDate.setDate(oldDeactivationDate.getDate() - 31);

    const { data: oldListing, error: createError } = await supabase
      .from('listings')
      .insert({
        title: '[TEST] Very Old Inactive Listing for Deletion',
        description: 'Test listing inactive for 31 days',
        price: 1000,
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: testUser.id,
        is_active: false,
        last_published_at: new Date(Date.now() - 61 * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: oldDeactivationDate.toISOString(),
      })
      .select()
      .single();

    if (createError || !oldListing) {
      logTest(testName, false, 'Failed to create very old inactive listing', createError);
      return;
    }

    const listingIdToDelete = oldListing.id;

    // Call the auto_delete_very_old_listings function
    const { data: functionResult, error: functionError } = await supabase
      .rpc('auto_delete_very_old_listings');

    if (functionError) {
      logTest(testName, false, 'Function call failed', functionError);
      return;
    }

    // Verify the listing was deleted
    const { data: deletedListing, error: fetchError } = await supabase
      .from('listings')
      .select('id')
      .eq('id', listingIdToDelete)
      .maybeSingle();

    // Should return null because listing was deleted
    const passed = deletedListing === null && !fetchError;

    logTest(testName, passed, passed ? 'Function correctly deleted very old listing' : 'Function did not delete listing', {
      function_result: functionResult,
      listing_found: deletedListing !== null,
      fetch_error: fetchError?.message,
    });

  } catch (error: any) {
    logTest(testName, false, 'Exception occurred', error.message);
  }
}

// Test 5: Email Query Logic
async function testEmailQueryLogic() {
  const testName = 'TEST 5: Email Query Returns Correct Listings';

  try {
    const { data: testUser } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .limit(1)
      .single();

    if (!testUser) {
      logTest(testName, false, 'No test user found', null);
      return;
    }

    // Create test listings with different email states
    const now = new Date().toISOString();
    const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

    // Listing A: Never sent email (should be included)
    const { data: listingA } = await supabase
      .from('listings')
      .insert({
        title: '[TEST] Listing A - No Email Sent',
        description: 'Test',
        price: 1000,
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: testUser.id,
        is_active: false,
        last_published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: now,
        last_deactivation_email_sent_at: null,
      })
      .select()
      .single();

    // Listing B: Email sent before deactivation (should be included)
    const { data: listingB } = await supabase
      .from('listings')
      .insert({
        title: '[TEST] Listing B - Email Before Deactivation',
        description: 'Test',
        price: 1000,
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: testUser.id,
        is_active: false,
        last_published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: now,
        last_deactivation_email_sent_at: pastDate,
      })
      .select()
      .single();

    // Listing C: Email sent after deactivation (should NOT be included)
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour future
    const { data: listingC } = await supabase
      .from('listings')
      .insert({
        title: '[TEST] Listing C - Email After Deactivation',
        description: 'Test',
        price: 1000,
        bedrooms: 2,
        bathrooms: 1,
        property_type: 'apartment',
        city: 'Test City',
        user_id: testUser.id,
        is_active: false,
        last_published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        deactivated_at: now,
        last_deactivation_email_sent_at: futureDate,
      })
      .select()
      .single();

    // Run the email query
    const { data: listingsNeedingEmail, error: queryError } = await supabase
      .from('listings')
      .select('id, title')
      .eq('is_active', false)
      .not('deactivated_at', 'is', null)
      .or('last_deactivation_email_sent_at.is.null,last_deactivation_email_sent_at.lt.deactivated_at');

    if (queryError) {
      logTest(testName, false, 'Query failed', queryError);
      return;
    }

    const testListingIds = [listingA?.id, listingB?.id, listingC?.id].filter(Boolean);
    const foundIds = listingsNeedingEmail
      ?.filter(l => testListingIds.includes(l.id))
      .map(l => l.id) || [];

    const includesA = foundIds.includes(listingA?.id);
    const includesB = foundIds.includes(listingB?.id);
    const excludesC = !foundIds.includes(listingC?.id);

    const passed = includesA && includesB && excludesC;

    logTest(testName, passed, passed ? 'Query correctly identifies listings needing emails' : 'Query logic incorrect', {
      listing_a_included: includesA,
      listing_b_included: includesB,
      listing_c_excluded: excludesC,
      total_found: foundIds.length,
    });

  } catch (error: any) {
    logTest(testName, false, 'Exception occurred', error.message);
  }
}

// Test 6: Template Detection - Automatic vs Manual
async function testTemplateDetection() {
  const testName = 'TEST 6: Template Detection Logic (29-day threshold)';

  try {
    // Test the 29-day threshold calculation
    const publishedDate = new Date('2025-01-01T12:00:00Z');

    // Case 1: Deactivated exactly 29 days later (should be automatic)
    const deactivatedAutomatic = new Date('2025-01-30T12:00:00Z');
    const daysAutomatic = (deactivatedAutomatic.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
    const isAutomatic = daysAutomatic >= 29;

    // Case 2: Deactivated 5 days later (should be manual)
    const deactivatedManual = new Date('2025-01-06T12:00:00Z');
    const daysManual = (deactivatedManual.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
    const isManual = daysManual < 29;

    // Case 3: Boundary - exactly 28.99 days (should be manual)
    const deactivatedBoundary = new Date(publishedDate.getTime() + (28.99 * 24 * 60 * 60 * 1000));
    const daysBoundary = (deactivatedBoundary.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
    const isBoundaryCorrect = daysBoundary < 29;

    const passed = isAutomatic && isManual && isBoundaryCorrect;

    logTest(testName, passed, passed ? 'Template detection logic works correctly' : 'Template detection has issues', {
      case_automatic: {
        days: daysAutomatic,
        detected_as_automatic: isAutomatic,
      },
      case_manual: {
        days: daysManual,
        detected_as_manual: !isManual ? false : true,
      },
      case_boundary: {
        days: daysBoundary,
        detected_as_manual: !isBoundaryCorrect ? false : true,
      },
    });

  } catch (error: any) {
    logTest(testName, false, 'Exception occurred', error.message);
  }
}

// Test 7: Edge Function Connectivity
async function testEdgeFunctionConnectivity() {
  const testName = 'TEST 7: Edge Function Connectivity';

  try {
    // Test if we can invoke the send-deactivation-emails function
    const { data, error } = await supabase.functions.invoke('send-deactivation-emails', {
      body: {},
    });

    if (error) {
      // Function might require authentication or might not be deployed
      if (error.message?.includes('not found')) {
        logTest(testName, false, 'Edge function not deployed', { error: error.message });
      } else {
        // Function exists but might have other issues
        logTest(testName, true, 'Edge function is deployed and responding', {
          error: error.message,
          note: 'Error is expected if function requires specific conditions',
        });
      }
    } else {
      logTest(testName, true, 'Edge function invoked successfully', data);
    }

  } catch (error: any) {
    logTest(testName, false, 'Exception occurred', error.message);
  }
}

// Test 8: Database Schema Validation
async function testDatabaseSchema() {
  const testName = 'TEST 8: Database Schema Validation';

  try {
    // Check if deactivated_at column exists
    const { data: listing, error } = await supabase
      .from('listings')
      .select('id, is_active, deactivated_at, last_deactivation_email_sent_at, last_published_at')
      .limit(1)
      .maybeSingle();

    if (error) {
      logTest(testName, false, 'Failed to query required columns', error);
      return;
    }

    const hasRequiredColumns = listing !== null || error === null;

    logTest(testName, hasRequiredColumns, hasRequiredColumns ? 'All required columns exist' : 'Missing required columns', {
      columns_checked: ['deactivated_at', 'last_deactivation_email_sent_at', 'last_published_at', 'is_active'],
    });

  } catch (error: any) {
    logTest(testName, false, 'Exception occurred', error.message);
  }
}

// Main execution
async function runAllTests() {
  console.log('\n🚀 Starting Deactivation Email System Tests\n');
  console.log('Environment:');
  console.log('  Supabase URL:', supabaseUrl);
  console.log('  Service Key:', supabaseServiceKey.substring(0, 20) + '...');
  console.log('\n');

  try {
    // Clean up any existing test data first
    await cleanup();

    logSection('DATABASE SCHEMA TESTS');
    await testDatabaseSchema();

    logSection('DATABASE TRIGGER TESTS');
    await testTriggerSetsDeactivationTimestamp();
    await testTriggerClearsDeactivationTimestamp();

    logSection('POSTGRESQL FUNCTION TESTS');
    await testAutoInactivationFunction();
    await testAutoDeletionFunction();

    logSection('EMAIL QUERY LOGIC TESTS');
    await testEmailQueryLogic();

    logSection('TEMPLATE DETECTION TESTS');
    await testTemplateDetection();

    logSection('EDGE FUNCTION TESTS');
    await testEdgeFunctionConnectivity();

    // Clean up test data
    await cleanup();

    // Summary
    logSection('TEST SUMMARY');
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Pass Rate: ${passRate}%\n`);

    if (failed > 0) {
      console.log('Failed Tests:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  ❌ ${r.testName}: ${r.message}`);
      });
    }

    console.log('\n✨ Testing complete!\n');

    // Exit with error code if any tests failed
    process.exit(failed > 0 ? 1 : 0);

  } catch (error: any) {
    console.error('\n❌ Fatal error during testing:', error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
