// api/mint-complete.js
// Public endpoint mint.html calls directly after the buyer's wallet pays the 3-way split.
// Unlike api/seed-mint.js (admin-secret gated, server-to-server only), this is reachable from
// a browser with no secret — instead it verifies the holder-pool payment on-chain before
// crediting anything, so seeding a fake reward costs an attacker a real on-chain payment.

const fetch = require('node-fetch');
const supabase = require('./_db');
const { seedMintAllocations } = require('./seed-mint');

const HOLDER_WALLET = '1r1rJXu5znptbcSKYuFW74eDZ3zJtsAwb'; // == TREASURY_ADDRESS in api/payout.js
const FETCH_TIMEOUT_MS = 3000;

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Measured in practice: a just-broadcast transaction can take over a minute to reach
// WhatsOnChain's index — far too long to hold open inside one serverless function call without
// risking Vercel's execution-time limit (no maxDuration is set in vercel.json, so this defaults
// to 10s). So this does a single check per call and tells the caller whether to retry, rather
// than looping here. The client (mint.html) polls this endpoint instead — it has no such
// execution ceiling and already shows a "Registering rewards..." status to poll against.
async function checkHolderPoolPayment(paymentTxid, minSats) {
  let resp;
  try {
    resp = await fetchWithTimeout(`https://api.whatsonchain.com/v1/bsv/main/tx/hash/${paymentTxid}`);
  } catch (err) {
    console.warn('[mint-complete] on-chain lookup error (treating as not-yet-indexed):', err.message);
    return 'pending';
  }
  if (!resp.ok) {
    console.log(`[mint-complete] tx not found yet (HTTP ${resp.status}) — pending`);
    return 'pending';
  }
  const tx = await resp.json();
  const outputs = tx.vout || [];
  const paid = outputs.some(o =>
    (o.scriptPubKey?.addresses || []).includes(HOLDER_WALLET) &&
    Math.round(Number(o.value) * 1e8) >= minSats
  );
  if (paid) { console.log('[mint-complete] payment confirmed'); return 'paid'; }
  console.warn('[mint-complete] tx found but does not pay the pool — real mismatch, not a propagation delay');
  return 'insufficient';
}

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { payment_txid, holder_pool_sats } = req.body || {};
    if (!payment_txid) return res.status(400).json({ error: 'payment_txid required' });

    const poolSats = Number(holder_pool_sats) || 0;
    if (poolSats <= 0) return res.status(400).json({ error: 'holder_pool_sats required' });

    const status = await checkHolderPoolPayment(payment_txid, poolSats);
    if (status === 'pending') return res.status(202).json({ retry: true, error: 'payment not yet indexed — retry shortly' });
    if (status === 'insufficient') return res.status(402).json({ retry: false, error: 'payment not found or insufficient on-chain' });

    // Atomic insert — the primary key on used_payments(payment_txid) rejects a second call
    // reusing the same on-chain payment with a Postgres unique-violation, which we turn into a
    // clean 409. Without this, one real payment could be replayed across many fake
    // inscription_ids to drain the pool repeatedly.
    const { error: replayErr } = await supabase
      .from('used_payments')
      .insert([{ payment_txid, inscription_id: (req.body || {}).inscription_id || null }]);
    if (replayErr) {
      if (replayErr.code === '23505') {
        return res.status(409).json({ retry: false, error: 'payment already used for a mint' });
      }
      console.error('[mint-complete] used_payments insert failed —', replayErr.message);
      return res.status(500).json({ error: 'internal' });
    }

    const result = await seedMintAllocations(req.body || {});
    return res.json(result);
  } catch (err) {
    console.error('[mint-complete] error', err.message);
    const isBadRequest = /required/.test(err.message || '');
    return res.status(isBadRequest ? 400 : 500).json({ error: isBadRequest ? err.message : 'internal' });
  }
};
