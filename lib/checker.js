// Shared helpers for the holder checker routes.
const fetch = require('node-fetch');
const { PublicKey, Signature, Utils } = require('@bsv/sdk');
const manifest = require('../data/collection.json');

const SITE = 'ordinalrainbows.com';
const HANDLE_RE = /^[A-Za-z0-9_.-]{1,32}$/;
const LOOKUP_CONCURRENCY = 8;

function buildMessage(nonce) {
  return `${SITE} holder check\nNonce: ${nonce}`;
}

// Trim, strip a leading @, then allow 1-32 of letters, digits, _ . -
function normalizeHandle(raw) {
  if (typeof raw !== 'string') return null;
  const h = raw.trim().replace(/^@/, '');
  return HANDLE_RE.test(h) ? h : null;
}

// A piece proof is a BRC-100 createSignature over the challenge message (ECDSA over sha256(message), DER hex)
// plus the signing public key. Returns the key's address if the signature is valid, else null.
function proofAddress(message, pubKey, sig) {
  try {
    if (typeof pubKey !== 'string' || typeof sig !== 'string') return null;
    const pub = PublicKey.fromString(pubKey);
    if (!pub.verify(Utils.toArray(message, 'utf8'), Signature.fromDER(sig, 'hex'))) return null;
    return pub.toAddress();
  } catch (e) {
    return null;
  }
}

// Current holder = owner of the one unspent entry in the inscription's history.
// Note: /inscriptions/{origin} alone returns the mint output, whose owner is the minter, not today's holder.
async function lookupOwner(origin) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`https://ordinals.gorillapool.io/api/inscriptions/${origin}/history`, { timeout: 8000 });
      if (!r.ok) continue;
      const history = await r.json();
      const live = Array.isArray(history) && history.find(t => !t.spend);
      if (live) return { status: 'ok', owner: live.owner || null };
    } catch (e) {
      // network error or timeout: retry once, then report unknown
    }
  }
  return { status: 'unknown' };
}

// Runs fn over items with at most LOOKUP_CONCURRENCY in flight, keeping order.
async function mapLimited(items, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: LOOKUP_CONCURRENCY }, worker));
  return results;
}

// ponytail: in-memory, so limits are per serverless instance, not global. Move to a Supabase counter if abused.
const hits = new Map();
function rateLimited(req, bucket, max, windowMs = 60 * 1000) {
  const ip = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim() || 'unknown';
  const key = bucket + ':' + ip;
  const now = Date.now();
  if (hits.size > 10000) hits.clear();
  const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

module.exports = { manifest, buildMessage, normalizeHandle, proofAddress, lookupOwner, mapLimited, rateLimited };
