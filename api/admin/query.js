const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const ADMIN_PW = process.env.ADMIN_PASSWORD || "nova888";
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
    // Accept auth via query param ?pw= or POST body { password }
    var pw = req.query.pw || (req.body && req.body.password) || "";
    if (pw !== ADMIN_PW) return res.status(401).json({ error: "Unauthorized" });

    var sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { apikey: SERVICE_KEY } }
    });

    var action = req.query.action || (req.body && req.body.action) || "select";
    var table = req.query.table || (req.body && req.body.table) || "";
    var selectStr = req.query.select || (req.body && req.body.select) || "*";
    var filters = req.query.filters || (req.body && req.body.filters) || null;
    var orderBy = req.query.order || (req.body && req.body.order) || null;
    var eqCol = req.body && req.body.eqCol;
    var eqVal = req.body && req.body.eqVal;
    var inCol = req.body && req.body.inCol;
    var inVals = req.body && req.body.inVals;
    var data = req.body && req.body.data;
    var limit = parseInt(req.query.limit || (req.body && req.body.limit) || 5000);

    if (!table) return res.status(400).json({ error: "table required" });

    if (action === "select" || !action) {
      var query = sb.from(table).select(selectStr).limit(limit);
      if (eqCol && eqVal) query = query.eq(eqCol, eqVal);
      if (inCol && inVals && Array.isArray(inVals) && inVals.length > 0) query = query.in(inCol, inVals);
      if (orderBy) query = query.order(orderBy, { ascending: false });

      var { data: result, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      
      // Decrypt phone numbers in customers table
      if (table === "customers" && Array.isArray(result)) {
        result = result.map(function(c) {
          if (c.phone_encrypted) c.phone_decrypted = decryptPhone(c.phone_encrypted);
          return c;
        });
      }
      
      return res.json({ data: result });
    }

    if (action === "insert") {
      if (!data) return res.status(400).json({ error: "data required" });
      var { data: result, error } = await sb.from(table).insert(data).select();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ data: result });
    }

    if (action === "update") {
      if (!data) return res.status(400).json({ error: "data required" });
      var query = sb.from(table).update(data);
      if (eqCol && eqVal) query = query.eq(eqCol, eqVal);
      if (inCol && inVals && Array.isArray(inVals)) query = query.in(inCol, inVals);
      var { data: result, error } = await query.select();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ data: result });
    }

    if (action === "delete") {
      var query = sb.from(table).delete();
      if (eqCol && eqVal) query = query.eq(eqCol, eqVal);
      if (inCol && inVals && Array.isArray(inVals)) query = query.in(inCol, inVals);
      var { data: result, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
