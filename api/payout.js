/*
  api/payout.js
  Sends BSV directly from the treasury wallet to the claimant.
  Requires env vars:
    TREASURY_PAY_PK   — WIF private key for address 1r1rJXu5znptbcSKYuFW74eDZ3zJtsAwb
    ARC_API_KEY       — (optional) Taal ARC API key
*/

const supabase = require('./_db');
const fetch    = require('node-fetch');

const TREASURY_ADDRESS = '1r1rJXu5znptbcSKYuFW74eDZ3zJtsAwb';

async function sendBSVToAddress(toAddress, satoshis) {
  const { PrivateKey, P2PKH, Transaction, ARC } = require('@bsv/sdk');

  const wif = process.env.TREASURY_PAY_PK;
  console.log('[payout] TREASURY_PAY_PK present:', !!wif);
  if (!wif) throw new Error('TREASURY_PAY_PK not set in env');

  const privKey = PrivateKey.fromWif(wif);

  // Fetch UTXOs from WhatsOnChain
  const utxoResp = await fetch(
    `https://api.whatsonchain.com/v1/bsv/main/address/${TREASURY_ADDRESS}/unspent`
  );
  if (!utxoResp.ok) throw new Error(`WoC UTXO fetch failed: ${utxoResp.status}`);
  const utxos = await utxoResp.json();
  if (!utxos || utxos.length === 0) throw new Error('No UTXOs available in treasury');

  const tx = new Transaction();

  // Add inputs — @bsv/sdk requires the full source transaction for fee/signing
  for (const utxo of utxos) {
    const hexResp = await fetch(
      `https://api.whatsonchain.com/v1/bsv/main/tx/${utxo.tx_hash}/hex`
    );
    if (!hexResp.ok) throw new Error(`WoC raw-tx fetch failed for ${utxo.tx_hash}: ${hexResp.status}`);
    const rawHex = (await hexResp.text()).trim();
    const sourceTx = Transaction.fromHex(rawHex);

    tx.addInput({
      sourceTXID: utxo.tx_hash,
      sourceOutputIndex: utxo.tx_pos,
      sourceTransaction: sourceTx,
      unlockingScriptTemplate: new P2PKH().unlock(privKey),
    });
  }

  // Payment output
  tx.addOutput({
    lockingScript: new P2PKH().lock(toAddress),
    satoshis,
  });

  // Change back to treasury
  tx.addOutput({
    lockingScript: new P2PKH().lock(TREASURY_ADDRESS),
    change: true,
  });

  await tx.fee();
  await tx.sign();

  const arcUrl  = 'https://arc.taal.com';
  const arcOpts = process.env.ARC_API_KEY ? { apiKey: process.env.ARC_API_KEY } : {};
  const result  = await tx.broadcast(new ARC(arcUrl, arcOpts));
  console.log('[payout] broadcast result:', JSON.stringify(result));

  const txid = result?.txid || result?.id || result?.data?.txid || JSON.stringify(result);
  if (!txid) throw new Error('Broadcast succeeded but no txid returned');
  return String(txid);
}

async function processClaimPayout(claimId) {
  if (!claimId) throw new Error('claimId required');

  const { data: claim } = await supabase
    .from('claims').select('*').eq('id', claimId).maybeSingle();
  if (!claim)                        throw new Error('claim not found');
  if (claim.status !== 'pending')    throw new Error('claim not pending');
  if (!claim.recipient_address)      throw new Error('no recipient address');

  const satoshis = Number(claim.amount || 0);
  if (satoshis <= 0) throw new Error('invalid claim amount (must be satoshis > 0)');

  const txid = await sendBSVToAddress(claim.recipient_address, satoshis);

  // Mark claim sent
  await supabase.from('claims')
    .update({ status: 'sent', txid, claimed_at: new Date().toISOString() })
    .eq('id', claim.id);

  // Zero out bsv_claimable for this inscription
  if (claim.inscription_id) {
    await supabase.from('reward_allocations')
      .update({ bsv_claimable: 0 })
      .eq('inscription_id', claim.inscription_id);
  }

  return txid;
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { claimId, inscriptionId } = req.body || {};
    if (!claimId && !inscriptionId)
      return res.status(400).json({ error: 'claimId or inscriptionId required' });

    let claim;
    if (claimId) {
      const { data } = await supabase.from('claims').select('*').eq('id', claimId).maybeSingle();
      claim = data;
    } else {
      const { data } = await supabase.from('claims').select('*')
        .eq('inscription_id', inscriptionId).eq('status', 'pending').limit(1).maybeSingle();
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
