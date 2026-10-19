// Body: { handle, origins }. Stores a 10-minute single-use nonce and returns, per origin, the exact message
// that piece's key must sign. checker-claim rebuilds the same messages itself and never trusts client text.
const crypto = require('crypto');
const supabase = require('./_db');
const { manifest, claimMessage, normalizeHandle, rateLimited } = require('../lib/checker');

const NONCE_TTL_MS = 10 * 60 * 1000;

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    if (rateLimited(req, 'challenge', 20)) return res.status(429).json({ error: 'too many requests, wait a minute' });

    const { handle, origins } = req.body || {};
    const twetchHandle = normalizeHandle(handle);
    if (!twetchHandle) return res.status(400).json({ error: 'handle must be 1-32 letters, numbers, _ . or -' });
    if (!Array.isArray(origins) || origins.length === 0 || origins.length > 64) {
      return res.status(400).json({ error: 'pick between 1 and 64 pieces' });
    }
    const claimable = origins.filter(o => manifest.some(p => p.claimable && p.origin === o));
    if (claimable.length !== origins.length) return res.status(400).json({ error: 'unknown or unclaimable piece' });

    const nonce = crypto.randomBytes(16).toString('hex');
    const { error } = await supabase
      .from('checker_nonces')
      .insert([{ nonce, expires_at: new Date(Date.now() + NONCE_TTL_MS).toISOString() }]);
    if (error) {
      console.error('[checker-challenge] insert failed —', error.message);
      return res.status(500).json({ error: 'internal error' });
    }
    const messages = Object.fromEntries(claimable.map(o => [o, claimMessage(o, twetchHandle, nonce)]));
    return res.json({ nonce, handle: twetchHandle, messages });
  } catch (err) {
    console.error('[checker-challenge] error', err);
    return res.status(500).json({ error: 'internal error' });
  }
};
