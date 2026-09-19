const test = require('node:test');
const assert = require('node:assert');
const { PrivateKey, BSM } = require('@bsv/sdk');
const { verifySignedOwnership, buildClaimMessage, isTimestampFresh } = require('../../api/_verify-signature');

test('verifySignedOwnership accepts a valid signature from the claimed address', () => {
  const pk = PrivateKey.fromRandom();
  const address = pk.toPublicKey().toAddress();
  const message = buildClaimMessage('a'.repeat(64), 'mockBsvAddr', Math.floor(Date.now() / 1000));
  const sig = BSM.sign(message, pk, 'base64');
  assert.strictEqual(verifySignedOwnership(message, sig, address), true);
});

test('verifySignedOwnership rejects a signature from a different address', () => {
  const pk = PrivateKey.fromRandom();
  const otherAddress = PrivateKey.fromRandom().toPublicKey().toAddress();
  const message = buildClaimMessage('a'.repeat(64), 'mockBsvAddr', Math.floor(Date.now() / 1000));
  const sig = BSM.sign(message, pk, 'base64');
  assert.strictEqual(verifySignedOwnership(message, sig, otherAddress), false);
});

test('verifySignedOwnership rejects a tampered message', () => {
  const pk = PrivateKey.fromRandom();
  const address = pk.toPublicKey().toAddress();
  const message = buildClaimMessage('a'.repeat(64), 'mockBsvAddr', Math.floor(Date.now() / 1000));
  const sig = BSM.sign(message, pk, 'base64');
  assert.strictEqual(verifySignedOwnership(message + 'x', sig, address), false);
});

test('verifySignedOwnership rejects garbage input instead of throwing', () => {
  assert.strictEqual(verifySignedOwnership('msg', 'not-a-real-signature', '1SomeAddress'), false);
});

test('isTimestampFresh rejects a timestamp older than 5 minutes', () => {
  const old = Math.floor(Date.now() / 1000) - 600;
  assert.strictEqual(isTimestampFresh(old), false);
});

test('isTimestampFresh accepts a current timestamp', () => {
  assert.strictEqual(isTimestampFresh(Math.floor(Date.now() / 1000)), true);
});

test('isTimestampFresh rejects non-numeric input', () => {
  assert.strictEqual(isTimestampFresh('not-a-number'), false);
});
