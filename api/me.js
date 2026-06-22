const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3";
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || "96ad19dd1d302c46aceea0edf9759655090b762f947f81a6107382e9681784a0", "hex");

function decryptPhone(encrypted) {
  try {
    if (!encrypted || !encrypted.includes(":")) return null;
    var parts = encrypted.split(":");
    var iv = Buffer.from(parts[0], "hex");
    var decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    return decipher.update(parts[1], "hex", "utf8") + decipher.final("utf8");
  } catch(e) { return null; }
}

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

    // Get profile from customers table
    const { data: profile } = await sb
      .from("customers")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    // Get balance from customer_balances
    const { data: balance } = await sb
      .from("customer_balances")
      .select("*")
      .eq("customer_id", user.id)
      .maybeSingle();

    // Get downline count
    const { count: downlineCount } = await sb
      .from("customers")
      .select("id", { count: "exact" })
      .eq("parent_id", user.id);

    if (profile) {
      var result = {
        id: profile.id,
        name: profile.name || "",
        email: profile.email && profile.email.indexOf("@nogin.nova.local") === -1 ? profile.email : "",
        phone: profile.phone_encrypted ? (decryptPhone(profile.phone_encrypted) || "N/A") : "N/A",
        phone_masked: profile.phone_encrypted ? (decryptPhone(profile.phone_encrypted) || "N/A") : "N/A",
        referral_code: profile.public_id || "",
        referred_by: profile.parent_id || null,
        downline_count: downlineCount || 0,
        created_at: profile.created_at || "",
        role: profile.role || "customer",
        balance: {
          available_balance: balance ? balance.available_balance : 0,
          total_earned: balance ? balance.total_earned : 0,
          total_withdrawn: balance ? balance.total_withdrawn : 0
        }
      };
      return res.json({ success: true, user: result });
    }

    // No profile found - return fallback from Auth metadata
    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email || "",
        name: (user.user_metadata && user.user_metadata.name) || "",
        phone: "N/A",
        phone_masked: "N/A",
        referral_code: user.id.substring(0, 6).toUpperCase(),
        referred_by: null,
        downline_count: 0,
        created_at: user.created_at || "",
        role: "customer",
        balance: { available_balance: 0, total_earned: 0, total_withdrawn: 0 }
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
