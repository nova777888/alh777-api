const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KE || process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

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
    
    const { data: { user }, error: userErr } = await sbAuth.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: "Invalid token" });

    // Get balance from customer_balances
    const { data: balance } = await sbData
      .from("customer_balances")
      .select("*")
      .eq("customer_id", user.id)
      .maybeSingle();

    var availableBalance = balance ? balance.available_balance : 0;
    var totalWithdrawn = balance ? balance.total_withdrawn : 0;

    // Get monthly advances (transactions with source='advance' for current month)
    var nowAdv = new Date();
    var monthStartAdv = new Date(nowAdv.getFullYear(), nowAdv.getMonth(), 1).toISOString();
    var nextMonthAdv = new Date(nowAdv.getFullYear(), nowAdv.getMonth() + 1, 1).toISOString();
    const { data: advances } = await sbData
      .from("transactions")
      .select("amount")
      .eq("customer_id", user.id)
      .eq("source", "advance")
      .gte("created_at", monthStartAdv)
      .lt("created_at", nextMonthAdv);

    var monthAdvances = 0;
    if (advances) {
      for (var a = 0; a < advances.length; a++) {
        monthAdvances += parseFloat(advances[a].amount) || 0;
      }
    }

    // Get downline count
    const { count: downlineCount } = await sbData
      .from("customers")
      .select("id", { count: "exact" })
      .eq("parent_id", user.id);

    // Get commissions stats
    const { data: commissions } = await sbData
      .from("commissions")
      .select("commission, settled, created_at")
      .eq("customer_id", user.id);

    var pendingCommission = 0;
    var settledCommission = 0;
    var monthlyCommission = 0;

    if (commissions) {
      var now = new Date();
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      var nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      for (var j = 0; j < commissions.length; j++) {
        var amt = parseFloat(commissions[j].commission) || 0;
        var settled = commissions[j].settled;
        var created = commissions[j].created_at || "";

        if (settled === false || settled === null || settled === undefined) pendingCommission += amt;
        else if (settled === true) settledCommission += amt;

        if (created >= monthStart && created < nextMonth) monthlyCommission += amt;
      }
    }

    return res.json({
      success: true,
      data: {
        available_balance: availableBalance,
        total_earned: settledCommission + pendingCommission,
        total_withdrawn: totalWithdrawn,
        pending_commission: pendingCommission,
        downline_count: downlineCount || 0,
        month_advances: monthAdvances,
        remaining_commission: Math.max(0, monthlyCommission - monthAdvances),
        today_volume: 0,
        month_commission: monthlyCommission,
        transaction_count: 0,
        total_volume: 0
      }
    });
  } catch (err) {
    return res.json({
      success: true,
      data: {
        available_balance: 0, total_earned: 0, total_withdrawn: 0,
        pending_commission: 0, downline_count: 0, month_advances: 0, remaining_commission: 0, today_volume: 0,
        month_commission: 0, transaction_count: 0, total_volume: 0
      }
    });
  }
};
