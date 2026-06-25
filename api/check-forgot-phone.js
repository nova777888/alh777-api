const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ecikviwuxfieryrmfgdq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_qZmFog48wGY8aMzEzl3P2Q_bFktF5X3';

function normalizePhone(raw) {
  var digits = String(raw || '').replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits.startsWith('0')) return '+234' + digits.substring(1);
  if (digits.length === 10) return '+234' + digits;
  if (digits.length === 13 && digits.startsWith('234')) return '+' + digits;
  if (!digits.startsWith('+')) return '+' + digits;
  return digits;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    var normPhone = normalizePhone(phone);
    var phoneHash = crypto.createHash('sha256').update(normPhone).digest('hex');

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { apikey: SUPABASE_ANON_KEY } }
    });

    var { data: customer } = await sb
      .from('customers')
      .select('id, email, phone_hash')
      .eq('phone_hash', phoneHash)
      .maybeSingle();

    if (!customer) {
      return res.json({ exists: false, message: 'This phone number is not registered' });
    }

    var email = customer.email || '';
    var hasEmail = email.length > 0 && email.indexOf('@nogin.nova.local') === -1;

    if (!hasEmail) {
      return res.json({
        exists: true,
        hasEmail: false,
        message: 'No email bound to this account. Please contact support.'
      });
    }

    // Mask email: show first 4 chars + @ + full domain
    var atIndex = email.indexOf('@');
    var maskedEmail = '';
    if (atIndex > 0) {
      var localPart = email.substring(0, Math.min(4, atIndex));
      var domain = email.substring(atIndex);
      maskedEmail = localPart + '****' + domain;
    } else {
      maskedEmail = email.substring(0, 4) + '****';
    }

    return res.json({
      exists: true,
      hasEmail: true,
      email: maskedEmail,
      message: 'Verified: ' + maskedEmail
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
