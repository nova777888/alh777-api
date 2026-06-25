const crypto = require("crypto");

// In-memory tracking for brute-force protection
// NOTE: This works within a warm serverless container but resets on cold starts.
// For production with multiple instances, use Redis or a database.
const verificationStore = new Map();

// Clean up expired entries periodically
setInterval(function() {
  const now = Date.now();
  for (const [key, entry] of verificationStore) {
    if (now > entry.expiresAt) {
      verificationStore.delete(key);
    }
  }
}, 60000); // clean every minute

function getTokenKey(token) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  // Use the HMAC part as the key so it's unique per token+expiry combo
  return "verify:" + parts[1] + ":" + parts[0];
}

function initAttempts(token) {
  const key = getTokenKey(token);
  if (!key) return;
  if (!verificationStore.has(key)) {
    const parts = token.split(".");
    verificationStore.set(key, {
      attempts: 0,
      used: false,
      expiresAt: parseInt(parts[0], 10)
    });
  }
}

function incrementAttempts(token) {
  const key = getTokenKey(token);
  if (!key) return 0;
  const entry = verificationStore.get(key);
  if (!entry) return 0;
  entry.attempts++;
  return entry.attempts;
}

function markUsed(token) {
  const key = getTokenKey(token);
  if (!key) return;
  const entry = verificationStore.get(key);
  if (entry) entry.used = true;
}

function isUsed(token) {
  const key = getTokenKey(token);
  if (!key) return false;
  const entry = verificationStore.get(key);
  return entry ? entry.used : false;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { token, code } = req.body;
    if (!token || !code) {
      return res.status(400).json({ error: "Token and code are required" });
    }

    // Initialize tracking for this token
    initAttempts(token);

    // Check if token has already been used (replay prevention)
    if (isUsed(token)) {
      return res.status(400).json({ error: "This verification code has already been used" });
    }

    const parts = token.split(".");
    if (parts.length !== 2) {
      return res.status(400).json({ error: "Invalid token format" });
    }

    const expiry = parseInt(parts[0], 10);
    const storedHmac = parts[1];

    if (Date.now() > expiry) {
      return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
    }

    const secret = process.env.VERIFY_SECRET || "nova-verify-secret-2026";
    const payload = code + "|" + expiry;
    const expectedHmac = crypto.createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    if (expectedHmac !== storedHmac) {
      // Increment failed attempts
      const attempts = incrementAttempts(token);
      if (attempts >= 3) {
        markUsed(token); // Invalidate token after 3 failed attempts
        return res.status(400).json({ error: "Too many failed attempts. Please request a new verification code." });
      }
      return res.status(400).json({ error: "Invalid verification code" });
    }

    // Mark as used to prevent replay
    markUsed(token);

    return res.json({ success: true, message: "Code verified successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};