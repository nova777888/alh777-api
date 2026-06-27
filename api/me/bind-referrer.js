const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KE || process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: "Bearer " + token } }
    });

    const { data: { user }, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: "Invalid token" });

    const { referral_code } = req.body;
    if (!referral_code) return res.status(400).json({ error: "Referral code is required" });

    // Check if user already has a referrer
    const { data: profile } = await sb
      .from("customers")
      .select("id, parent_id, referrer_locked")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) return res.status(404).json({ error: "Profile not found" });

    if (profile.parent_id || profile.referrer_locked) {
      return res.status(400).json({ error: "Referrer already bound, cannot change" });
    }

    // Find the referrer by public_id
    const { data: referrer } = await sb
      .from("customers")
      .select("id, name, public_id")
      .eq("public_id", referral_code.toUpperCase())
      .maybeSingle();

    if (!referrer) return res.status(404).json({ error: "Referrer ID does not exist" });

    if (referrer.id === user.id) {
      return res.status(400).json({ error: "Cannot set yourself as referrer" });
    }

    // Bind referrer
    const { error: updateErr } = await sb
      .from("customers")
      .update({ parent_id: referrer.id, referrer_locked: true })
      .eq("id", user.id);

    if (updateErr) return res.status(500).json({ error: "Bind failed: " + updateErr.message });

    return res.json({
      success: true,
      message: "Referrer bound successfully",
      referrer: { id: referrer.id, name: referrer.name, public_id: referrer.public_id }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};