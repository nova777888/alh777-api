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

    // Find users who were referred by this user (referred_by = user.id)
    const { data: downlines, error: dlErr } = await sb
      .from("users")
      .select("id, name, email, phone, created_at, referral_code")
      .eq("referred_by", user.id)
      .order("created_at", { ascending: false });

    if (dlErr) {
      // Fallback: try referral_code matching
      const { data: fallback } = await sb
        .from("users")
        .select("id, name, email, phone, created_at, referral_code")
        .or("referral_code.eq." + (user.id || ""))
        .order("created_at", { ascending: false });
      return res.json({ success: true, downlines: fallback || [] });
    }

    return res.json({ success: true, downlines: downlines || [] });
  } catch (err) {
    return res.json({ success: true, downlines: [] });
  }
};
