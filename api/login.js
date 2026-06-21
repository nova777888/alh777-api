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
    const phoneOrAccount = req.body.phone || req.body.account;
    const loginEmail = req.body.email;
    const password = req.body.password;
    
    if (!password) return res.status(400).json({ error: "Password required" });

    var userEmail = null;
    var lookupPhone = (phoneOrAccount || "").replace(/[\s\-\(\)]/g, "");

    // Determine which email to use for Supabase Auth sign-in
    if (loginEmail) {
      // Direct email login
      userEmail = loginEmail.toLowerCase().trim();
    } else if (lookupPhone) {
      // Phone login - use the same generated email format as register.js
      userEmail = lookupPhone + "@nogin.nova.local";
    } else {
      return res.status(400).json({ error: "Phone number or email required" });
    }

    // Try to sign in with Supabase Auth
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data, error } = await sb.auth.signInWithPassword({
      email: userEmail,
      password
    });

    if (error) {
      return res.status(401).json({ error: "Invalid phone number or password" });
    }

    if (!data || !data.user) {
      return res.status(401).json({ error: "Login failed" });
    }

    // Try to get user profile from the users table
    var profile = null;
    try {
      // Try by user ID first
      const { data: profileById } = await sb
        .from("users")
        .select("*")
        .eq("id", data.user.id)
        .maybeSingle();
      
      if (profileById) {
        profile = profileById;
      } else {
        // Try by email
        const { data: profileByEmail } = await sb
          .from("users")
          .select("*")
          .eq("email", userEmail)
          .maybeSingle();
        profile = profileByEmail;
      }
    } catch (e) {
      // Profile query failed (RLS), use minimal profile
    }

    if (profile) {
      if (profile.phone) {
        var p = String(profile.phone);
        profile.phone_masked = "********" + p.slice(-4);
      }
    }

    return res.json({
      success: true,
      token: data.session?.access_token || "",
      user: profile || { 
        id: data.user.id, 
        email: userEmail,
        name: (phoneOrAccount || loginEmail || ""),
        phone: phoneOrAccount || "",
        referral_code: data.user.id ? data.user.id.substring(0, 6).toUpperCase() : ""
      }
    });
    
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};