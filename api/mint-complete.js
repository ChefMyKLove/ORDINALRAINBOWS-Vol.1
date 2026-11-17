// api/mint-complete.js
// Public endpoint mint.html calls directly after the buyer's wallet pays the 3-way split.
// Unlike api/seed-mint.js (admin-secret gated, server-to-server only), this is reachable from
// a browser with no secret — instead it verifies the holder-pool payment on-chain before
// crediting anything, so seeding a fake reward costs an attacker a real on-chain payment.

const fetch = require('node-fetch');
const supabase = require('./_db');
const { seedMintAllocations } = require('./seed-mint');
const { priceAt, settleBuy, splitPayout, isOpen, getChainTip } = require('../lib/pricing');
const { getOrInitCurve } = require('./_pricing-state');

const HOLDER_WALLET = '1r1rJXu5znptbcSKYuFW74eDZ3zJtsAwb'; // == TREASURY_ADDRESS in api/payout.js
const FETCH_TIMEOUT_MS = 3000;
const MAX_SETTLE_ATTEMPTS = 5;

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
//
// Returns the actual matched output's sats alongside status — needed so a CAS-retry that finds
// the curve already bumped by a concurrent buyer can re-check the *same already-known payment*
// against the new price, without a second chain lookup.
async function checkHolderPoolPayment(paymentTxid, minSats) {
  let resp;
  try {
    resp = await fetchWithTimeout(`https://api.whatsonchain.com/v1/bsv/main/tx/hash/${paymentTxid}`);
  } catch (err) {
    console.warn('[mint-complete] on-chain lookup error (treating as not-yet-indexed):', err.message);
    return { status: 'pending', paidSats: 0 };
  }
  if (!resp.ok) {
    console.log(`[mint-complete] tx not found yet (HTTP ${resp.status}) — pending`);
    return { status: 'pending', paidSats: 0 };
  }
  const tx = await resp.json();
  const outputs = tx.vout || [];
  const poolOutput = outputs.find(o => (o.scriptPubKey?.addresses || []).includes(HOLDER_WALLET));
  const paidSats = poolOutput ? Math.round(Number(poolOutput.value) * 1e8) : 0;
  if (paidSats >= minSats) { console.log('[mint-complete] payment confirmed'); return { status: 'paid', paidSats }; }
  console.warn('[mint-complete] tx found but does not cover the required pool amount — real mismatch, not a propagation delay');
  return { status: 'insufficient', paidSats };
}

