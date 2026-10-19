// GET: claim status per claimable origin ('unclaimed' | 'pending' | 'delivered'). No addresses, no handles.
const supabase = require('./_db');
const { manifest } = require('../lib/checker');

module.exports = async function (req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
    const { data, error } = await supabase.from('twonk_claims').select('origin,status');
    if (error) {
      console.error('[checker-status] lookup failed —', error.message);
      return res.status(500).json({ error: 'internal error' });
    }
    const claimed = Object.fromEntries((data || []).map(c => [c.origin, c.status]));
    const status = Object.fromEntries(manifest.filter(p => p.claimable).map(p => [p.origin, claimed[p.origin] || 'unclaimed']));
    res.setHeader('Cache-Control', 'no-store');
    return res.json(status);
  } catch (err) {
    console.error('[checker-status] error', err);
    return res.status(500).json({ error: 'internal error' });
  }
};
