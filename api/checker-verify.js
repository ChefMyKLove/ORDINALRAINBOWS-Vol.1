// Body: { nonce, proofs: [{ origin, pubKey, sig }] } — one proof per piece the wallet says it holds,
// signed with the key that locks that piece. A piece counts as held only if its current on-chain
// owner is the address of the key that signed.
const supabase = require('./_db');
const { manifest, buildMessage, proofAddress, lookupOwner, mapLimited, rateLimited } = require('../lib/checker');
const { createSessionCookie } = require('../lib/session');

const MAX_PROOFS = 64;

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    if (rateLimited(req, 'verify', 10)) return res.status(429).json({ error: 'too many requests, wait a minute' });

    const { nonce, proofs } = req.body || {};
    if (typeof nonce !== 'string' || !/^[0-9a-f]{32}$/.test(nonce) || !Array.isArray(proofs) || proofs.length > MAX_PROOFS) {
      return res.status(400).json({ error: 'nonce and up to 64 proofs required' });
    }

    // Consume the nonce atomically: one UPDATE that only matches an unused, unexpired row.
    const { data: consumed, error: nonceErr } = await supabase
      .from('checker_nonces')
      .update({ used: true })
      .eq('nonce', nonce)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .select('nonce');
    if (nonceErr) {
      console.error('[checker-verify] nonce update failed —', nonceErr.message);
      return res.status(500).json({ error: 'internal error' });
    }
    if (!consumed || consumed.length === 0) {
      return res.status(401).json({ error: 'challenge expired or already used, start again' });
    }

    const message = buildMessage(nonce);
    const seen = new Set();
    const checks = [];
    for (const p of proofs) {
      const piece = p && manifest.find(m => m.origin && m.origin === p.origin);
      if (!piece || seen.has(piece.origin)) continue;
      seen.add(piece.origin);
      const address = proofAddress(message, p.pubKey, p.sig);
      if (!address) return res.status(401).json({ error: `signature for piece #${piece.piece} is invalid` });
      checks.push({ piece, address });
    }

    const results = await mapLimited(checks, async c => {
      const o = await lookupOwner(c.piece.origin);
      return { ...c, state: o.status === 'unknown' ? 'unknown' : o.owner === c.address ? 'held' : 'not_held' };
    });
    const held = results.filter(r => r.state === 'held');
    const unknown = results.filter(r => r.state === 'unknown');

    let statusByOrigin = {};
    if (held.length) {
      const { data: claims, error: claimErr } = await supabase
        .from('twonk_claims')
        .select('origin,status')
        .in('origin', held.map(r => r.piece.origin));
      if (claimErr) {
        console.error('[checker-verify] claims lookup failed —', claimErr.message);
        return res.status(500).json({ error: 'internal error' });
      }
      statusByOrigin = Object.fromEntries((claims || []).map(c => [c.origin, c.status]));
    }

    res.setHeader('Set-Cookie', createSessionCookie(held.map(r => r.address)));
    return res.json({
      counts: { held: held.length, not_held: results.length - held.length - unknown.length, unknown: unknown.length },
      pieces: held.map(r => ({ ...r.piece, claim: statusByOrigin[r.piece.origin] || 'unclaimed' })),
      unknown: unknown.map(r => r.piece.piece),
    });
  } catch (err) {
    console.error('[checker-verify] error', err);
    return res.status(500).json({ error: 'internal error' });
  }
};
