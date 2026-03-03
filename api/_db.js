// Lightweight Supabase client wrapper for Vercel serverless functions
// Expects SUPABASE_URL and SUPABASE_ANON_KEY in environment
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
// Prefer the SERVICE role key for server-side functions when available
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('[_db] SUPABASE_URL or SUPABASE key not set in env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
