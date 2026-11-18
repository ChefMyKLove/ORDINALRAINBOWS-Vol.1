// api/mint-complete-batch.js
// Batch sibling of mint-complete.js: settles N DISTINCT cards from ONE on-chain payment and ONE
// inscription transaction (see wallet.js's inscribeCards). Verifies the single payment covers
// the SUM of all N cards' live prices, then settles each card's own independent curve.
// Repeats of the same card within one batch are intentionally not supported yet — that needs
// simulating sequential same-card price bumps before the single payment is even checked, which
// is real extra complexity deferred until it's actually wanted (see main.js's random-mint picker,
// which only ever picks distinct cards).
const supabase = require('./_db');
const { seedMintAllocations } = require('./seed-mint');
const { priceAt, settleBuy, splitPayout, isOpen, getChainTip, effectiveBlock } = require('../lib/pricing');
const { getOrInitCurve } = require('./_pricing-state');
const { LAUNCH_BLOCK, hasAdminBypass } = require('../lib/launch-gate');

const HOLDER_WALLET = '1r1rJXu5znptbcSKYuFW74eDZ3zJtsAwb';
const FETCH_TIMEOUT_MS = 5000;
const MAX_SETTLE_ATTEMPTS = 5;

function fetchWithTimeout(url, options = {}) {
  const fetch = require('node-fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function checkHolderPoolPayment(paymentTxid, minSats) {
  let resp;
  try {
    resp = await fetchWithTimeout(`https://api.whatsonchain.com/v1/bsv/main/tx/hash/${paymentTxid}`);
  } catch (err) {
    console.warn('[mint-complete-batch] on-chain lookup error (treating as not-yet-indexed):', err.message);
    return { status: 'pending', paidSats: 0 };
  }
  if (!resp.ok) return { status: 'pending', paidSats: 0 };
  const tx = await resp.json();
  const outputs = tx.vout || [];
  const poolOutput = outputs.find(o => (o.scriptPubKey?.addresses || []).includes(HOLDER_WALLET));
  const paidSats = poolOutput ? Math.round(Number(poolOutput.value) * 1e8) : 0;
  if (paidSats >= minSats) return { status: 'paid', paidSats };
  return { status: 'insufficient', paidSats };
}

// Each card's curve is independent and every id in a batch is distinct, so this is just N of
// the single-card settles run together, verified against one combined payment.
async function settleCardCurvesBatch(cardIds, tip, paidPoolSats, adminBypass) {
  for (let attempt = 1; attempt <= MAX_SETTLE_ATTEMPTS; attempt++) {
    const rows = {};
    for (const id of cardIds) rows[id] = await getOrInitCurve(id, tip);
    if (!adminBypass) {
      for (const id of cardIds) {
        if (!isOpen(rows[id].start_block, tip, { windowBlocks: BigInt(rows[id].window_blocks) })) {
          return { ok: false, reason: 'window_closed', cardId: id };
        }
      }
    }
    const prices = {};
    const effH = {};
    let totalPool = 0n;
    for (const id of cardIds) {
      const state = { pNum: BigInt(rows[id].p_num), pDen: BigInt(rows[id].p_den), hLast: BigInt(rows[id].h_last) };
      effH[id] = effectiveBlock(state, tip);
      prices[id] = priceAt(state, effH[id]);
      totalPool += splitPayout(prices[id]).holderPool;
    }
    if (BigInt(paidPoolSats) < totalPool) {
      return { ok: false, reason: 'price_moved', requiredPoolSats: totalPool.toString() };
    }

    const committed = [];
    let allOk = true;
    for (const id of cardIds) {
      const state = { pNum: BigInt(rows[id].p_num), pDen: BigInt(rows[id].p_den), hLast: BigInt(rows[id].h_last) };
      const settled = settleBuy(state, effH[id]);
      const editionNumber = rows[id].edition_count + 1;
      const { data: updated, error } = await supabase
        .from('card_curves')
        .update({
          p_num: settled.state.pNum.toString(), p_den: settled.state.pDen.toString(),
          h_last: Number(effH[id]), edition_count: editionNumber, updated_at: new Date().toISOString(),
        })
        .eq('card_id', id).eq('p_num', rows[id].p_num).eq('p_den', rows[id].p_den).eq('h_last', rows[id].h_last)
        .select();
      if (error) throw new Error(`card_curves settle failed: ${error.message}`);
      if (!updated || !updated.length) { allOk = false; break; }
      committed.push({ cardId: id, price: settled.price, editionNumber });
    }
    if (allOk) return { ok: true, results: committed, totalPoolSats: totalPool.toString() };
    // A card in this batch lost its race to a concurrent buyer mid-loop — cards already
    // committed this attempt keep their real bump (same "nothing wasted" spirit as the
    // single-mint settle; there's no cross-row transaction here to roll them back with).
    // Loop and retry fresh — the next attempt's reads will reflect what's already committed.
  }
  return { ok: false, reason: 'contention' };
}

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { payment_txid, items } = req.body || {};
    if (!payment_txid) return res.status(400).json({ error: 'payment_txid required' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items (non-empty array) required' });
    const cardIds = items.map(it => it.nft_id);
    if (new Set(cardIds).size !== cardIds.length) {
      return res.status(400).json({ error: 'duplicate card ids in one batch are not supported yet' });
    }

    const adminBypass = hasAdminBypass(req);
    let tip;
    try {
      tip = await getChainTip();
    } catch (tipErr) {
      console.warn('[mint-complete-batch] chain tip lookup failed (treating as retryable):', tipErr.message);
      return res.status(202).json({ retry: true, error: 'chain lookup temporarily unavailable — retry shortly' });
    }

    if (!adminBypass && tip < LAUNCH_BLOCK) {
      return res.status(403).json({ retry: false, error: 'Minting opens soon — check back later.' });
    }

    let initialTotal = 0n;
    for (const id of cardIds) {
      const row = await getOrInitCurve(id, tip);
      if (!adminBypass && !isOpen(row.start_block, tip, { windowBlocks: BigInt(row.window_blocks) })) {
        return res.status(403).json({ retry: false, error: `mint window is not open for card ${id}` });
      }
      const state = { pNum: BigInt(row.p_num), pDen: BigInt(row.p_den), hLast: BigInt(row.h_last) };
      const price = priceAt(state, effectiveBlock(state, tip));
      initialTotal += splitPayout(price).holderPool;
    }

    const { status, paidSats } = await checkHolderPoolPayment(payment_txid, Number(initialTotal));
    if (status === 'pending') return res.status(202).json({ retry: true, error: 'payment not yet indexed — retry shortly' });
    if (status === 'insufficient') return res.status(402).json({ retry: false, error: 'payment not found or insufficient on-chain' });

    const { error: replayErr } = await supabase.from('used_payments').insert([{ payment_txid, inscription_id: null }]);
    if (replayErr) {
      if (replayErr.code === '23505') return res.status(409).json({ retry: false, error: 'payment already used for a mint' });
      console.error('[mint-complete-batch] used_payments insert failed —', replayErr.message);
      return res.status(500).json({ error: 'internal' });
    }

    const settled = await settleCardCurvesBatch(cardIds, tip, paidSats, adminBypass);
    if (!settled.ok) {
      if (settled.reason === 'window_closed') return res.status(403).json({ retry: false, error: `mint window closed for card ${settled.cardId}` });
      if (settled.reason === 'price_moved') return res.status(402).json({ retry: false, error: 'price moved before settlement — retry at the new price' });
      return res.status(202).json({ retry: true, error: 'settling — retry shortly' });
    }

    const byCard = Object.fromEntries(settled.results.map(r => [r.cardId, r]));
    const results = [];
    for (const item of items) {
      const r = byCard[item.nft_id];
      const { error: editionErr } = await supabase.from('card_editions').insert([{
        card_id: item.nft_id, edition_number: r.editionNumber, price_sats: Number(r.price),
        settle_block: tip, payment_txid, inscription_id: item.inscription_id || null, early_access: false,
      }]);
      if (editionErr) console.error('[mint-complete-batch] card_editions insert failed (non-fatal):', editionErr.message);

      const holderPoolSats = splitPayout(r.price).holderPool.toString();
      const seedResult = await seedMintAllocations({ ...item, holder_pool_sats: holderPoolSats });
      results.push({ card_id: item.nft_id, price_sats: r.price.toString(), edition_number: r.editionNumber, seed: seedResult });
    }
    return res.json({ success: true, total_pool_sats: settled.totalPoolSats, results });
  } catch (err) {
    console.error('[mint-complete-batch] error', err.message);
    const isBadRequest = /required/.test(err.message || '');
    return res.status(isBadRequest ? 400 : 500).json({ error: isBadRequest ? err.message : 'internal' });
  }
};
