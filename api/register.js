const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3";
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || "96ad19dd1d302c46aceea0edf9759655090b762f947f81a6107382e9681784a0", "hex");

function encryptPhone(phone) {
  var iv = crypto.randomBytes(16);
  var cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  var encrypted = cipher.update(phone, "utf8", "hex") + cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function hashPhone(phone) {
  return crypto.createHash("sha256").update(phone).digest("hex");
}

function normalizePhone(raw) {
  var digits = String(raw || "").replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("0")) return "+234" + digits.substring(1);
  if (digits.length === 10) return "+234" + digits;
  if (digits.length === 13 && digits.startsWith("234")) return "+" + digits;
  if (!digits.startsWith("+")) return "+" + digits;
  return digits;
}

async function generatePublicId(sb) {
  for (var attempt = 0; attempt < 20; attempt++) {
    var digits = "";
    for (var i = 0; i < 5; i++) digits += Math.floor(Math.random() * 10).toString();
    var id = "VIP" + digits;
    var { data: existing } = await sb.from("customers").select("id").eq("public_id", id).maybeSingle();
    if (!existing) return id;
  }
  return "VIP" + Date.now().toString(36).toUpperCase().substring(0, 4);
}

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
      global: { headers: { apikey: SUPABASE_ANON_KEY } }
    });

    var normPhone = normalizePhone(phone);
    var phoneHash = hashPhone(normPhone);
    var phoneEncrypted = encryptPhone(normPhone);
    const emailLower = email ? email.toLowerCase() : null;

    // Check duplicate phone
    var { data: existingByPhone } = await sb.from("customers").select("id").eq("phone_hash", phoneHash).maybeSingle();
    if (existingByPhone) {
      return res.status(409).json({ error: "This phone number is already registered" });
    }

    // Look up referrer
    var parentId = null;
    if (referral_code) {
      var { data: referrer } = await sb.from("customers").select("id").eq("public_id", referral_code).maybeSingle();
      if (referrer && referrer.id) parentId = referrer.id;
    }

    var publicId = await generatePublicId(sb);

    if (emailLower) {
      var { data: signUpData, error: signUpError } = await sb.auth.signUp({
        email: emailLower,
        password,
        options: { data: { name, phone: normPhone } }
      });

      if (signUpError) {
        if (signUpError.message.toLowerCase().includes("rate limit")) {
          return res.status(429).json({ error: "Too many requests. Please wait." });
        }
        if (signUpError.message.toLowerCase().includes("already") || signUpError.code === "user_already_exists") {
          return res.status(409).json({ error: "This email is already registered. Please login." });
        }
        return res.status(500).json({ error: signUpError.message });
      }

      if (!signUpData.user) return res.status(500).json({ error: "Signup failed" });

      var customerRecord = {
        id: signUpData.user.id,
        name: name,
        phone_encrypted: phoneEncrypted,
        phone_hash: phoneHash,
        email: emailLower,
        public_id: publicId,
        role: "customer",
        is_active: true,
        referrer_locked: false,
        created_at: new Date().toISOString()
      };
      if (parentId) customerRecord.parent_id = parentId;

      try { await sb.from("customers").insert(customerRecord); } catch(e) { console.warn("customer insert:", e.message); }
      await sb.from("customer_balances").insert({
        customer_id: signUpData.user.id,
        available_balance: 0,
        total_earned: 0,
        total_withdrawn: 0
      });

      var { data: signInData } = await sb.auth.signInWithPassword({ email: emailLower, password });
      if (!signInData || !signInData.session) {
        return res.json({
          success: true, token: "",
          user: { id: signUpData.user.id, name, email: emailLower, phone: normPhone, referral_code: publicId, needs_email_confirmation: true },
          message: "Please check your email to confirm your account, then login."
        });
      }

      return res.json({
        success: true,
        token: signInData.session.access_token,
        user: { id: signUpData.user.id, name, email: emailLower, phone: normPhone, referral_code: publicId }
      });
    } else {
      var genEmail = normPhone + "@nogin.nova.local";
      var { data: signUpData, error: signUpError } = await sb.auth.signUp({
        email: genEmail, password,
        options: { data: { name, phone: normPhone } }
      });

      if (signUpError) {
        if (signUpError.message.toLowerCase().includes("rate limit")) return res.status(429).json({ error: "Too many requests." });
        return res.status(500).json({ error: signUpError.message });
      }
      if (!signUpData.user) return res.status(500).json({ error: "Signup failed" });

      var customerRecord = {
        id: signUpData.user.id,
        name: name,
        phone_encrypted: phoneEncrypted,
        phone_hash: phoneHash,
        email: genEmail,
        public_id: publicId,
        role: "customer",
        is_active: true,
        referrer_locked: false,
        created_at: new Date().toISOString()
      };
      if (parentId) customerRecord.parent_id = parentId;

      try { await sb.from("customers").insert(customerRecord); } catch(e) { console.warn("customer insert:", e.message); }
      await sb.from("customer_balances").insert({
        customer_id: signUpData.user.id,
        available_balance: 0, total_earned: 0, total_withdrawn: 0
      });

      var { data: signInData, error: signInError } = await sb.auth.signInWithPassword({ email: genEmail, password });
      if (signInError) return res.status(500).json({ error: "Login after signup failed" });

      return res.json({
        success: true,
        token: signInData.session.access_token,
        user: { id: signUpData.user.id, name, phone: normPhone, referral_code: publicId }
      });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
