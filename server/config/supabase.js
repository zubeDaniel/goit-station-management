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

// Per-request service-role client carrying the acting user's ID as a
// header. PostgREST automatically exposes request headers to Postgres
// via the `request.headers` GUC, which audit_log_trigger() reads to
// correctly attribute UPDATE/DELETE to the person who actually made
// the change, not the row's original creator. See middleware/auth.js,
// which attaches one of these to every authenticated request as
// req.supabaseAdmin. Routes should use req.supabaseAdmin instead of
// this module's plain supabaseAdmin wherever a request is available.
function createActorClient(actorId) {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: { 'x-actor-id': actorId || '' }
    }
  });
}

module.exports = { supabase, supabaseAdmin, createActorClient };