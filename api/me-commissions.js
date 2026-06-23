const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KE || process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const sbAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: "Bearer " + token } }
    });
    const sbData = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user } } = await sbAuth.auth.getUser(token);
    if (!user) return res.status(401).json({ error: "Invalid token" });

    const downlineId = req.query.downline_id;
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 50;
    var offset = (page - 1) * limit;
    var monthFilter = req.query.month || "";

    if (downlineId) {
      const { data: commissions } = await sbData
        .from("commissions")
        .select("*")
        .eq("customer_id", user.id)
        .eq("downline_id", downlineId)
        .order("created_at", { ascending: false });
      return res.json({ success: true, commissions: commissions || [] });
    }

    // No downline_id: return ALL commissions for this referrer
    var query = sbData.from("commissions").select("id,customer_id,from_customer_id,amount,rate,commission,month,settled,created_at", { count: "exact" }).eq("customer_id", user.id);
    if (monthFilter) {
      var monthStart = monthFilter + "-01";
      var nextMonth = new Date(new Date(monthStart).getFullYear(), new Date(monthStart).getMonth() + 1, 1).toISOString().substring(0, 10);
      query = query.gte("created_at", monthStart).lt("created_at", nextMonth);
    }
    const { data: commissions, count } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    // Get total count without pagination for accurate total
    const { count: totalCount } = await sbData.from("commissions").select("customer_id,from_customer_id,amount,commission,created_at", { count: "exact" }).eq("customer_id", user.id);
    // Resolve from_customer_id to public_id if possible
    var fromIds = (commissions||[]).map(function(x){ return x.from_customer_id; }).filter(function(x){ return x; });
    var fromMap = {};
    if (fromIds.length > 0) {
      var { data: fromCusts } = await sbData
        .from("customers")
        .select("id,public_id,phone_encrypted")
        .in("id", fromIds);
      if (fromCusts) {
        fromCusts.forEach(function(x){ fromMap[x.id] = x.public_id || x.id.substring(0,8); });
      }
    }
    var enriched = (commissions||[]).map(function(x){
      return Object.assign({}, x, { from_public_id: fromMap[x.from_customer_id] || x.from_customer_id.substring(0,8) });
    });

    return res.json({
      success: true,
      commissions: enriched,
      total: totalCount || 0,
      pages: Math.ceil((totalCount || 0) / limit) || 1,
      page: page,
      month: monthFilter
    });
  } catch (err) {
    return res.json({ commissions: [], total: 0, pages: 1, page: 1 });
  }
};
