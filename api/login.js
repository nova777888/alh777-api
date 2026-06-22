const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ecikviwuxfieryrmfgdq.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3";

function generatePhoneEmails(rawPhone) {
  var emails = [];
  var digits = String(rawPhone || "").replace(/[^0-9]/g, "");
  if (!digits) return emails;
  
  // Collect all possible formats
  var formats = [];
  
  // Raw digits as-is
  formats.push(digits);
  
  // If it's 11 digits starting with 0 (Nigerian), also try without the leading 0
  if (digits.length === 11 && digits.startsWith("0")) {
    formats.push(digits.substring(1)); // 8012345678
  }
  
  // If it has 10 digits (no leading 0), also try with 0 prefix
  if (digits.length === 10) {
    formats.push("0" + digits); // 08012345678
  }

  // If it has 13 digits starting with 234 (already has country code), 
  // also try with + prefix (register.js uses "+" + digits)
  if (digits.length === 13 && digits.startsWith("234")) {
    formats.push("+" + digits); // +2348012345678
    // Also try Nigerian 0-prefix format
    var withoutCountry = digits.substring(3); // 8012345678
    formats.push("0" + withoutCountry); // 08012345678
  }
  
  // Try +234 prefix versions
  if (digits.length === 10) {
    formats.push("+234" + digits); // +2348012345678
    formats.push("234" + digits);  // 2348012345678
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    var withoutZero = digits.substring(1);
    formats.push("+234" + withoutZero);
    formats.push("234" + withoutZero);
  }
  
  // Deduplicate
  var seen = {};
  var unique = [];
  for (var i = 0; i < formats.length; i++) {
    if (!seen[formats[i]]) {
      seen[formats[i]] = true;
      unique.push(formats[i]);
    }
  }
  
  // Convert each to email format
  for (var j = 0; j < unique.length; j++) {
    if (!unique[j].includes("@")) {
      emails.push(unique[j] + "@nogin.nova.local");
    }
  }
  
  return emails;
}

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

    var emailsToTry = [];

    if (loginEmail) {
      // Direct email login
      emailsToTry.push(loginEmail.toLowerCase().trim());
    } else if (phoneOrAccount) {
      // First, try to find the user by phone in the users table
      // This handles old accounts that may have been registered with a different email format
      var rawPhoneDigits = String(phoneOrAccount || "").replace(/[^0-9]/g, "");
      if (rawPhoneDigits) {
        try {
          const lookupSb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
            global: { headers: { apikey: SUPABASE_ANON_KEY } }
          });
          var { data: phoneMatch } = await lookupSb
            .from("users")
            .select("email")
            .or("phone.eq." + phoneOrAccount + ",phone.eq.+" + rawPhoneDigits + ",phone.eq.0" + (rawPhoneDigits.length > 10 ? rawPhoneDigits.substring(rawPhoneDigits.length - 10) : rawPhoneDigits) + ",phone.eq." + rawPhoneDigits)
            .maybeSingle();
          if (phoneMatch && phoneMatch.email && phoneMatch.email.indexOf("@") > -1) {
            emailsToTry.push(phoneMatch.email);
          }
        } catch (e) {
          // users table lookup failed (RLS), fall through to format generation
        }
      }
      // Also try all possible email formats (for new registrations)
      var generatedEmails = generatePhoneEmails(phoneOrAccount);
      for (var g = 0; g < generatedEmails.length; g++) {
        if (emailsToTry.indexOf(generatedEmails[g]) === -1) {
          emailsToTry.push(generatedEmails[g]);
        }
      }
    } else {
      return res.status(400).json({ error: "Phone number or email required" });
    }

    if (emailsToTry.length === 0) {
      return res.status(400).json({ error: "Could not determine login credentials" });
    }

    // Try each email format
    var sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    var lastError = null;
    var successfulResult = null;
    var successfulEmail = null;

    for (var i = 0; i < emailsToTry.length; i++) {
      var emailAttempt = emailsToTry[i];
      var result = await sb.auth.signInWithPassword({
        email: emailAttempt,
        password
      });
      
      if (!result.error && result.data && result.data.user) {
        successfulResult = result;
        successfulEmail = emailAttempt;
        break;
      }
      
      lastError = result.error;
    }

    if (!successfulResult) {
      return res.status(401).json({ error: "Invalid phone number or password" });
    }

    var data = successfulResult;

    // Try to get user profile from the users table
    var profile = null;
    try {
      const { data: profileById } = await sb
        .from("users")
        .select("*")
        .eq("id", data.data.user.id)
        .maybeSingle();
      
      if (profileById) {
        profile = profileById;
      } else {
        // Try by email - try the auth email and other variations
        const { data: profileByEmail } = await sb
          .from("users")
          .select("*")
          .eq("email", successfulEmail)
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
      token: (data.data && data.data.session ? data.data.session.access_token : "") || "",
      user: profile || { 
        id: data.data.user.id, 
        email: successfulEmail,
        name: (phoneOrAccount || loginEmail || ""),
        phone: phoneOrAccount || "",
        referral_code: data.data.user.id ? data.data.user.id.substring(0, 6).toUpperCase() : ""
      }
    });
    
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
