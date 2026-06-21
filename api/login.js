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
    // Accept both "phone" (new) and "account" (legacy) field names
    const phoneOrAccount = req.body.phone || req.body.account;
    const password = req.body.password;
    
    if (!phoneOrAccount || !password) return res.status(400).json({ error: "Phone and password required" });

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Look up user by phone in the users table
    const { data: profile, error: profileError } = await sb
      .from("users")
      .select("*")
      .eq("phone", phoneOrAccount)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({ error: "Invalid phone number or password" });
    }

    // Use the email from the users table to sign in via Supabase Auth
    if (!profile.email) {
      return res.status(401).json({ error: "No email linked to this account" });
    }

    const { data, error } = await sb.auth.signInWithPassword({
      email: profile.email.toLowerCase(),
      password
    });

    if (error) {
      return res.status(401).json({ error: "Invalid phone number or password" });
    }

    if (!data.user) {
      return res.status(401).json({ error: "Login failed" });
    }

    // Check if email is confirmed
    if (!data.user.email_confirmed_at) {
      return res.json({
        success: true,
        token: data.session?.access_token || "",
        user: {
          id: data.user.id,
          email: profile.email,
          needs_email_confirmation: true
        },
        message: "Please check your email to confirm your account, then login again."
      });
    }

    return res.json({
      success: true,
      token: data.session?.access_token || "",
      user: profile || { id: data.user.id, email: profile.email }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};