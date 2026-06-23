const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ecikviwuxfieryrmfgdq.supabase.co';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nova888';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const pw = req.query.pw || '';
    if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

    const table = req.query.table || '';
    if (!table) return res.status(400).json({ error: 'table param required' });

    const select = req.query.select || '*';
    const limit = parseInt(req.query.limit) || 5000;
    const order = req.query.order || '';
    const eqParam = req.query.eq || '';

    const srk = process.env.SUPABASE_SERVICE_ROLE_KE || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

    let sb;
    if (srk) {
      sb = createClient(SUPABASE_URL, srk, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { apikey: srk } }
      });
    } else {
      sb = createClient(SUPABASE_URL, ANON_KEY);
    }

    let query = sb.from(table).select(select);

    if (eqParam) {
      const parts = eqParam.split(':');
      if (parts.length === 2) {
        query = query.eq(parts[0], parts[1]);
      }
    }

    if (order) {
      const parts = order.split(':');
      if (parts.length >= 1) {
        query = query.order(parts[0], { ascending: parts[1] !== 'desc' });
      }
    }

    query = query.limit(limit);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ success: true, data: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
