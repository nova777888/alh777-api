const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3";

let supabaseAdmin = null;
if (SUPABASE_ANON_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { apikey: SUPABASE_ANON_KEY } }
  });
}

function getSupabase() {
  return supabaseAdmin;
}

module.exports = { getSupabase, SUPABASE_URL };
