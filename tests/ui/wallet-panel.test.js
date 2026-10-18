const test = require('node:test');
const assert = require('node:assert');
const W = require('../../js/wallet-panel.js');

test('pill label covers missing wallet, not connected, empty and rich wallets', () => {
  assert.strictEqual(W.pillLabel({ available: false, connected: false, ownedCount: 0, waitingSats: 0 }), 'Get Yours Wallet ↗');
  assert.strictEqual(W.pillLabel({ available: true, connected: false, ownedCount: 0, waitingSats: 0 }), '🔗 Connect');
  assert.strictEqual(W.pillLabel({ available: true, connected: true, ownedCount: 0, waitingSats: 0 }), '⭐ 0');
  assert.strictEqual(W.pillLabel({ available: true, connected: true, ownedCount: 2, waitingSats: 5000 }), '⭐ 2 · ⚡ 0.00005000 BSV');
});

test('waiting total counts only owned pieces and ignores missing entries', () => {
  const rewards = { a: 3000, b: 2000, c: 7000 };
  assert.strictEqual(W.waitingTotal(['a', 'b', 'zzz'], rewards), 5000);
  assert.strictEqual(W.waitingTotal([], rewards), 0);
});

test('short address', () => {
  assert.strictEqual(W.shortAddress('17yfjaGGR5bMMLArHJpiP1swGvE7yTzi2h'), '17yfja…zi2h');
  assert.strictEqual(W.shortAddress(null), '');
});
