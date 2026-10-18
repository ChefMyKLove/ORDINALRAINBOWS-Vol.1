const crypto = require('crypto');
const supabase = require('./_db');
const { buildMessage, rateLimited } = require('../lib/checker');

const NONCE_TTL_MS = 10 * 60 * 1000;

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    if (rateLimited(req, 'challenge', 20)) return res.status(429).json({ error: 'too many requests, wait a minute' });

    const nonce = crypto.randomBytes(16).toString('hex');
    const { error } = await supabase
      .from('checker_nonces')
      .insert([{ nonce, expires_at: new Date(Date.now() + NONCE_TTL_MS).toISOString() }]);
    if (error) {
      console.error('[checker-challenge] insert failed —', error.message);
      return res.status(500).json({ error: 'internal error' });
    }
    return res.json({ nonce, message: buildMessage(nonce) });
  } catch (err) {
    console.error('[checker-challenge] error', err);
    return res.status(500).json({ error: 'internal error' });
  }
};
