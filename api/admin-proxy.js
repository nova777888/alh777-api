const { createClient } = require( @supabase/supabase-js);

const SUPABASE_URL = process.env.SUPABASE_URL || https://ecikviwuxfieryrmfgdq.supabase.co;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KE || process.env.SUPABASE_SERVICE_ROLE_KEY || ";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || nova888;

module.exports = async (req, res) => {
  res.setHeader(Access-Control-Allow-Origin, *);
  res.setHeader(Access-Control-Allow-Methods, GET @supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "nova888";

module.exports = async (req, res) => {
 res.setHeader("Access-Control-Allow-Origin", "*");
 res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PATCH, DELETE");
 res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-admin-pass");
 if (req.method === "OPTIONS") return res.status(200).end();

 try {
 var pass = req.headers["x-admin-pass"] || "";
 if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

 var sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
 auth: { autoRefreshToken: false, persistSession: false },
 global: { headers: { apikey: SUPABASE_SERVICE_KEY } }
 });

 var table = req.query.table;
 if (!table) return res.status(400).json({ error: "table required });

    // PATCH - update records
    if (req.method === PATCH) {
      var patchData = req.body;
      var patchQuery = sb.from(table).update(patchData);
      if (req.query.eq) {
        var eqPairs = Array.isArray(req.query.eq) ? req.query.eq : [req.query.eq];
        eqPairs.forEach(function(p) {
          var parts = p.split(:);
          if (parts.length === 2) patchQuery = patchQuery.eq(parts[0], parts[1]);
        });
      }
      var { data, error } = await patchQuery.select();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, data: data });
    }

    // DELETE - delete records
    if (req.method === DELETE) {
      var delQuery = sb.from(table).delete();
      if (req.query.eq) {
        var eqPairs = Array.isArray(req.query.eq) ? req.query.eq : [req.query.eq];
        eqPairs.forEach(function(p) {
          var parts = p.split(:);
          if (parts.length === 2) delQuery = delQuery.eq(parts[0], parts[1]);
        });
      }
      var { data, error } = await delQuery.select();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, data: data });
    }

    // GET - read operations
    var select = req.query.select || *;
    var query = sb.from(table).select(select);

    if (req.query.eq) {
      var eqPairs = Array.isArray(req.query.eq) ? req.query.eq : [req.query.eq];
      eqPairs.forEach(function(p) {
        var parts = p.split(:);
        if (parts.length === 2) query = query.eq(parts[0], parts[1]);
      });
    }
    if (req.query.in) {
      var inPairs = Array.isArray(req.query.in) ? req.query.in : [req.query.in];
      inPairs.forEach(function(p) {
        var sp = p.split(:);
        if (sp.length >= 2) query = query.in(sp[0], sp.slice(1));
      });
    }

    if (req.query.order) query = query.order(req.query.order, { ascending: req.query.asc !== false });
    var limit = parseInt(req.query.limit || 1000, 10);
    var page = parseInt(req.query.page || 0, 10);
    if (limit > 0) query = query.range(page * limit, (page + 1) * limit - 1);

    var { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, data: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
