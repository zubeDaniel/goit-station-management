const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase URL:', supabaseUrl ? 'set' : 'MISSING');
console.log('Anon key:', supabaseAnonKey ? 'set' : 'MISSING');
console.log('Service key:', supabaseServiceKey ? 'set' : 'MISSING');

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('Supabase clients created successfully');

module.exports = { supabase, supabaseAdmin };