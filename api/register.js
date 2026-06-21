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
    const { name, phone, email, password, referral_code } = req.body;
    
    if (!password) return res.status(400).json({ error: "Password required" });
    if (!name) return res.status(400).json({ error: "Name required" });
    if (!phone) return res.status(400).json({ error: "Phone number required" });

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          apikey: SUPABASE_ANON_KEY
        }
      }
    });

    const emailLower = email ? email.toLowerCase() : null;

    // If referral_code is provided, look up the referrer's user ID
    var referredById = null;
    if (referral_code) {
      const { data: referrer } = await sb
        .from("users")
        .select("id, referral_code")
        .eq("referral_code", referral_code)
        .single();
      if (referrer && referrer.id) {
        referredById = referrer.id;
      }
    }

    // If email is provided, sign up via Supabase Auth
    if (emailLower) {
      const { data: signUpData, error: signUpError } = await sb.auth.signUp({
        email: emailLower,
        password,
        options: {
          data: {
            name: name || "",
            phone: phone || "",
            referral_code: referral_code || ""
          }
        }
      });

      if (signUpError) {
        // ... existing error handling ...
        if (signUpError.message.toLowerCase().includes("rate limit") || signUpError.message.toLowerCase().includes("too many")) {
          return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
        }
        
        if (signUpError.message.toLowerCase().includes("already") || signUpError.code === "user_already_exists") {
          const { data: signInData, error: signInError } = await sb.auth.signInWithPassword({
            email: emailLower,
            password
          });
          if (signInError) {
            return res.status(401).json({ error: "Invalid password" });
          }
          const { data: profile } = await sb.from("users").select("*").eq("email", emailLower).single();
          return res.json({
            success: true,
            token: signInData.session?.access_token || "",
            user: profile || { id: signInData.user.id, email: emailLower, name, phone }
          });
        }
        
        return res.status(500).json({ error: signUpError.message });
      }

      if (!signUpData.user) return res.status(500).json({ error: "Signup failed" });

      const referral = referral_code || ("REF" + Math.random().toString(36).substring(2, 8).toUpperCase());
      
      const userRecord = {
        id: signUpData.user.id,
        name: name || "",
        phone: phone || "",
        email: emailLower,
        referral_code: referral,
        balance: 0,
        created_at: new Date().toISOString()
      };
      if (referredById) { try { userRecord.referred_by = referredById; } catch(e) {} }

      const { error: profileError } = await sb
        .from("users")
        .upsert([userRecord], { onConflict: "id" });
      if (profileError && profileError.message && profileError.message.indexOf("referred_by") > -1) {
        delete userRecord.referred_by;
        const { error: retryErr } = await sb.from("users").upsert([userRecord], { onConflict: "id" });
        if (retryErr && retryErr.code !== "23505") console.warn("Profile upsert retry warning:", retryErr.message);
      }

      if (profileError && profileError.code !== "23505") {
        console.warn("Profile upsert warning:", profileError.message);
      }

      const { data: signInData, error: signInError } = await sb.auth.signInWithPassword({
        email: emailLower,
        password
      });

      if (signInError) {
        return res.json({
          success: true,
          token: "",
          user: {
            id: signUpData.user.id,
            name: name,
            email: emailLower,
            phone: phone || "",
            referral_code: referral,
            needs_email_confirmation: true
          },
          message: "Registration successful. Please check your email to confirm your account, then login."
        });
      }

      const { data: profile } = await sb.from("users").select("*").eq("email", emailLower).single();
      return res.json({
        success: true,
        token: signInData.session?.access_token || "",
        user: profile || { id: signInData.user.id, name, email: emailLower, phone }
      });
    } else {
      // No email provided
      var normPhone = String(phone || "").replace(/[^0-9]/g, "");
    if (normPhone.length === 11 && normPhone.startsWith("0")) {
      normPhone = "+234" + normPhone.substring(1);
    } else if (normPhone.length === 10) {
      normPhone = "+234" + normPhone;
    } else if (normPhone.length === 13 && normPhone.startsWith("234")) {
      normPhone = "+" + normPhone;
    } else if (normPhone.length < 10) {
      normPhone = phone;
    } else if (!normPhone.startsWith("+")) {
      normPhone = "+" + normPhone;
    }
    const genEmail = normPhone + "@nogin.nova.local";
      const referral = referral_code || ("REF" + Math.random().toString(36).substring(2, 8).toUpperCase());

      const { data: signUpData, error: signUpError } = await sb.auth.signUp({
        email: genEmail,
        password,
        options: {
          data: {
            name: name || "",
            phone: phone || "",
            referral_code: referral
          }
        }
      });

      if (signUpError) {
        if (signUpError.message.toLowerCase().includes("rate limit") || signUpError.message.toLowerCase().includes("too many")) {
          return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
        }
        return res.status(500).json({ error: signUpError.message });
      }

      if (!signUpData.user) return res.status(500).json({ error: "Signup failed" });

      const userRecord = {
        id: signUpData.user.id,
        name: name || "",
        phone: phone || "",
        email: genEmail,
        referral_code: referral,
        balance: 0,
        created_at: new Date().toISOString()
      };
      if (referredById) { try { userRecord.referred_by = referredById; } catch(e) {} }

      const { error: profileError } = await sb
        .from("users")
        .upsert([userRecord], { onConflict: "id" });
      if (profileError && profileError.message && profileError.message.indexOf("referred_by") > -1) {
        delete userRecord.referred_by;
        const { error: retryErr } = await sb.from("users").upsert([userRecord], { onConflict: "id" });
        if (retryErr && retryErr.code !== "23505") console.warn("Profile upsert retry warning:", retryErr.message);
      }

      if (profileError && profileError.code !== "23505") {
        console.warn("Profile upsert warning:", profileError.message);
      }

      const { data: signInData, error: signInError } = await sb.auth.signInWithPassword({
        email: genEmail,
        password
      });

      if (signInError) {
        return res.status(500).json({ error: "Login after signup failed" });
      }

      const { data: profile } = await sb.from("users").select("*").eq("phone", phone).single();
      return res.json({
        success: true,
        token: signInData.session?.access_token || "",
        user: profile || { id: signInData.user.id, name, phone, referral_code: referral }
      });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

