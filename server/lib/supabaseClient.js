/**
 * Supabase Client for Chatty - Shared VVAULT Backend
 * 
 * This module connects Chatty to the same Supabase instance as VVAULT,
 * enabling real-time sync and shared source of truth for construct data.
 */

const { createClient } = require('@supabase/supabase-js');

let supabaseClient = null;

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('⚠️ [Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY - Supabase features disabled');
    return null;
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log('✅ [Supabase] Client initialized successfully');
    return supabaseClient;
  } catch (error) {
    console.error('❌ [Supabase] Failed to create client:', error.message);
    return null;
  }
}

function getSupabaseAnonClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

async function testSupabaseConnection() {
  const client = getSupabaseClient();
  if (!client) return { connected: false, error: 'No client' };

  try {
    const { data, error } = await client.from('users').select('count').limit(1);
    if (error) throw error;
    return { connected: true, tables: ['users'] };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

module.exports = {
  getSupabaseClient,
  getSupabaseAnonClient,
  testSupabaseConnection
};
