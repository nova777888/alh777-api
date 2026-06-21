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
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: "Invalid token" });

    // GET /api/me - return user profile
    const { data: profile, error: profileErr } = await sb
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileErr && profileErr.code !== "PGRST116") {
      const { data: profileByEmail } = await sb
        .from("users")
        .select("*")
        .eq("email", user.email)
        .single();
      return res.json({ success: true, user: profileByEmail || { id: user.id, email: user.email } });
    }

    return res.json({ success: true, user: profile });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};