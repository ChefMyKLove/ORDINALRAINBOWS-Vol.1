/*
  api/payout.js
  Sends BSV directly from the treasury wallet to the claimant.
  Requires env vars:
    TREASURY_PAY_PK   — WIF private key for address 1r1rJXu5znptbcSKYuFW74eDZ3zJtsAwb
    ARC_API_KEY       — (optional) Taal ARC API key
*/

const { PrivateKey, Transaction, P2PKH, ARC } = require('@bsv/sdk');
const supabase = require('./_db');
const fetch    = require('node-fetch');

const TREASURY_ADDRESS = '1r1rJXu5znptbcSKYuFW74eDZ3zJtsAwb';
const FETCH_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function sendBSVToAddress(toAddress, satoshis) {
  const wif = process.env.TREASURY_PAY_PK;
  console.log('[payout] sendBSVToAddress called — TREASURY_PAY_PK:', wif ? `set (length ${wif.length})` : 'UNDEFINED');
  if (!wif) throw new Error('TREASURY_PAY_PK not set in env');

  const privKey = PrivateKey.fromWif(wif);

  const utxoUrl = `https://api.whatsonchain.com/v1/bsv/main/address/${TREASURY_ADDRESS}/unspent/all`;
  console.log('[payout] fetching UTXOs from:', utxoUrl);
  const utxoResp = await fetchWithTimeout(utxoUrl, {
    headers: { 'Authorization': process.env.WOC_API_KEY || '' },
  });
  if (!utxoResp.ok) throw new Error(`WoC UTXO fetch failed: ${utxoResp.status} ${await utxoResp.text()}`);
  const utxoData = await utxoResp.json();
  console.log('[payout] UTXO response:', utxoResp.status, JSON.stringify(utxoData));
  const utxos = utxoData.result || [];
  if (utxos.length === 0) throw new Error('No UTXOs found for treasury wallet');

  const tx = new Transaction();

  for (const utxo of utxos) {
    const hexResp = await fetchWithTimeout(`https://api.whatsonchain.com/v1/bsv/main/tx/${utxo.tx_hash}/hex`);
    if (!hexResp.ok) throw new Error(`WoC raw-tx fetch failed for ${utxo.tx_hash}: ${hexResp.status}`);
    const rawHex = await hexResp.text();
    const sourceTx = Transaction.fromHex(rawHex);

    tx.addInput({
      sourceTXID: utxo.tx_hash,
      sourceOutputIndex: utxo.tx_pos,
      sourceTransaction: sourceTx,
      unlockingScriptTemplate: new P2PKH().unlock(privKey),
    });
  }

  tx.addOutput({
    lockingScript: new P2PKH().lock(toAddress),
    satoshis,
  });

  tx.addOutput({
    lockingScript: new P2PKH().lock(TREASURY_ADDRESS),
    change: true,
  });

  await tx.fee();
  await tx.sign();

  const result = await tx.broadcast(new ARC('https://arc.taal.com', process.env.TAAL_API_KEY));

  console.log('[payout] broadcast result:', JSON.stringify(result));

  const txid = (typeof result === 'string' && result.length === 64) ? result
    : (typeof result?.txid === 'string' && result.txid.length > 0) ? result.txid
    : (typeof result?.id   === 'string' && result.id.length   > 0) ? result.id
    : (typeof result?.data?.txid === 'string' && result.data.txid.length > 0) ? result.data.txid
    : null;

  if (!txid) throw new Error(`Broadcast returned no valid txid. Raw result: ${JSON.stringify(result)}`);
  return txid;
}

async function processClaimPayout(claimId) {
  if (!claimId) throw new Error('claimId required');

  // Atomically claim the row: only succeeds if it's still 'pending'. This closes the
  // double-payout race — two concurrent callers can never both win this update, because
  // the second one's WHERE clause matches zero rows once the first has flipped the status.
  const { data: lockedRows, error: lockErr } = await supabase
    .from('claims')
    .update({ status: 'broadcasting' })
    .eq('id', claimId)
    .eq('status', 'pending')
    .select();
  if (lockErr) throw new Error(`failed to lock claim: ${lockErr.message}`);
  if (!lockedRows || lockedRows.length === 0) {
    throw new Error('claim not pending (already processed or does not exist)');
  }
  const claim = lockedRows[0];

  // Everything from here through the broadcast call is inside the try/catch so that any
  // failure — including validation failures on the locked claim's own data — flips the
  // claim to 'failed' instead of leaving it stuck in 'broadcasting' forever.
  let txid;
  try {
    if (!claim.recipient_address) throw new Error('no recipient address');

    const satoshis = Number(claim.amount || 0);
    if (!Number.isInteger(satoshis) || satoshis <= 0) throw new Error('invalid claim amount (must be a positive integer number of satoshis)');

    txid = await sendBSVToAddress(claim.recipient_address, satoshis);
  } catch (broadcastErr) {
    await supabase.from('claims').update({ status: 'failed' }).eq('id', claim.id).eq('status', 'broadcasting');
    throw broadcastErr;
  }

  const { error: sentErr } = await supabase
    .from('claims')
    .update({ status: 'sent', txid, claimed_at: new Date().toISOString() })
    .eq('id', claim.id);
  if (sentErr) {
    console.error('[payout] CRITICAL: broadcast succeeded but DB update failed. claimId:', claim.id, 'txid:', txid, 'error:', sentErr.message);
    throw new Error(`payout sent (txid ${txid}) but failed to record — manual reconciliation needed: ${sentErr.message}`);
  }

  if (claim.inscription_id) {
    const ok = await deductClaimable(claim.inscription_id, Number(claim.amount));
    if (!ok) console.error('[payout] CRITICAL: paid but could not deduct allocation. claimId:', claim.id, 'txid:', txid);
  }

  return txid;
}

// Subtract a paid amount from an allocation (never below 0). Compare-and-set on the current
// value, so an allocation added between claim and payout is kept instead of being wiped.
async function deductClaimable(inscriptionId, amount, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    const { data: alloc, error } = await supabase
      .from('reward_allocations').select('bsv_claimable').eq('inscription_id', inscriptionId).maybeSingle();
    if (error || !alloc) return false;
    const current = Number(alloc.bsv_claimable || 0);
    const { data: updated } = await supabase
      .from('reward_allocations')
      .update({ bsv_claimable: Math.max(0, current - amount) })
      .eq('inscription_id', inscriptionId)
      .eq('bsv_claimable', alloc.bsv_claimable)
      .select('inscription_id');
    if (updated && updated.length) return true;
  }
  return false;
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const adminSecret = req.headers['x-admin-secret'];
    if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }

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
    console.error('[api/payout] error', err.message, err.stack);
    res.status(500).json({ error: 'internal error' });
  }
};

module.exports.processClaimPayout = processClaimPayout;
module.exports.deductClaimable = deductClaimable;
