
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
// Try both common env var names for service role key
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KE || "";

function verifyCodeToken(token, code) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const expiry = parseInt(parts[0], 10);
    if (Date.now() > expiry) return false;
    const secret = process.env.VERIFY_SECRET || "nova-verify-secret-2026";
    const payload = code + "|" + expiry;
    const expectedHmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return expectedHmac === parts[1];
  } catch(e) { return false; }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const authHeader = req.headers.authorization || "";
    const authToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!authToken) return res.status(401).json({ error: "Unauthorized" });

    const { email, code: verifyCode, verifyToken } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    if (!verifyCode) return res.status(400).json({ error: "Verification code required" });
    if (!verifyToken) return res.status(400).json({ error: "Verification token required" });

    // Verify the verification code
    if (!verifyCodeToken(verifyToken, verifyCode)) {
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }

    // Create admin client with service role key for auth operations
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user } } = await sbAdmin.auth.getUser(authToken);
    if (!user) return res.status(401).json({ error: "Invalid token" });

    // Update email in Supabase Auth
    const { error: updateErr } = await sbAdmin.auth.admin.updateUserById(
      user.id, { email: email.toLowerCase().trim() }
    );

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Update email in users table
    const { error: profileErr } = await sbAdmin
      .from("users")
      .update({ email: email.toLowerCase().trim() })
      .eq("id", user.id);

    if (profileErr) {
      return res.status(500).json({ error: "Failed to save email to profile: " + profileErr.message });
    }

    // Verify by reading back
    const { data: verifyProfile } = await sbAdmin
      .from("users")
      .select("email")
      .eq("id", user.id)
      .single();

    if (!verifyProfile || verifyProfile.email !== email.toLowerCase().trim()) {
      return res.status(500).json({ error: "Email update verification failed" });
    }

    return res.json({ success: true, message: "Email bound successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

