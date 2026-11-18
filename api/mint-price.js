// api/mint-price.js
// Public, read-only endpoint. mint.html polls this for display — never trusted as the
// settlement price (api/mint-complete.js recomputes its own live price at settle time).
const { priceAt, isOpen, CONFIG, getChainTip, effectiveBlock } = require('../lib/pricing');
const { getOrInitCurve } = require('./_pricing-state');
const { LAUNCH_BLOCK, hasAdminBypass } = require('../lib/launch-gate');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const cardIds = (req.body || {}).card_ids;
    if (!Array.isArray(cardIds) || !cardIds.length) {
      return res.status(400).json({ error: 'card_ids (non-empty array) required' });
    }

    let tip;
    try {
      tip = await getChainTip();
    } catch (tipErr) {
      // Transient DNS/timeout blips happen more often under rapid repeated calls (minting
      // several cards back to back polls this a lot) — don't hard-fail the whole page's prices
      // over one slow tick.
      console.warn('[mint-price] chain tip lookup failed (treating as retryable):', tipErr.message);
      return res.status(503).json({ error: 'chain lookup temporarily unavailable — retry shortly' });
    }
    const mintOpen = tip >= LAUNCH_BLOCK || hasAdminBypass(req);
    const prices = {};
    for (const cardId of cardIds) {
      const row = await getOrInitCurve(cardId, tip);
      const state = { pNum: BigInt(row.p_num), pDen: BigInt(row.p_den), hLast: BigInt(row.h_last) };
      const price = priceAt(state, effectiveBlock(state, tip));
      const open = isOpen(row.start_block, tip, { windowBlocks: BigInt(row.window_blocks) });
      prices[cardId] = {
        price_sats: price.toString(),
        floor_sats: CONFIG.floor.toString(),
        window_open: open,
        blocks_remaining: open ? Number(BigInt(row.start_block) + BigInt(row.window_blocks) - BigInt(tip)) : 0,
        edition_count: row.edition_count,
      };
    }
    return res.json({ tip, mint_open: mintOpen, launch_block: LAUNCH_BLOCK, prices });
  } catch (err) {
    console.error('[mint-price] error', err.message);
    return res.status(500).json({ error: 'internal' });
  }
};
