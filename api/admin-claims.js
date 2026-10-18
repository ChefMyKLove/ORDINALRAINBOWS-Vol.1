// Admin: GET lists twonk claims (?status=pending|delivered), POST { origin } marks one delivered.
const supabase = require('./_db');
const { isAdmin } = require('../lib/session');

module.exports = async function (req, res) {
  try {
    if (!isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });

    if (req.method === 'GET') {
      const status = req.query && req.query.status;
      let q = supabase.from('twonk_claims').select('*').order('claimed_at', { ascending: true });
      if (status === 'pending' || status === 'delivered') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) {
        console.error('[admin-claims] list failed —', error.message);
        return res.status(500).json({ error: 'internal error' });
      }
      return res.json({ claims: data || [] });
    }

    if (req.method === 'POST') {
      const { origin } = req.body || {};
      if (typeof origin !== 'string' || !origin) return res.status(400).json({ error: 'origin required' });
      const { data, error } = await supabase
        .from('twonk_claims')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('origin', origin)
        .eq('status', 'pending')
        .select('origin');
      if (error) {
        console.error('[admin-claims] deliver failed —', error.message);
        return res.status(500).json({ error: 'internal error' });
      }
      if (!data || data.length === 0) return res.status(404).json({ error: 'no pending claim for that origin' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'GET or POST only' });
  } catch (err) {
    console.error('[admin-claims] error', err);
    return res.status(500).json({ error: 'internal error' });
  }
};
