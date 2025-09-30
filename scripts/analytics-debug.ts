import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

async function debugAnalyticsPipeline() {
  console.log('🔍 Analytics Pipeline Debug Report');
  console.log('=====================================\n');

  // 1. Check if analytics functions exist
  console.log('1. Checking analytics functions...');
  try {
    const { data: functions, error } = await supabaseAdmin
      .from('pg_proc')
      .select('proname')
      .like('proname', 'analytics_%');
    
    if (error) {
      console.log('❌ Error checking functions:', error);
    } else {
      const functionNames = functions?.map(f => f.proname) || [];
      console.log('✅ Found functions:', functionNames);
      
      const requiredFunctions = ['analytics_kpis', 'analytics_summary', 'analytics_top_listings', 'analytics_top_filters'];
      const missingFunctions = requiredFunctions.filter(f => !functionNames.includes(f));
      if (missingFunctions.length > 0) {
        console.log('❌ Missing functions:', missingFunctions);
      }
    }
  } catch (err) {
    console.log('❌ Error checking functions:', err);
  }

  // 2. Check raw event data
  console.log('\n2. Checking raw analytics events...');
  try {
    const { data: events, error } = await supabaseAdmin
      .from('analytics_events')
      .select('event_name, occurred_at, session_id, anon_id')
      .order('occurred_at', { ascending: false })
      .limit(5);

    if (error) {
      console.log('❌ Error querying events:', error);
    } else {
      console.log(`✅ Found ${events?.length || 0} recent events:`);
      events?.forEach(event => {
        console.log(`   ${event.event_name} at ${event.occurred_at}`);
      });
    }
  } catch (err) {
    console.log('❌ Error querying events:', err);
  }

  // 3. Check sessions data
  console.log('\n3. Checking analytics sessions...');
  try {
    const { data: sessions, error } = await supabaseAdmin
      .from('analytics_sessions')
      .select('session_id, anon_id, started_at, last_seen_at')
      .order('started_at', { ascending: false })
      .limit(5);

    if (error) {
      console.log('❌ Error querying sessions:', error);
    } else {
      console.log(`✅ Found ${sessions?.length || 0} recent sessions:`);
      sessions?.forEach(session => {
        console.log(`   Session ${session.session_id.slice(0, 8)}... started ${session.started_at}`);
      });
    }
  } catch (err) {
    console.log('❌ Error querying sessions:', err);
  }

  // 4. Test analytics functions directly
  console.log('\n4. Testing analytics functions...');
  
  // Test analytics_kpis
  try {
    const { data: kpis, error } = await supabaseAdmin
      .rpc('analytics_kpis', { days_back: 0, tz: 'America/New_York' });
    
    if (error) {
      console.log('❌ analytics_kpis error:', error);
    } else {
      console.log('✅ analytics_kpis result:', kpis?.[0]);
    }
  } catch (err) {
    console.log('❌ analytics_kpis exception:', err);
  }

  // Test analytics_summary
  try {
    const { data: summary, error } = await supabaseAdmin
      .rpc('analytics_summary', { days_back: 0, tz: 'America/New_York' });
    
    if (error) {
      console.log('❌ analytics_summary error:', error);
    } else {
      console.log('✅ analytics_summary result:', summary?.[0]);
    }
  } catch (err) {
    console.log('❌ analytics_summary exception:', err);
  }

  // 5. Check timezone handling
  console.log('\n5. Testing timezone handling...');
  try {
    const { data: tzTest, error } = await supabaseAdmin
      .from('analytics_events')
      .select('occurred_at')
      .gte('occurred_at', new Date().toISOString().split('T')[0] + 'T00:00:00Z')
      .limit(1);

    if (error) {
      console.log('❌ Timezone test error:', error);
    } else {
      console.log(`✅ Events today (UTC): ${tzTest?.length || 0}`);
    }

    // Test with NY timezone
    const nyDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const { data: nyTest, error: nyError } = await supabaseAdmin
      .from('analytics_events')
      .select('occurred_at')
      .gte('occurred_at', nyDate + 'T00:00:00-05:00')
      .limit(1);

    if (nyError) {
      console.log('❌ NY timezone test error:', nyError);
    } else {
      console.log(`✅ Events today (NY): ${nyTest?.length || 0}`);
    }
  } catch (err) {
    console.log('❌ Timezone test exception:', err);
  }

  // 6. Generate test events
  console.log('\n6. Generating test events...');
  try {
    const testEvents = [
      {
        session_id: crypto.randomUUID(),
        anon_id: crypto.randomUUID(),
        event_name: 'page_view',
        event_props: { path: '/debug' },
        occurred_at: new Date().toISOString()
      },
      {
        session_id: crypto.randomUUID(),
        anon_id: crypto.randomUUID(),
        event_name: 'listing_view',
        event_props: { listing_id: 'debug-listing' },
        occurred_at: new Date().toISOString()
      }
    ];

    const { data, error } = await supabase.functions.invoke('track', {
      body: { events: testEvents }
    });

    if (error) {
      console.log('❌ Track function error:', error);
    } else {
      console.log('✅ Track function response:', data);
    }
  } catch (err) {
    console.log('❌ Track function exception:', err);
  }

  console.log('\n🔍 Debug complete. Check the results above for issues.');
}

debugAnalyticsPipeline().catch(console.error);