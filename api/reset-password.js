
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KE || "";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const oldPwd = req.body.old_password || req.body.current_password;
    const newPwd = req.body.new_password || req.body.password;
    const phone = req.body.phone || "";
    const email = req.body.email || "";

    if (!newPwd || newPwd.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (token) {
      // Logged-in user changing password
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: "Bearer " + token } }
      });

      const { data: { user }, error: userErr } = await sb.auth.getUser(token);
      if (userErr || !user) return res.status(401).json({ error: "Invalid token" });

      var sbCheck = null;
      if (oldPwd) {
        sbCheck = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        const { error: checkError } = await sbCheck.auth.signInWithPassword({
          email: user.email,
          password: oldPwd
        });
        if (checkError) {
          return res.status(401).json({ error: "Old password is incorrect" });
        }
      }

      const { error: updateError } = await sb.auth.updateUser({ password: newPwd });
      if (updateError) return res.status(500).json({ error: updateError.message });

      return res.json({ success: true, message: "Password changed successfully" });
    } else if (phone) {
      // Forgot password flow
      if (!SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: "Server configuration error" });
      }

      // Normalize phone to find the auth email
      var normPhone = String(phone).replace(/[^0-9]/g, "");
      var possibleEmails = [];
      if (normPhone.length === 11 && normPhone.startsWith("0")) {
        possibleEmails.push(normPhone + "@nogin.nova.local");
        possibleEmails.push("+234" + normPhone.substring(1) + "@nogin.nova.local");
      } else if (normPhone.length === 10) {
        possibleEmails.push("+234" + normPhone + "@nogin.nova.local");
        possibleEmails.push("0" + normPhone + "@nogin.nova.local");
      } else if (normPhone.length === 13 && normPhone.startsWith("234")) {
        possibleEmails.push("+" + normPhone + "@nogin.nova.local");
        possibleEmails.push("0" + normPhone.substring(3) + "@nogin.nova.local");
      } else {
        possibleEmails.push(normPhone + "@nogin.nova.local");
      }
      possibleEmails.push(String(phone) + "@nogin.nova.local");

      const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // List all users to find by email
      const { data: userList, error: listErr } = await sbAdmin.auth.admin.listUsers();
      if (listErr) return res.status(500).json({ error: listErr.message });

      var targetUser = null;
      for (var i = 0; i < (userList?.users || []).length && !targetUser; i++) {
        var u = userList.users[i];
        if (u.email) {
          for (var j = 0; j < possibleEmails.length; j++) {
            if (u.email.toLowerCase() === possibleEmails[j].toLowerCase()) {
              targetUser = u;
              break;
            }
          }
        }
      }

      if (!targetUser) {
        return res.status(404).json({ error: "Could not find account with this phone number. Please contact support." });
      }

      const { error: updateErr } = await sbAdmin.auth.admin.updateUserById(
        targetUser.id, { password: newPwd }
      );

      if (updateErr) return res.status(500).json({ error: updateErr.message });

      return res.json({ success: true, message: "Password reset successfully" });
    } else {
      return res.status(400).json({ error: "Phone number required for password reset" });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

