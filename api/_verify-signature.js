const { BSM, Signature, BigNumber, Utils } = require('@bsv/sdk');

const MAX_SIGNATURE_AGE_SECONDS = 300;

function verifySignedOwnership(message, signatureB64, expectedAddress) {
  let sig;
  let h;
  try {
    sig = Signature.fromCompact(signatureB64, 'base64');
    const hashBuf = BSM.magicHash(Utils.toArray(message, 'utf8'));
    h = new BigNumber(hashBuf);
  } catch (e) {
    return false;
  }

  for (let recovery = 0; recovery < 4; recovery++) {
    try {
      const pubKey = sig.RecoverPublicKey(recovery, h);
      if (pubKey.toAddress() === expectedAddress) return true;
    } catch (e) {
      // wrong recovery id for this signature — try the next one
    }
  }
  return false;
}

function buildClaimMessage(inscriptionId, bsvAddress, timestamp) {
  return `ordinalrainbows-claim:${inscriptionId}:${bsvAddress}:${timestamp}`;
}

function isTimestampFresh(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(now - ts) <= MAX_SIGNATURE_AGE_SECONDS;
}

module.exports = { verifySignedOwnership, buildClaimMessage, isTimestampFresh, MAX_SIGNATURE_AGE_SECONDS };
