// CANONICAL bump-and-decay price engine. Integer-only (BigInt) so that any implementation
// (server, client, auditor) reproduces results exactly. No floats anywhere.
//
// Per-card state: { pNum, pDen, hLast }  (price right after the last settled buy, as a fraction, and that block)
// Price at block h:  ceil( (pNum/pDen) * (decayNum/decayDen)^(h - hLast) ), never below floor.
// Settled buy at block h: price = priceAt(h); new state = price * bump, hLast = h.
//   -> the bump applies to the LIVE price at settlement (not to the amount a stale quote paid).

export const DEFAULTS = Object.freeze({
  p0: 6_400_000n,                 // 0.064 BSV, in sats
  floor: 640_000n,                // 0.0064 BSV
  bumpNum: 11n, bumpDen: 10n,     // +10% per buy
  decayNum: 9975n, decayDen: 10_000n, // x0.9975 per block (-0.25%)
  windowBlocks: 1008n,            // 7 days x 144; start inclusive, end = start + windowBlocks - 1 inclusive
  holdersPct: 50n,                // split equally across holderCount components
  platformPct: 10n,
  holderCount: 8n,                // creator gets the remainder (40% + rounding dust)
});

const ceilDiv = (a, b) => (a + b - 1n) / b;

export function openState(startBlock, cfg = DEFAULTS) {
  return { pNum: cfg.p0, pDen: 1n, hLast: BigInt(startBlock) };
}

export function priceAt(state, h, cfg = DEFAULTS) {
  const dh = BigInt(h) - state.hLast;
  if (dh < 0n) throw new RangeError('block is before the last settled buy');
  const p = ceilDiv(state.pNum * cfg.decayNum ** dh, state.pDen * cfg.decayDen ** dh);
  return p < cfg.floor ? cfg.floor : p;
}

export function settleBuy(state, h, cfg = DEFAULTS) {
  const price = priceAt(state, h, cfg);
  return { price, state: { pNum: price * cfg.bumpNum, pDen: cfg.bumpDen, hLast: BigInt(h) } };
}

export function splitPayout(price, cfg = DEFAULTS) {
  const perHolder = ((price * cfg.holdersPct) / 100n) / cfg.holderCount;
  const platform = (price * cfg.platformPct) / 100n;
  const creator = price - perHolder * cfg.holderCount - platform;
  return { creator, platform, perHolder };
}

export function isOpen(startBlock, h, cfg = DEFAULTS) {
  const s = BigInt(startBlock), x = BigInt(h);
  return x >= s && x < s + cfg.windowBlocks;
}
