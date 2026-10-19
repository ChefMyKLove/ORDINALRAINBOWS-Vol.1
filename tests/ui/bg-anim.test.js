const test = require('node:test');
const assert = require('node:assert');
const B = require('../../js/bg-anim.js');

test('desktop gets the full animation, phones and tablets only the crossfade', () => {
  assert.strictEqual(B.chooseBgMode({ isPhone: false, reducedMotion: false }), 'full');
  assert.strictEqual(B.chooseBgMode({ isPhone: true, reducedMotion: false }), 'fade');
});

test('reduced motion always gets the crossfade', () => {
  assert.strictEqual(B.chooseBgMode({ isPhone: false, reducedMotion: true }), 'fade');
  assert.strictEqual(B.chooseBgMode({ isPhone: true, reducedMotion: true }), 'fade');
});

test('stutter detection needs enough samples and a slow median frame', () => {
  assert.strictEqual(B.isStuttering([50, 50, 50]), false);
  assert.strictEqual(B.isStuttering(Array(30).fill(16.7)), false);
  assert.strictEqual(B.isStuttering(Array(30).fill(50)), true);
  assert.strictEqual(B.isStuttering([...Array(20).fill(16), ...Array(9).fill(200)]), false);
});
