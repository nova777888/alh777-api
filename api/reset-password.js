const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) return res.status(400).json({ error: "Old and new password required" });
    if (new_password.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters" });

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // First, sign in with old password to verify it's correct
    const { data: signInData, error: signInError } = await sb.auth.signInWithPassword({
      email: req.headers["x-supabase-email"] || "",
      password: old_password
    });

    // Actually, the frontend doesn't send email in header. Let's use the token-based approach.
    // Get the user from the Bearer token, then update their password.
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const sb2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: userErr } = await sb2.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: "Invalid token" });

    // Verify old password by trying to sign in
    const sbCheck = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: checkData, error: checkError } = await sbCheck.auth.signInWithPassword({
      email: user.email,
      password: old_password
    });
    if (checkError) {
      return res.status(401).json({ error: "Old password is incorrect" });
    }

    // Update password using the session from verification
    const { error: updateError } = await sbCheck.auth.updateUser({
      password: new_password
    });

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Sign in with new credentials
    const { data: newData, error: newError } = await sbCheck.auth.signInWithPassword({
      email: user.email,
      password: new_password
    });

    return res.json({
      success: true,
      message: "Password changed successfully",
      token: newData.session?.access_token || "",
      user: newData.user
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};