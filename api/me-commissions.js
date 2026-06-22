const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3";

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

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: \Bearer \\ } }
    });

    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return res.status(401).json({ error: "Invalid token" });

    const downlineId = req.query.downline_id;
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 50;
    var offset = (page - 1) * limit;
    var monthFilter = req.query.month || "";

    if (downlineId) {
      const { data: commissions } = await sb
        .from("commissions")
        .select("*")
        .eq("referrer_id", user.id)
        .eq("downline_id", downlineId)
        .order("created_at", { ascending: false });
      return res.json({ success: true, commissions: commissions || [] });
    }

    // No downline_id: return ALL commissions for this referrer
    var query = sb.from("commissions").select("*", { count: "exact" }).eq("referrer_id", user.id);
    if (monthFilter) {
      var monthStart = monthFilter + "-01";
      var nextMonth = new Date(new Date(monthStart).getFullYear(), new Date(monthStart).getMonth() + 1, 1).toISOString().substring(0, 10);
      query = query.gte("created_at", monthStart).lt("created_at", nextMonth);
    }
    const { data: commissions, count } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    // Get total count without pagination for accurate total
    const { count: totalCount } = await sb.from("commissions").select("id", { count: "exact" }).eq("referrer_id", user.id);
    return res.json({
      success: true,
      commissions: commissions || [],
      total: totalCount || 0,
      pages: Math.ceil((totalCount || 0) / limit) || 1,
      page: page,
      month: monthFilter
    });
  } catch (err) {
    return res.json({ commissions: [], total: 0, pages: 1, page: 1 });
  }
};
