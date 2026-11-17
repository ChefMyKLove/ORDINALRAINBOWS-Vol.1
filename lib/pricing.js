// lib/pricing.js
// Bump-and-decay mint price engine — port of the reviewed `canon (1).mjs` reference design
// (see docs/superpowers/specs/2026-11-12-dynamic-mint-pricing-design.md). Integer/BigInt only,
// no floats, so this matches golden-vectors.json exactly (that file is the acceptance test).
//
// TEST_MODE must be flipped to false together with ordinal gif/src/main.js's own TEST_MODE
// before a real-money launch (tracked in docs/HANDOFF_PAYMENT_REWARDS.md's launch blockers).
const TEST_MODE = true;

// Real config — exact numbers from golden-vectors.json's "config" block (the acceptance test).
const REAL_CONFIG = Object.freeze({
  p0: 6_400_000n, floor: 640_000n,
  bumpNum: 11n, bumpDen: 10n,
  decayNum: 9975n, decayDen: 10_000n,
  windowBlocks: 1008n,
  holdersPct: 50n, platformPct: 10n, holderCount: 8n,
});

// Dust-test config — same 10:1 p0:floor ratio and all other ratios, per the spec's
// "Pricing parameters (dust test)" row. Same code path, smaller numbers.
const DUST_CONFIG = Object.freeze({
  ...REAL_CONFIG,
  p0: 2000n, floor: 200n,
});

const CONFIG = TEST_MODE ? DUST_CONFIG : REAL_CONFIG;

const ceilDiv = (a, b) => (a + b - 1n) / b;

function openState(startBlock, cfg = CONFIG) {
  return { pNum: cfg.p0, pDen: 1n, hLast: BigInt(startBlock) };
}

function priceAt(state, h, cfg = CONFIG) {
  const dh = BigInt(h) - state.hLast;
  if (dh < 0n) throw new RangeError('block is before the last settled buy');
  const p = ceilDiv(state.pNum * cfg.decayNum ** dh, state.pDen * cfg.decayDen ** dh);
  return p < cfg.floor ? cfg.floor : p;
}

function settleBuy(state, h, cfg = CONFIG) {
  const price = priceAt(state, h, cfg);
  return { price, state: { pNum: price * cfg.bumpNum, pDen: cfg.bumpDen, hLast: BigInt(h) } };
}

function splitPayout(price, cfg = CONFIG) {
  const perHolder = ((price * cfg.holdersPct) / 100n) / cfg.holderCount;
  const platform = (price * cfg.platformPct) / 100n;
  const creator = price - perHolder * cfg.holderCount - platform;
  return { creator, platform, perHolder, holderPool: perHolder * cfg.holderCount };
}

function isOpen(startBlock, h, cfg = CONFIG) {
  const s = BigInt(startBlock), x = BigInt(h);
  return x >= s && x < s + cfg.windowBlocks;
}

const FETCH_TIMEOUT_MS = 5000;

// Shared chain-tip lookup — both api/mint-price.js and api/mint-complete.js need this, and
// per the spec it must always be fetched server-side fresh, never trusted from the client.
async function getChainTip() {
  const fetch = require('node-fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info', { signal: controller.signal });
    if (!resp.ok) throw new Error(`chain/info HTTP ${resp.status}`);
    const info = await resp.json();
    if (!Number.isInteger(info.blocks)) throw new Error('chain/info missing integer blocks field');
    return info.blocks;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  TEST_MODE, CONFIG,
  openState, priceAt, settleBuy, splitPayout, isOpen,
  getChainTip,
};
