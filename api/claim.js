const supabase = require('./_db');
const fetch = require('node-fetch');

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { inscriptionId, ordAddress, bsvAddress, epoch } = req.body || {};
    if (!inscriptionId || !ordAddress) return res.status(400).json({ error: 'inscriptionId and ordAddress required' });
    if (!bsvAddress) return res.status(400).json({ error: 'bsvAddress (BSV payment address) required' });

    // Re-verify ownership via GorillaPool
    const apiUrl = `https://ordinals.gorillapool.io/api/inscriptions/${inscriptionId}_0`;
    const r = await fetch(apiUrl);
    if (!r.ok) return res.status(502).json({ error: 'upstream failure' });
    const item = await r.json();
    const owner = item?.owner || null;
    if (!owner || owner.toLowerCase() !== ordAddress.toLowerCase()) {
      return res.status(403).json({ error: 'ownership mismatch' });
    }

    // Check allocation
    const { data: alloc } = await supabase.from('reward_allocations').select('*').eq('inscription_id', inscriptionId).maybeSingle();
    if (!alloc) return res.status(404).json({ error: 'allocation not found' });
    const mneeAmount = Number(alloc.mnee_claimable || 0);
    const bsvAmount  = Number(alloc.bsv_claimable  || 0);
    if (mneeAmount <= 0 && bsvAmount <= 0) return res.status(409).json({ error: 'nothing to claim' });

    // Duplicate claim logic: look up the most recent claim for this inscription
    const { data: existing } = await supabase
      .from('claims').select('id, status')
      .eq('inscription_id', inscriptionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'pending') {
        return res.status(409).json({ error: 'already claimed, payout pending' });
      }
      if (existing.status === 'sent') {
        // Only block if no new rewards have accumulated since the last payout
        if (bsvAmount <= 0) return res.status(409).json({ error: 'nothing to claim' });
        // bsvAmount > 0 means new rewards seeded since last payout — allow a fresh claim
      }
    }

    // Prefer MNEE; fall back to BSV claimable amount
    const claimAmount = mneeAmount > 0 ? alloc.mnee_claimable : alloc.bsv_claimable;
    // Insert pending claim
    const insert = await supabase.from('claims').insert([{ inscription_id: inscriptionId, recipient_address: bsvAddress, amount: claimAmount, epoch: epoch || 'default', status: 'pending' }]);
    if (insert.error) return res.status(500).json({ error: insert.error.message });

    // Fetch the newly inserted claim by inscription + epoch to get its id
    const { data: newClaim } = await supabase.from('claims').select('id')
      .eq('inscription_id', inscriptionId).eq('epoch', epoch || 'default').eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    // Always attempt immediate BSV payout
    try {
      const { processClaimPayout } = require('./payout');
      if (newClaim?.id) {
        const txid = await processClaimPayout(newClaim.id);
        console.log('[api/claim] payout success — claimId:', newClaim.id, 'txid:', txid);
        return res.status(200).json({ success: true, txid: txid, message: 'BSV sent!' });
      }
    } catch (e) {
      console.error('[api/claim] payout failed — claimId:', newClaim?.id, 'error:', e.message, e.stack);
      return res.status(200).json({ success: false, message: e.message, stack: e.stack });
    }

    return res.json({ success: true, message: 'claim registered. payout pending.' });
  } catch (err) {
    console.error('[api/claim] error', err);
    res.status(500).json({ error: 'internal' });
  }
};
