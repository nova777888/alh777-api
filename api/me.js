const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3";

module.exports = async (req, res) => {
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

    // Get user profile from users table
    const { data: profile, error: profileErr } = await sb
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileErr && profileErr.code !== "PGRST116") {
      // Try by email
      const { data: profileByEmail } = await sb
        .from("users")
        .select("*")
        .eq("email", user.email)
        .single();
      
      var userData = profileByEmail || { id: user.id, email: user.email, name: user.user_metadata?.name || "", phone: user.user_metadata?.phone || "" };
      
      // Add phone_masked
      if (userData.phone) {
        var p = String(userData.phone);
        userData.phone_masked = "********" + p.slice(-4);
      }
      
      return res.json({ success: true, user: userData });
    }

    if (!profile) {
      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email || "",
          name: user.user_metadata?.name || "",
          phone: user.user_metadata?.phone || "",
          phone_masked: "N/A"
        }
      });
    }

    // Add phone_masked field
    if (profile.phone) {
      var p = String(profile.phone);
      profile.phone_masked = "********" + p.slice(-4);
    }

    // Get downline count
    const { count: downlineCount } = await sb
      .from("users")
      .select("id", { count: "exact" })
      .eq("referred_by", user.id);

    profile.downline_count = downlineCount || 0;

    // Format balance as object for frontend
    var balVal = typeof profile.balance === "number" ? profile.balance : 0;
    profile.balance = {
      available_balance: balVal,
      total_earned: 0,
      total_withdrawn: 0
    };

    return res.json({ success: true, user: profile });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
