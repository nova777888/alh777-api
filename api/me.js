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

    // Build fallback user from Auth metadata
    var fallbackUser = {
      id: user.id,
      email: user.email || "",
      name: (user.user_metadata && user.user_metadata.name) || "",
      phone: (user.user_metadata && user.user_metadata.phone) || "",
      referral_code: (user.user_metadata && user.user_metadata.referral_code) || user.id.substring(0, 6).toUpperCase(),
      balance: 0,
      downline_count: 0,
      phone_masked: "N/A",
      created_at: user.created_at || new Date().toISOString()
    };

    // Try to get profile from users table
    const { data: profile, error: profileErr } = await sb
      .from("users")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      // User found in users table - use profile data
      if (profile.phone) {
        var p = String(profile.phone);
        profile.phone_masked = "********" + p.slice(-4);
      } else {
        profile.phone_masked = "N/A";
      }

      // Get downline count
      const { count: downlineCount } = await sb
        .from("users")
        .select("id", { count: "exact" })
        .eq("referred_by", user.id);
      profile.downline_count = downlineCount || 0;

      // Format balance as object
      var balVal = typeof profile.balance === "number" ? profile.balance : 0;
      profile.balance = {
        available_balance: balVal,
        total_earned: 0,
        total_withdrawn: 0
      };

      return res.json({ success: true, user: profile });
    }

    // User not in users table - try by email
    if (user.email) {
      const { data: profileByEmail } = await sb
        .from("users")
        .select("*")
        .eq("email", user.email.toLowerCase())
        .maybeSingle();

      if (profileByEmail) {
        if (profileByEmail.phone) {
          var p2 = String(profileByEmail.phone);
          profileByEmail.phone_masked = "********" + p2.slice(-4);
        }

        const { count: dlCount } = await sb
          .from("users")
          .select("id", { count: "exact" })
          .eq("referred_by", profileByEmail.id);
        profileByEmail.downline_count = dlCount || 0;

        var balVal2 = typeof profileByEmail.balance === "number" ? profileByEmail.balance : 0;
        profileByEmail.balance = { available_balance: balVal2, total_earned: 0, total_withdrawn: 0 };

        return res.json({ success: true, user: profileByEmail });
      }
    }

    // No profile found anywhere - return fallback from Auth metadata
    return res.json({ success: true, user: fallbackUser });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
