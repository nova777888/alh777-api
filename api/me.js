
// Admin proxy - queries any table using service_role key  
async async function adminQuery(table, select, eqFilters, orderCol, orderDesc) {
  var sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { apikey: SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY } }
  });
  var query = sb.from(table).select(select || "*");
  if (eqFilters) {
    for (var i = 0; i < eqFilters.length; i++) {
      var f = eqFilters[i].split(":");
      if (f.length === 2) query = query.eq(f[0], f[1]);
    }
  }
  if (orderCol) query = query.order(orderCol, { ascending: !orderDesc });
  query = query.range(0, 5000);
  var { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async async function adminWrite(table, method, data, eqFilters) {
  var sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { apikey: SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY } }
  });
  var query;
  if (method === "PATCH") {
    query = sb.from(table).update(data);
  } else if (method === "DELETE") {
    query = sb.from(table).delete();
  }
  if (eqFilters && query) {
    for (var i = 0; i < eqFilters.length; i++) {
      var f = eqFilters[i].split(":");
      if (f.length === 2) query = query.eq(f[0], f[1]);
    }
  }
  if (query) {
    var { data: d, error } = await query.select();
    if (error) throw new Error(error.message);
    return d || [];
  }
  return [];
}

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3";
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || "96ad19dd1d302c46aceea0edf9759655090b762f947f81a6107382e9681784a0", "hex");

function decryptPhone(encrypted) {
  try {
    if (!encrypted || !encrypted.includes(":")) return null;
    var parts = encrypted.split(":");
    var iv = Buffer.from(parts[0], "hex");
    var decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    return decipher.update(parts[1], "hex", "utf8") + decipher.final("utf8");
  } catch(e) { return null; }
}

module.exports = async (req, res) => {
  // Admin proxy route
  if (req.url && req.url.indexOf("/api/admin") >= 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-admin-pass");
    if (req.method === "OPTIONS") return res.status(200).end();

    try {
      var pass = req.headers["x-admin-pass"] || "";
      if (pass !== "nova888") return res.status(401).json({ error: "Unauthorized" });

      var table = req.query.table;
      if (!table) return res.status(400).json({ error: "table required" });

      if (req.method === "PATCH") {
        var pd = req.body;
        var eqF = [];
        if (req.query.eq) {
          var eqs = Array.isArray(req.query.eq) ? req.query.eq : [req.query.eq];
          eqs.forEach(function(p){ eqF.push(p); });
        }
        var d = await adminWrite(table, "PATCH", pd, eqF);
        return res.json({ success: true, data: d });
      }

      if (req.method === "DELETE") {
        var eqF2 = [];
        if (req.query.eq) {
          var eqs2 = Array.isArray(req.query.eq) ? req.query.eq : [req.query.eq];
          eqs2.forEach(function(p){ eqF2.push(p); });
        }
        var d2 = await adminWrite(table, "DELETE", null, eqF2);
        return res.json({ success: true, data: d2 });
      }

      // GET
      var sel = req.query.select || "*";
      var orderCol = req.query.order || null;
      var orderDesc = req.query.desc === "true";
      var eqFilters = [];
      var inFilters = [];
      if (req.query.eq) {
        var eqs3 = Array.isArray(req.query.eq) ? req.query.eq : [req.query.eq];
        eqs3.forEach(function(p){ eqFilters.push(p); });
      }
      if (req.query.in) {
        var inPairs = Array.isArray(req.query.in) ? req.query.in : [req.query.in];
        inPairs.forEach(function(p){ var sp = p.split(":"); if(sp.length >= 2) { inFilters.push({col: sp[0], vals: sp.slice(1)}); } });
      }
      var result = await adminQuery(table, sel, eqFilters, orderCol, orderDesc);
      // Apply in filters
      if (inFilters.length > 0 && result) {
        inFilters.forEach(function(inf) {
          result = result.filter(function(row) {
            return inf.vals.indexOf(String(row[inf.col])) >= 0;
          });
        });
      }
      return res.json({ success: true, data: result });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Original /api/me handler
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: "Bearer " + token } }
    });

    const { data: { user }, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: "Invalid token" });

    // Get profile from customers table
    const { data: profile } = await sb
      .from("customers")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    // Get balance from customer_balances
    const { data: balance } = await sb
      .from("customer_balances")
      .select("*")
      .eq("customer_id", user.id)
      .maybeSingle();

    // Get downline count
    const { count: downlineCount } = await sb
      .from("customers")
      .select("id", { count: "exact" })
      .eq("parent_id", user.id);

    if (profile) {
      var result = {
        id: profile.id,
        name: profile.name || "",
        email: profile.email && profile.email.indexOf("@nogin.nova.local") === -1 ? profile.email : "",
        phone: profile.phone_encrypted ? (decryptPhone(profile.phone_encrypted) || (user.user_metadata && user.user_metadata.phone) || "N/A") : ((user.user_metadata && user.user_metadata.phone) || "N/A"),
        phone_masked: profile.phone_encrypted ? (decryptPhone(profile.phone_encrypted) || (user.user_metadata && user.user_metadata.phone) || "N/A") : ((user.user_metadata && user.user_metadata.phone) || "N/A"),
        referral_code: profile.public_id || "",
        referred_by: profile.parent_id || null,
        downline_count: downlineCount || 0,
        created_at: profile.created_at || "",
        role: profile.role || "customer",
        balance: {
          available_balance: balance ? balance.available_balance : 0,
          total_earned: balance ? balance.total_earned : 0,
          total_withdrawn: balance ? balance.total_withdrawn : 0
        }
      };
      return res.json({ success: true, user: result });
    }

    // No profile found - return fallback from Auth metadata
    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email || "",
        name: (user.user_metadata && user.user_metadata.name) || "",
        phone: "N/A",
        phone_masked: "N/A",
        referral_code: user.id.substring(0, 6).toUpperCase(),
        referred_by: null,
        downline_count: 0,
        created_at: user.created_at || "",
        role: "customer",
        balance: { available_balance: 0, total_earned: 0, total_withdrawn: 0 }
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
