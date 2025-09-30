import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.error('❌ Missing Supabase environment variables. Check your .env file.');
  console.error('   Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

async function smokeTestAnalytics() {
  console.log('🧪 Starting analytics smoke test...');
  
  // Test with legacy non-UUID IDs to verify normalization
  const testEvents = [
    {
      session_id: "legacy-session-123",
      anon_id: "legacy-anon-abc", 
      event_name: "smoke_test_1",
      event_props: { source: "smoke_test", test_id: 1 },
      occurred_at: new Date().toISOString()
    },
    {
      session_id: "another-bad-id-456",
      anon_id: "another-bad-anon-def",
      event_name: "smoke_test_2", 
      event_props: { source: "smoke_test", test_id: 2 },
      occurred_at: new Date().toISOString()
    }
  ];

  try {
    console.log('📤 Sending test events to track function...');
    
    const { data, error } = await supabase.functions.invoke('track', {
      body: { events: testEvents }
    });

    if (error) {
      console.error('❌ Edge Function error:', error);
      return false;
    }

    console.log('✅ Edge Function response:', data);

    // Wait a moment for data to be written
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify events were inserted
    console.log('🔍 Checking if events were inserted...');
    
    const { data: recentEvents, error: queryError } = await supabaseAdmin
      .from('analytics_events')
      .select('event_name, session_id, anon_id, occurred_at')
      .eq('event_name', 'smoke_test_1')
      .order('occurred_at', { ascending: false })
      .limit(1);

    if (queryError) {
      console.error('❌ Query error:', queryError);
      return false;
    }

    if (!recentEvents || recentEvents.length === 0) {
      console.error('❌ No smoke test events found in database');
      return false;
    }

    console.log('✅ Found smoke test event in database:', recentEvents[0]);
    
    // Verify session was created
    const { data: sessions, error: sessionError } = await supabaseAdmin
      .from('analytics_sessions')
      .select('session_id, anon_id, started_at')
      .order('started_at', { ascending: false })
      .limit(2);

    if (sessionError) {
      console.error('❌ Session query error:', sessionError);
      return false;
    }

    console.log('✅ Recent sessions:', sessions);

    return true;

  } catch (error) {
    console.error('❌ Smoke test failed:', error);
    return false;
  }
}

async function main() {
  const success = await smokeTestAnalytics();
  
  if (success) {
    console.log('\n🎉 Analytics smoke test PASSED');
    console.log('📊 Next steps:');
    console.log('   • Check Supabase Dashboard → Edge Functions → track → Logs');
    console.log('   • Visit /admin?tab=analytics to verify dashboard works');
    console.log('   • Interact with your app to generate real events');
  } else {
    console.log('\n💥 Analytics smoke test FAILED');
    console.log('🔧 Troubleshooting:');
    console.log('   • Check Edge Function environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
    console.log('   • Verify track function is deployed: supabase functions deploy track');
    console.log('   • Check Edge Function logs for detailed errors');
    process.exit(1);
  }
}

main().catch(console.error);