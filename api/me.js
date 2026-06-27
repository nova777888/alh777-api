const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {

  // Admin decrypt mode: ?admin=true&pw=nova888
  if (req.query && req.query.admin === "true" && req.query.pw === (process.env.ADMIN_PASSWORD || "nova888")) {
    var srk = process.env.SUPABASE_SERVICE_ROLE_KE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!srk) { srk = SUPABASE_ANON_KEY; }
    var sbAdmin = createClient(SUPABASE_URL, srk, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { apikey: srk } }
    });
    var action = req.query.action || "decrypt";
    if (action === "decrypt") {
      var { data: customers, error } = await sbAdmin.from('customers').select('id,name,phone_encrypted,public_id,parent_id,telegram_id,email,bound_email,created_at').limit(5000);
      if (error) return res.status(500).json({ error: error.message });
      var result = customers.map(function(c) {
        var phone = c.phone_encrypted ? (decryptPhone(c.phone_encrypted) || '') : '';
        return { id: c.id, name: c.name, phone: phone, public_id: c.public_id, parent_id: c.parent_id, telegram_id: c.telegram_id, email: c.email, bound_email: c.bound_email, created_at: c.created_at };
      });
      return res.json({ success: true, data: result });
    }
    if (action === "transactions") {
      var { data: txs, error: txErr } = await sbAdmin.from('transactions').select('id,customer_id,amount,source,trade_date,created_at').limit(10000);
      if (txErr) return res.status(500).json({ error: txErr.message });
      return res.json({ success: true, data: txs || [] });
    }
    if (action === "advances") {
      var { data: advs, error: advErr } = await sbAdmin.from('transactions').select('customer_id,amount').eq('source','advance').limit(10000);
      if (advErr) return res.status(500).json({ error: advErr.message });
      return res.json({ success: true, data: advs || [] });
    }
    if (action === "insert_transactions") {
      if (!req.body || !req.body.transactions || !req.body.transactions.length) return res.status(400).json({ error: 'transactions array required' });
      var { data: ins, error: insErr } = await sbAdmin.from('transactions').insert(req.body.transactions).select();
      if (insErr) return res.status(500).json({ error: insErr.message });
      return res.json({ success: true, inserted: (ins || []).length });
    }
            if (action === "update_password") {
      var cid = req.query.customer_id || "";
      var newPwd = req.query.password || "";
      if (!cid || !newPwd) return res.status(400).json({ error: "customer_id and password required" });
      if (newPwd.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      try {
        var authUrl = SUPABASE_URL + '/auth/v1/admin/users/' + cid;
        var authRes = await fetch(authUrl, {
          method: 'PUT',
          headers: { 'apikey': srk, 'Authorization': 'Bearer ' + srk, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: newPwd })
        });
        if (!authRes.ok) {
          var authErr = await authRes.text();
          return res.status(500).json({ error: 'Failed to update password: ' + authErr });
        }
        return res.json({ success: true, message: "Password updated successfully" });
      } catch(e) {
        return res.status(500).json({ error: e.message });
      }
    }if (action === "update_email") {
      var cid = req.query.customer_id || "";
      var email = req.query.email || "";
      if (!cid || !email) return res.status(400).json({ error: "customer_id and email required" });
      // Check duplicate email
      var { data: dup, error: dupErr } = await sbAdmin.from('customers').select('id,phone_encrypted').eq('email', email).neq('id', cid).maybeSingle();
      if (dup) {
        var dupPhone = dup.phone_encrypted ? (decryptPhone(dup.phone_encrypted) || 'unknown') : 'unknown';
        return res.status(409).json({ error: '该邮箱已绑定账号 ' + dupPhone });
      }
      var { error: upErr } = await sbAdmin.from('customers').update({ email: email }).eq('id', cid);
      if (upErr) return res.status(500).json({ error: upErr.message });
      return res.json({ success: true, message: "Email updated" });
    }
    if (action === "update_vipid") {
      var cid = req.query.customer_id || "";
      var vipid = req.query.vipid || "";
      if (!cid || !vipid) return res.status(400).json({ error: "customer_id and vipid required" });
      var { error: upErr } = await sbAdmin.from('customers').update({ public_id: vipid }).eq('id', cid);
      if (upErr) return res.status(500).json({ error: upErr.message });
      return res.json({ success: true, message: "VIP ID updated" });
    }
    if (action === "update_referrer") {
      var cid = req.query.customer_id || "";
      var pid = req.query.parent_id || "";
      if (!cid || !pid) return res.status(400).json({ error: "customer_id and parent_id required" });
      var { error: upErr } = await sbAdmin.from('customers').update({ parent_id: pid }).eq('id', cid);
      if (upErr) return res.status(500).json({ error: upErr.message });
      return res.json({ success: true, message: "Referrer updated" });
    }
    return res.status(400).json({ error: 'Unknown action' });
  }

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

    // Get downline count (all 4 levels)
    var { data: allCusts } = await sb
      .from("customers")
      .select("id,parent_id");
    var downlineCount = 0;
    var current = [user.id];
    for(var lvl=0; lvl<4; lvl++) {
      var next = (allCusts||[]).filter(function(x){ return current.indexOf(x.parent_id) !== -1; }).map(function(x){ return x.id; });
      downlineCount += next.length;
      current = next;
      if(next.length===0) break;
    }

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

