const { Resend } = require("resend");
const crypto = require("crypto");

function generateCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function createToken(email, code, type) {
  const expiry = Date.now() + 10 * 60 * 1000;
  const secret = process.env.VERIFY_SECRET || "nova-verify-secret-2026";
  const payload = code + "|" + expiry;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return expiry + "." + hmac;
}

const templates = {
  "register": {
    subject: "Nova Exchange -Email Verification .",
    html: (code) => `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px">
      <h2 style="color:#0a7b7b;margin-bottom:16px">Nova Exchange</h2>
      <p style="color:#0a1c2f;font-size:15px;line-height:1.6">Thank you for registering! Use the code below to verify your email:</p>
      <div style="background:white;border-radius:10px;padding:20px;text-align:center;margin:16px 0;font-size:36px;font-weight:700;color:#0a7b7b;letter-spacing:8px">${code}</div>
      <p style="color:#4a6a78;font-size:13px">This code expires in 5 minutes.</p>
      <hr style="border:none;border-top:1px solid #eef2f4;margin:16px 0">
      <p style="color:#8a9ba8;font-size:11px;text-align:center">Nova Exchange - Premium Gift Card Trading</p>
    </div>`
  },
  "forgot-password": {
    subject: "Nova Exchange -Password Reset .",
    html: (code) => `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px">
      <h2 style="color:#0a7b7b;margin-bottom:16px">Nova Exchange</h2>
      <p style="color:#0a1c2f;font-size:15px;line-height:1.6">We received a request to reset your password. Use the code below:</p>
      <div style="background:white;border-radius:10px;padding:20px;text-align:center;margin:16px 0;font-size:36px;font-weight:700;color:#d32f2f;letter-spacing:8px">${code}</div>
      <p style="color:#4a6a78;font-size:13px">This code expires in 5 minutes.</p>
      <hr style="border:none;border-top:1px solid #eef2f4;margin:16px 0">
      <p style="color:#8a9ba8;font-size:11px;text-align:center">Nova Exchange - Premium Gift Card Trading</p>
    </div>`
  },
  "bind-email": {
    subject: "Nova Exchange -Bind Email Verification .",
    html: (code) => `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px">
      <h2 style="color:#0a7b7b;margin-bottom:16px">Nova Exchange</h2>
      <p style="color:#0a1c2f;font-size:15px;line-height:1.6">Use the code below to bind this email to your account:</p>
      <div style="background:white;border-radius:10px;padding:20px;text-align:center;margin:16px 0;font-size:36px;font-weight:700;color:#0a7b7b;letter-spacing:8px">${code}</div>
      <p style="color:#4a6a78;font-size:13px">This code expires in 5 minutes.</p>
      <hr style="border:none;border-top:1px solid #eef2f4;margin:16px 0">
      <p style="color:#8a9ba8;font-size:11px;text-align:center">Nova Exchange - Premium Gift Card Trading</p>
    </div>`
  }
};

function getTemplate(type) {
  return templates[type] || templates.register;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { email, type } = req.body;
    if (!email || !type) return res.status(400).json({ error: "Email and type required" });

    const normalizedType = type === "forgot" ? "forgot-password" : type;
    if (!["register", "forgot-password", "bind-email"].includes(normalizedType)) {
      return res.status(400).json({ error: "Invalid type" });
    }

    const code = generateCode();
    const token = createToken(email, code, normalizedType);

    const tpl = getTemplate(normalizedType);
    const apiKey = process.env.RESEND_API_KEY || "re_WyPbtuAk_3qyPp5kVc7zbEVdaAzPNbMF9";

    let fromEmail = process.env.RESEND_FROM_EMAIL || "Nova Exchange <noreply@mail.alh777.com>";

    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: tpl.subject,
      html: tpl.html(code)
    });
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ success: true, message: "Verification code sent to " + email, token: token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};