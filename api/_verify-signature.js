const MAX_SIGNATURE_AGE_SECONDS = 300;

function buildClaimMessage(inscriptionId, bsvAddress, timestamp) {
  return `ordinalrainbows-claim:${inscriptionId}:${bsvAddress}:${timestamp}`;
}

function isTimestampFresh(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(now - ts) <= MAX_SIGNATURE_AGE_SECONDS;
}

module.exports = { buildClaimMessage, isTimestampFresh, MAX_SIGNATURE_AGE_SECONDS };
