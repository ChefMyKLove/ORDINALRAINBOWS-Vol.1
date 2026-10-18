const supabase = require('./_db');
const { manifest, normalizeHandle, lookupOwner } = require('../lib/checker');
const { readSession, addressHash } = require('../lib/session');

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const provenHashes = readSession(req);
    if (!provenHashes) return res.status(401).json({ error: 'session expired, connect and sign again' });

    const { origin, handle } = req.body || {};
    const piece = manifest.find(p => p.origin && p.origin === origin);
    if (!piece) return res.status(400).json({ error: 'unknown piece' });

    const twetchHandle = normalizeHandle(handle);
    if (!twetchHandle) return res.status(400).json({ error: 'handle must be 1-32 letters, numbers, _ . or -' });

    // Re-check holdership now: the current owner must be an address this session proved control of.
    const owner = await lookupOwner(origin);
    if (owner.status === 'unknown') return res.status(503).json({ error: 'could not confirm ownership right now, try again' });
    if (!owner.owner || !provenHashes.includes(addressHash(owner.owner))) {
      return res.status(403).json({ error: 'this wallet no longer holds that piece' });
    }
    const address = owner.owner;

    const { error } = await supabase
      .from('twonk_claims')
      .insert([{ origin, piece: piece.piece, address, twetch_handle: twetchHandle }]);
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'already claimed' });
      console.error('[checker-claim] insert failed —', error.message);
      return res.status(500).json({ error: 'internal error' });
    }
    return res.json({ success: true, status: 'pending' });
  } catch (err) {
    console.error('[checker-claim] error', err);
    return res.status(500).json({ error: 'internal error' });
  }
};
