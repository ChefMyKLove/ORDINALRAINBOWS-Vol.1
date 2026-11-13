const test = require('node:test');
const assert = require('node:assert');
const { rarityMultiplier } = require('../../lib/rarity');

test('rarityMultiplier orders tiers exotic > legendary > epic > rare > uncommon > common', () => {
  assert.ok(rarityMultiplier('exotic') > rarityMultiplier('legendary'));
  assert.ok(rarityMultiplier('legendary') > rarityMultiplier('epic'));
  assert.ok(rarityMultiplier('epic') > rarityMultiplier('rare'));
  assert.ok(rarityMultiplier('rare') > rarityMultiplier('uncommon'));
  assert.ok(rarityMultiplier('uncommon') > rarityMultiplier('common'));
});

test('rarityMultiplier is case-insensitive and defaults unknown/missing input to common', () => {
  assert.strictEqual(rarityMultiplier('EXOTIC'), rarityMultiplier('exotic'));
  assert.strictEqual(rarityMultiplier(undefined), rarityMultiplier('common'));
  assert.strictEqual(rarityMultiplier('not-a-tier'), rarityMultiplier('common'));
});

test('a rarity-weighted split of a pool across 8 shares sums to <= the pool and favors rarer pieces', () => {
  const poolSats = 32000000;
  const rarities = ['exotic', 'common', 'common', 'common', 'common', 'common', 'common', 'common'];
  const weights = rarities.map(rarityMultiplier);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map(w => Math.floor(poolSats * w / totalWeight));

  assert.ok(shares.reduce((a, b) => a + b, 0) <= poolSats);
  assert.ok(shares[0] > shares[1], 'the exotic piece should earn more than a common piece');
});
