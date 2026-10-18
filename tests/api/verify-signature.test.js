const test = require('node:test');
const assert = require('node:assert');
const { ProtoWallet, PrivateKey, PublicKey, Utils } = require('@bsv/sdk');
const { buildClaimMessage, isTimestampFresh } = require('../../api/_verify-signature');
const { proofAddress } = require('../../lib/checker');

// Proofs come from a BRC-100 wallet signing with the key that holds a piece (as new Yours does).
const args = { protocolID: [0, 'onesat'], keyID: 'piece 1', counterparty: 'self' };

async function sign(wallet, message) {
  const { signature } = await wallet.createSignature({ ...args, data: Utils.toArray(message, 'utf8') });
  const { publicKey } = await wallet.getPublicKey({ ...args, forSelf: true });
  return { pubKey: publicKey, sig: Utils.toHex(signature), address: PublicKey.fromString(publicKey).toAddress() };
}

const freshMessage = (id = 'a') => buildClaimMessage(id.repeat(64), 'mockBsvAddr', Math.floor(Date.now() / 1000));

test('proofAddress returns the signing key address for a valid signature', async () => {
  const message = freshMessage();
  const p = await sign(new ProtoWallet(PrivateKey.fromRandom()), message);
  assert.strictEqual(proofAddress(message, p.pubKey, p.sig), p.address);
});

test('proofAddress rejects a signature checked against a different key', async () => {
  const message = freshMessage();
  const p = await sign(new ProtoWallet(PrivateKey.fromRandom()), message);
  const other = await sign(new ProtoWallet(PrivateKey.fromRandom()), message);
  assert.strictEqual(proofAddress(message, other.pubKey, p.sig), null);
});

test('proofAddress rejects a tampered message', async () => {
  const message = freshMessage();
  const p = await sign(new ProtoWallet(PrivateKey.fromRandom()), message);
  assert.strictEqual(proofAddress(message + 'x', p.pubKey, p.sig), null);
});

test('proofAddress rejects a different message of the same length (same-length forgery)', async () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const message = buildClaimMessage('a'.repeat(64), 'mockBsvAddr', timestamp);
  const forged = buildClaimMessage('b'.repeat(64), 'mockBsvAddr', timestamp);
  assert.strictEqual(message.length, forged.length);
  const p = await sign(new ProtoWallet(PrivateKey.fromRandom()), message);
  assert.strictEqual(proofAddress(forged, p.pubKey, p.sig), null);
});

test('proofAddress rejects garbage and null input instead of throwing', async () => {
  const message = freshMessage();
  const p = await sign(new ProtoWallet(PrivateKey.fromRandom()), message);
  assert.strictEqual(proofAddress('msg', 'not-a-pubkey', 'not-a-sig'), null);
  assert.strictEqual(proofAddress(message, p.pubKey, 'zz'), null);
  assert.strictEqual(proofAddress(null, p.pubKey, p.sig), null);
  assert.strictEqual(proofAddress(undefined, p.pubKey, p.sig), null);
  assert.strictEqual(proofAddress(message, undefined, p.sig), null);
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
