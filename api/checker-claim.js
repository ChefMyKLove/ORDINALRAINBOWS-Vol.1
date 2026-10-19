// Body: { nonce, handle, claims: [{ origin, pubKey, sig }] }. Each sig covers claimMessage(origin, handle, nonce),
// rebuilt here, and must come from the key that owns the piece's current output. Because every signature binds
// piece, handle and nonce, no session is needed. Returns one result per origin.
const supabase = require('./_db');
const { manifest, claimMessage, normalizeHandle, proofAddress, lookupOwner, mapLimited, rateLimited } = require('../lib/checker');

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    if (rateLimited(req, 'claim', 10)) return res.status(429).json({ error: 'too many requests, wait a minute' });

    const { nonce, handle, claims } = req.body || {};
    if (typeof nonce !== 'string' || !/^[0-9a-f]{32}$/.test(nonce) || !Array.isArray(claims) || claims.length === 0 || claims.length > 64) {
      return res.status(400).json({ error: 'nonce and 1 to 64 claims required' });
    }
    const twetchHandle = normalizeHandle(handle);
    if (!twetchHandle) return res.status(400).json({ error: 'handle must be 1-32 letters, numbers, _ . or -' });

    // Consume the nonce atomically: one UPDATE that only matches an unused, unexpired row.
    const { data: consumed, error: nonceErr } = await supabase
      .from('checker_nonces')
      .update({ used: true })
      .eq('nonce', nonce)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .select('nonce');
    if (nonceErr) {
      console.error('[checker-claim] nonce update failed —', nonceErr.message);
      return res.status(500).json({ error: 'internal error' });
    }
    if (!consumed || consumed.length === 0) {
      return res.status(401).json({ error: 'challenge expired or already used, start again' });
    }

    const results = [];
    const toCheck = [];
    const seen = new Set();
    for (const c of claims) {
      const origin = c && c.origin;
      if (typeof origin !== 'string' || seen.has(origin)) continue;
      seen.add(origin);
      const piece = manifest.find(p => p.claimable && p.origin === origin);
      if (!piece) { results.push({ origin, result: 'not_claimable' }); continue; }
      const signer = proofAddress(claimMessage(origin, twetchHandle, nonce), c.pubKey, c.sig);
      if (!signer) { results.push({ origin, piece: piece.piece, result: 'invalid_signature' }); continue; }
      toCheck.push({ origin, piece: piece.piece, signer });
    }

    const owners = await mapLimited(toCheck, c => lookupOwner(c.origin));
    for (let i = 0; i < toCheck.length; i++) {
      const { origin, piece, signer } = toCheck[i];
      const o = owners[i];
      if (o.status === 'unknown') { results.push({ origin, piece, result: 'unknown' }); continue; }
      if (o.owner !== signer) { results.push({ origin, piece, result: 'not_owner' }); continue; }

      const { error } = await supabase
        .from('twonk_claims')
        .insert([{ origin, piece, address: signer, twetch_handle: twetchHandle }]);
      if (error && error.code === '23505') { results.push({ origin, piece, result: 'already_claimed' }); continue; }
      if (error) {
        console.error('[checker-claim] insert failed —', error.message);
        results.push({ origin, piece, result: 'unknown' });
        continue;
      }
      results.push({ origin, piece, result: 'claimed' });
    }

    return res.json({ handle: twetchHandle, results });
  } catch (err) {
    console.error('[checker-claim] error', err);
    return res.status(500).json({ error: 'internal error' });
  }
};
