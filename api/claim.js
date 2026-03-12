const supabase = require('./_db');
const fetch = require('node-fetch');

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { inscriptionId, ordAddress, epoch } = req.body || {};
    if (!inscriptionId || !ordAddress) return res.status(400).json({ error: 'inscriptionId and ordAddress required' });

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

    // Prevent duplicate claim for same epoch
    const { data: existing } = await supabase.from('claims').select('*').eq('inscription_id', inscriptionId).eq('epoch', epoch || 'default').maybeSingle();
    if (existing) return res.status(409).json({ error: 'already claimed for epoch' });

    // Insert pending claim — actual payout should be processed locally by the project owner
    // Prefer MNEE if available, otherwise use BSV claimable amount
    const claimAmount = mneeAmount > 0 ? alloc.mnee_claimable : alloc.bsv_claimable;
    const insert = await supabase.from('claims').insert([{ inscription_id: inscriptionId, recipient_address: ordAddress, amount: claimAmount, epoch: epoch || 'default', status: 'pending' }]);
    if (insert.error) return res.status(500).json({ error: insert.error.message });
    const inserted = insert.data && insert.data[0];

    // If AUTO_PAYOUT is enabled, attempt server-side payout immediately
    if (process.env.AUTO_PAYOUT === 'true') {
      try {
        const payout = require('./payout');
        const claimId = inserted?.id;
        if (claimId) {
          const txid = await payout.processClaimPayout(claimId);
          return res.json({ success: true, message: 'paid', txid });
        }
      } catch (e) {
        console.error('[api/claim] auto-payout failed', e);
        // fallthrough to registered
      }
    }

    return res.json({ success: true, message: 'claim registered. awaiting payout by admin' });
  } catch (err) {
    console.error('[api/claim] error', err);
    res.status(500).json({ error: 'internal' });
  }
};
