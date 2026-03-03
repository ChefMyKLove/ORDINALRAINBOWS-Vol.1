/*
  Server-side MNEE payout endpoint
  - Requires: SUPABASE_SERVICE_KEY, TREASURY_MNEMONIC (set in Vercel env)
  - Payout is done by WalletClient from @bsv/sdk using the provided mnemonic
  - POST body: { claimId } or { inscriptionId }
*/

const supabase = require('./_db');
const fetch = require('node-fetch');

async function sendMNEEUsingWalletClient(toAddress, amount) {
  // Lazy import to avoid startup cost
  const { WalletClient } = require('@bsv/sdk');

  const mnemonic = process.env.TREASURY_MNEMONIC;
  if (!mnemonic) throw new Error('TREASURY_MNEMONIC not set in env');

  const network = (process.env.BSV_NETWORK || 'mainnet');
  const client = new WalletClient({ mnemonic, network });

  if (typeof client.sendMNEE === 'function') {
    const result = await client.sendMNEE({ to: toAddress, amount });
    // result shape varies; try common fields
    return result?.txid || result?.txidHex || result;
  }

  // fallback: try a generic send if available
  if (typeof client.createAction === 'function') {
    // Attempt to create an action that sends MNEE token; implementation depends on your SDK version
    const action = await client.createAction({
      description: `Payout ${amount} MNEE to ${toAddress}`
      // Note: further implementation required for token transfer on some SDK versions
    });
    return action?.txid || null;
  }

  throw new Error('WalletClient does not support sendMNEE in this environment');
}
async function processClaimPayout(claimId) {
  if (!claimId) throw new Error('claimId required');
  const { data: claim } = await supabase.from('claims').select('*').eq('id', claimId).maybeSingle();
  if (!claim) throw new Error('claim not found');
  if (claim.status !== 'pending') throw new Error('claim not pending');
  if (!claim.recipient_address) throw new Error('no recipient');

  const amount = Number(claim.amount || 0);
  if (amount <= 0) throw new Error('invalid amount');

  const txid = await sendMNEEUsingWalletClient(claim.recipient_address, amount);

  await supabase.from('claims').update({ status: 'sent', txid, claimed_at: new Date().toISOString() }).eq('id', claim.id);

  if (claim.inscription_id) {
    const { data: alloc } = await supabase.from('reward_allocations').select('*').eq('inscription_id', claim.inscription_id).maybeSingle();
    if (alloc) {
      const remaining = Math.max(0, Number(alloc.mnee_claimable || 0) - amount);
      await supabase.from('reward_allocations').update({ mnee_claimable: remaining }).eq('inscription_id', claim.inscription_id);
    }
  }

  return txid;
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { claimId, inscriptionId } = req.body || {};
    if (!claimId && !inscriptionId) return res.status(400).json({ error: 'claimId or inscriptionId required' });

    let claim;
    if (claimId) {
      const { data } = await supabase.from('claims').select('*').eq('id', claimId).maybeSingle();
      claim = data;
    } else {
      const { data } = await supabase.from('claims').select('*').eq('inscription_id', inscriptionId).eq('status', 'pending').limit(1).maybeSingle();
      claim = data;
    }

    if (!claim) return res.status(404).json({ error: 'claim not found' });
    const txid = await processClaimPayout(claim.id);
    return res.json({ success: true, txid });
  } catch (err) {
    console.error('[api/payout] error', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports.processClaimPayout = processClaimPayout;
