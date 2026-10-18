const supabase = require('./_db');
const { lookupOwner, proofAddress } = require('../lib/checker');
const { buildClaimMessage, isTimestampFresh } = require('./_verify-signature');

const INSCRIPTION_ID_RE = /^[0-9a-fA-F]{64}$/;

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    // Proof = BRC-100 signature (DER hex, over sha256 of the claim message) from the key that holds the
    // inscription, plus that key's public key. New Yours keeps each 1sat on its own derived key.
    const { inscriptionId, bsvAddress, epoch, pubKey, sig, timestamp } = req.body || {};
    if (!inscriptionId) return res.status(400).json({ error: 'inscriptionId required' });
    if (!bsvAddress) return res.status(400).json({ error: 'bsvAddress (BSV payment address) required' });
    if (!pubKey || !sig || !timestamp) return res.status(400).json({ error: 'signature and timestamp required' });
    if (!INSCRIPTION_ID_RE.test(inscriptionId)) return res.status(400).json({ error: 'invalid inscriptionId format' });
    if (!isTimestampFresh(timestamp)) return res.status(400).json({ error: 'signature expired, please retry' });

    const signer = proofAddress(buildClaimMessage(inscriptionId, bsvAddress, timestamp), pubKey, sig);
    if (!signer) {
      return res.status(403).json({ error: 'invalid signature — could not verify wallet ownership' });
    }

    // The signing key must be the inscription's current on-chain owner (history lookup, not the mint output).
    const current = await lookupOwner(`${inscriptionId}_0`);
    if (current.status === 'unknown') return res.status(502).json({ error: 'upstream failure' });
    if (!current.owner || current.owner !== signer) {
      return res.status(403).json({ error: 'ownership mismatch' });
    }

    // BSV only — MNEE dollar amounts are never sent as satoshis. See Task 6 notes.
    const { data: alloc } = await supabase.from('reward_allocations').select('*').eq('inscription_id', inscriptionId).maybeSingle();
    if (!alloc) return res.status(404).json({ error: 'allocation not found' });
    const claimAmount = Number(alloc.bsv_claimable || 0);
    if (claimAmount <= 0) return res.status(409).json({ error: 'nothing to claim' });

    // Atomic insert — the unique partial index on claims(inscription_id) WHERE status IN
    // ('pending','broadcasting') (see Task 1) rejects a second concurrent claim for the
    // same inscription with a Postgres unique-violation, which we turn into a clean 409.
    const { data: insertedRows, error: insertErr } = await supabase
      .from('claims')
      .insert([{ inscription_id: inscriptionId, recipient_address: bsvAddress, amount: claimAmount, epoch: epoch || 'default', status: 'pending' }])
      .select();

    if (insertErr) {
      if (insertErr.code === '23505') {
        return res.status(409).json({ error: 'already claimed, payout pending' });
      }
      console.error('[api/claim] insert failed —', insertErr.message);
      return res.status(500).json({ error: 'internal error' });
    }
    const newClaim = insertedRows && insertedRows[0];

    if (process.env.AUTO_PAYOUT === 'false') {
      return res.json({ success: true, message: 'claim registered. payout pending (AUTO_PAYOUT disabled).' });
    }

    try {
      const { processClaimPayout } = require('./payout');
      const txid = await processClaimPayout(newClaim.id);
      console.log('[api/claim] payout success — claimId:', newClaim.id, 'txid:', txid);
      return res.status(200).json({ success: true, txid: txid, message: 'BSV sent!' });
    } catch (e) {
      console.error('[api/claim] payout failed — claimId:', newClaim.id, 'error:', e.message, e.stack);
      return res.status(200).json({ success: false, message: 'payout failed, see server logs' });
    }
  } catch (err) {
    console.error('[api/claim] error', err);
    res.status(500).json({ error: 'internal' });
  }
};
