const { createClient } = require("@supabase/supabase-js");

const crypto = require("crypto");



const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3";

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



    if (!verifyCodeToken(verifyToken, verifyCode)) {

      return res.status(400).json({ error: "Invalid or expired verification code" });

    }



    var normalizedEmail = email.toLowerCase().trim();



    // Verify auth token via Supabase Auth REST API

    const authRes = await fetch(SUPABASE_URL + "/auth/v1/user", {

      headers: {

        "apikey": SUPABASE_ANON_KEY,

        "Authorization": "Bearer " + authToken

      }

    });

    const authData = await authRes.json();

    if (!authData || !authData.id) return res.status(401).json({ error: "Invalid token" });

    var userId = authData.id;



        // Check if email already belongs to another user (using service_role to bypass RLS)
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: dupData } = await sbAdmin
      .from("customers")
      .select("id")
      .neq("id", userId)
      .eq("email", normalizedEmail)
      .maybeSingle();



    if (dupData && dupData.id) {

      return res.status(409).json({ error: "This email is already bound to another account" });

    }



    // Step 1: Update email in customers table via service_role client (bypass RLS)
    const { error: patchErr } = await sbAdmin
      .from("customers")
      .update({ email: normalizedEmail })
      .eq("id", userId);

    if (patchErr) {
      return res.status(500).json({ error: "Failed to save email: " + patchErr.message });
    }

  // Step 2: Try to update email in Supabase Auth (non-critical, needs service role key)

    if (SUPABASE_SERVICE_ROLE_KEY) {

      try {

        const authUpdateUrl = SUPABASE_URL + "/auth/v1/admin/users/" + userId;

        const authUpdateRes = await fetch(authUpdateUrl, {

          method: "PUT",

          headers: {

            "apikey": SUPABASE_SERVICE_ROLE_KEY,

            "Authorization": "Bearer " + SUPABASE_SERVICE_ROLE_KEY,

            "Content-Type": "application/json"

          },

          body: JSON.stringify({ email: normalizedEmail })

        });



        if (!authUpdateRes.ok) {

          var authErrBody = await authUpdateRes.text();

          if (authErrBody.indexOf("already") > -1 || authErrBody.indexOf("registered") > -1) {

            return res.json({ success: true, message: "Email bound successfully" });

          }

          console.warn("bind-email: Auth email update warning:", authErrBody);

        }

      } catch(e) {

        console.warn("bind-email: Auth update error:", e.message);

      }

    }



    return res.json({ success: true, message: "Email bound successfully" });

  } catch (err) {

    return res.status(500).json({ error: err.message });

  }

};

