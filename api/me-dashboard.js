const { createClient } = require(\"@supabase/supabase-js\");

const SUPABASE_URL = process.env.SUPABASE_URL || \"https://ecikviwuxfieryrmfgdq.supabase.co\";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || \"sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3\";

module.exports = async (req, res) => {
  res.setHeader(\"Access-Control-Allow-Origin\", \"*\");
  res.setHeader(\"Access-Control-Allow-Methods\", \"GET, POST, OPTIONS\");
  res.setHeader(\"Access-Control-Allow-Headers\", \"Content-Type, Authorization\");
  if (req.method === \"OPTIONS\") return res.status(200).end();
  if (req.method !== \"GET\") return res.status(405).json({ error: \"Method not allowed\" });

  try {
    const authHeader = req.headers.authorization || \"\";
    const token = authHeader.startsWith(\"Bearer \") ? authHeader.slice(7) : \"\";
    if (!token) return res.status(401).json({ error: \"Unauthorized\" });

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: \"Bearer \" + token } }
    });

    const { data: { user }, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: \"Invalid token\" });

    // Get user profile
    const { data: profile } = await sb
      .from(\"users\")
      .select(\"*\")
      .eq(\"id\", user.id)
      .maybeSingle();

    var balance = 0;
    if (profile && profile.balance) {
      balance = typeof profile.balance === \"number\" ? profile.balance : (profile.balance.available_balance || 0);
    }

    // Get downline count
    const { count: downlineCount } = await sb
      .from(\"users\")
      .select(\"id\", { count: \"exact\" })
      .eq(\"referred_by\", user.id);

    // Get transaction stats
    const { data: txns } = await sb
      .from(\"transactions\")
      .select(\"amount, created_at\")
      .eq(\"user_id\", user.id)
      .order(\"created_at\", { ascending: false });

    var totalVolume = 0;
    var txCount = 0;
    var monthlyCommission = 0;
    var todayVolume = 0;

    if (txns && txns.length > 0) {
      txCount = txns.length;
      var now = new Date();
      var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      for (var i = 0; i < txns.length; i++) {
        var amt = parseFloat(txns[i].amount) || 0;
        totalVolume += amt;
        var txDate = txns[i].created_at || \"\";
        if (txDate >= todayStart) todayVolume += amt;
      }
    }

    // Get commissions data
    const { data: commissions } = await sb
      .from(\"commissions\")
      .select(\"amount, status, created_at\")
      .eq(\"referrer_id\", user.id);

    var pendingCommission = 0;
    var settledCommission = 0;
    if (commissions) {
      var now = new Date();
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      var nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      
      for (var j = 0; j < commissions.length; j++) {
        var commAmt = parseFloat(commissions[j].amount) || 0;
        var status = commissions[j].status;
        var created = commissions[j].created_at || \"\";
        
        if (status === \"pending\" || status === \"processing\") {
          pendingCommission += commAmt;
        } else if (status === \"settled\" || status === \"completed\") {
          settledCommission += commAmt;
        }
        
        // Calculate this month's commission (regardless of status)
        if (created >= monthStart && created < nextMonth) {
          monthlyCommission += commAmt;
        }
      }
    }

    return res.json({
      success: true,
      data: {
        available_balance: balance,
        total_earned: settledCommission,
        total_withdrawn: 0,
        pending_commission: pendingCommission,
        downline_count: downlineCount || 0,
        today_volume: todayVolume,
        month_commission: monthlyCommission,
        transaction_count: txCount,
        total_volume: totalVolume
      }
    });
  } catch (err) {
    return res.json({
      success: true,
      data: {
        available_balance: 0, total_earned: 0, total_withdrawn: 0,
        pending_commission: 0, downline_count: 0, today_volume: 0,
        month_commission: 0, transaction_count: 0, total_volume: 0
      }
    });
  }
};