// Settles one buy on a card's curve with optimistic compare-and-set, mirroring the pattern
// already used by deductClaimable() in api/payout.js. Re-derives the required pool payment on
// every attempt — if a concurrent buyer's settle wins the race and bumps the price, the already-
// verified payment is re-checked against the *new* price, and rejected (402, same shape as an
// ordinary underpayment) rather than silently settling at a price the buyer didn't actually pay.
async function settleCardCurve(cardId, tip, paidPoolSats) {
  for (let attempt = 1; attempt <= MAX_SETTLE_ATTEMPTS; attempt++) {
    const row = await getOrInitCurve(cardId, tip);
    if (!isOpen(row.start_block, tip, { windowBlocks: BigInt(row.window_blocks) })) {
      return { ok: false, reason: 'window_closed' };
    }
    const state = { pNum: BigInt(row.p_num), pDen: BigInt(row.p_den), hLast: BigInt(row.h_last) };
    const price = priceAt(state, tip);
    const { holderPool } = splitPayout(price);
    if (BigInt(paidPoolSats) < holderPool) {
      return { ok: false, reason: 'price_moved', requiredPoolSats: holderPool.toString(), price: price.toString() };
    }

    const settled = settleBuy(state, tip);
    const editionNumber = row.edition_count + 1;
    const { data: updated, error } = await supabase
      .from('card_curves')
      .update({
        p_num: settled.state.pNum.toString(), p_den: settled.state.pDen.toString(),
        h_last: tip, edition_count: editionNumber, updated_at: new Date().toISOString(),
      })
      .eq('card_id', cardId).eq('p_num', row.p_num).eq('p_den', row.p_den).eq('h_last', row.h_last)
      .select();
    if (error) throw new Error(`card_curves settle failed: ${error.message}`);
    if (updated && updated.length) {
      return { ok: true, price: settled.price.toString(), holderPoolSats: holderPool.toString(), editionNumber };
    }
    // Lost the race to a concurrent settle — loop and re-check against the row it left behind.
  }
  // Every attempt lost the race, but the payment was never found insufficient — the on-chain
  // payment already succeeded regardless. Per the spec's "Decided: CAS-retry exhaustion": treat
  // this exactly like "not yet indexed", so the client's existing poll loop just tries again.
  return { ok: false, reason: 'contention' };
}

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { payment_txid, nft_id } = req.body || {};
    if (!payment_txid) return res.status(400).json({ error: 'payment_txid required' });
    if (!nft_id) return res.status(400).json({ error: 'nft_id (card id) required' });

    // card_id for curve purposes: nft_id is already the per-card-slot identifier
    // (e.g. 'deal-c540eadcbe-card-01'), stable across editions of the same card — no second ID
    // scheme needed on the wire.
    const cardId = nft_id;
    let tip;
    try {
      tip = await getChainTip();
    } catch (tipErr) {
      // A transient DNS/timeout blip here shouldn't kill the whole registration attempt —
      // the client's poll loop already retries on {retry:true}, same as "not yet indexed".
      console.warn('[mint-complete] chain tip lookup failed (treating as retryable):', tipErr.message);
      return res.status(202).json({ retry: true, error: 'chain lookup temporarily unavailable — retry shortly' });
    }

    // First pass: how much is required right now, purely to know what to check the on-chain
    // payment against. The authoritative check happens again, fresh, inside settleCardCurve —
    // this first read is never trusted as the final price, only as a floor for "did they pay
    // enough to even be worth settling."
    const initialRow = await getOrInitCurve(cardId, tip);
    if (!isOpen(initialRow.start_block, tip, { windowBlocks: BigInt(initialRow.window_blocks) })) {
      return res.status(403).json({ retry: false, error: 'mint window is not open for this card' });
    }
    const initialPrice = priceAt(
      { pNum: BigInt(initialRow.p_num), pDen: BigInt(initialRow.p_den), hLast: BigInt(initialRow.h_last) },
      tip
    );
    const requiredPoolSats = Number(splitPayout(initialPrice).holderPool);

    const { status, paidSats } = await checkHolderPoolPayment(payment_txid, requiredPoolSats);
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

    const settled = await settleCardCurve(cardId, tip, paidSats);
    if (!settled.ok) {
      if (settled.reason === 'window_closed') return res.status(403).json({ retry: false, error: 'mint window closed for this card' });
      if (settled.reason === 'price_moved') return res.status(402).json({ retry: false, error: 'price moved before settlement — retry at the new price' });
      // 'contention' — payment already verified sufficient and already on-chain; just stuck on
      // internal bookkeeping. Tell the client to retry exactly like "not yet indexed".
      return res.status(202).json({ retry: true, error: 'settling — retry shortly' });
    }

    const { error: editionErr } = await supabase.from('card_editions').insert([{
      card_id: cardId, edition_number: settled.editionNumber, price_sats: Number(settled.price),
      settle_block: tip, payment_txid, inscription_id: (req.body || {}).inscription_id || null,
      early_access: false,
    }]);
    if (editionErr) console.error('[mint-complete] card_editions insert failed (non-fatal, settlement already committed):', editionErr.message);

    // Server-computed holder_pool_sats overrides whatever the client sent — the client's figure
    // was only ever a display estimate, never trusted for crediting.
    const result = await seedMintAllocations({ ...(req.body || {}), holder_pool_sats: settled.holderPoolSats });
    return res.json({ ...result, price_sats: settled.price, edition_number: settled.editionNumber });
  } catch (err) {
    console.error('[mint-complete] error', err.message);
    const isBadRequest = /required/.test(err.message || '');
    return res.status(isBadRequest ? 400 : 500).json({ error: isBadRequest ? err.message : 'internal' });
  }
};
