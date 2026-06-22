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
      global: { headers: { Authorization: "Bearer " + token } }
    });

    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return res.status(401).json({ error: "Invalid token" });

    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 20;
    var offset = (page - 1) * limit;
    var monthFilter = req.query.month || "";

    // Get total downline count for this user
    var countQuery = sb.from("users").select("id", { count: "exact" }).eq("referred_by", user.id);
    const { count: totalCount } = await countQuery;

    // Get downlines with pagination
    var dlQuery = sb
      .from("users")
      .select("id, name, email, phone, created_at, referral_code")
      .eq("referred_by", user.id)
      .order("created_at", { ascending: false });

    const { data: downlines, error: dlErr } = await dlQuery.range(offset, offset + limit - 1);

    if (dlErr) {
      return res.json({ success: true, downlines: [], total: 0, pages: 0, page: 1 });
    }

    // Enrich each downline with monthly trading volume and commission data
    var enrichedDownlines = [];
    var now = new Date();
    var monthStart = monthFilter ? new Date(monthFilter + "-01") : new Date(now.getFullYear(), now.getMonth(), 1);

    for (var i = 0; i < (downlines || []).length; i++) {
      var dl = downlines[i];
      var monthStartStr = monthStart.toISOString();
      var nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
      var monthEndStr = nextMonth.toISOString();

      // Get this downline's transactions for the month
      const { data: dlTxns } = await sb
        .from("transactions")
        .select("amount, created_at")
        .eq("user_id", dl.id)
        .gte("created_at", monthStartStr)
        .lt("created_at", monthEndStr);

      var monthlyVolume = 0;
      if (dlTxns) {
        for (var t = 0; t < dlTxns.length; t++) {
          monthlyVolume += parseFloat(dlTxns[t].amount) || 0;
        }
      }

      // Get commissions this referrer earned from this downline for the month
      const { data: dlComms } = await sb
        .from("commissions")
        .select("amount, created_at, status")
        .eq("referrer_id", user.id)
        .eq("downline_id", dl.id)
        .gte("created_at", monthStartStr)
        .lt("created_at", monthEndStr);

      var monthlyCommission = 0;
      var totalCommission = 0;
      if (dlComms) {
        for (var c2 = 0; c2 < dlComms.length; c2++) {
          var amt = parseFloat(dlComms[c2].amount) || 0;
          monthlyCommission += amt;
        }
      }

      // Get ALL commissions from this downline (cumulative)
      const { data: allDlComms } = await sb
        .from("commissions")
        .select("amount")
        .eq("referrer_id", user.id)
        .eq("downline_id", dl.id);

      if (allDlComms) {
        for (var c3 = 0; c3 < allDlComms.length; c3++) {
          totalCommission += parseFloat(allDlComms[c3].amount) || 0;
        }
      }

      enrichedDownlines.push({
        id: dl.id,
        name: dl.name || dl.email || "User",
        phone: dl.phone || "",
        email: dl.email || "",
        created_at: dl.created_at || "",
        referral_code: dl.referral_code || "",
        monthly_volume: monthlyVolume,
        monthly_commission: monthlyCommission,
        total_commission: totalCommission
      });
    }

    return res.json({
      success: true,
      downlines: enrichedDownlines,
      total: totalCount || 0,
      pages: Math.ceil((totalCount || 0) / limit) || 1,
      page: page,
      month: monthFilter || (now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0"))
    });
  } catch (err) {
    return res.json({ success: true, downlines: [], total: 0, pages: 0, page: 1 });
  }
};