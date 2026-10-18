const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { ProtoWallet, PrivateKey, PublicKey, Utils } = require('@bsv/sdk');
const { fakeRes } = require('./api/_helpers');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.CHECKER_SESSION_SECRET = 'x'.repeat(40);
process.env.ADMIN_TOKEN = 'admin-token-for-tests';

// ---- In-memory Supabase fake (only the query shapes the checker uses) ----
const PK = { checker_nonces: 'nonce', twonk_claims: 'origin' };
const tables = { checker_nonces: [], twonk_claims: [], reward_allocations: [] };

function query(table) {
  const filters = [];
  let op = 'select';
  let values = null;
  const match = row => filters.every(f => f(row));
  const builder = {
    select() { return builder; },
    order() { return builder; },
    insert(rows) { op = 'insert'; values = rows; return builder; },
    update(v) { op = 'update'; values = v; return builder; },
    eq(col, v) { filters.push(r => r[col] === v); return builder; },
    gt(col, v) { filters.push(r => r[col] > v); return builder; },
    in(col, vs) { filters.push(r => vs.includes(r[col])); return builder; },
    maybeSingle() { return Promise.resolve({ data: tables[table].filter(match)[0] || null, error: null }); },
    then(resolve) {
      const rows = tables[table];
      if (op === 'insert') {
        for (const row of values) {
          if (rows.some(r => r[PK[table]] === row[PK[table]])) return resolve({ error: { code: '23505', message: 'duplicate' } });
          rows.push({ used: false, status: 'pending', claimed_at: new Date().toISOString(), ...row });
        }
        return resolve({ data: values, error: null });
      }
      const hit = rows.filter(match);
      if (op === 'update') hit.forEach(r => Object.assign(r, values));
      return resolve({ data: hit.map(r => ({ ...r })), error: null });
    },
  };
  return builder;
}
const fakeDb = { from: query };

// ---- GorillaPool fake: ownerOf(origin) returns an address, or throws to simulate a failed lookup ----
let ownerOf = () => 'nobody';
async function fakeFetch(url) {
  const origin = url.match(/inscriptions\/([^/]+)\/history/)[1];
  const owner = ownerOf(origin);
  return { ok: true, json: async () => [{ owner: 'minter', spend: 'abc' }, { owner, spend: '' }] };
}

function stub(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
stub(path.join(__dirname, '..', 'api', '_db'), fakeDb);
stub('node-fetch', fakeFetch);

const challenge = require('../api/checker-challenge');
const verify = require('../api/checker-verify');
const claim = require('../api/checker-claim');
const admin = require('../api/admin-claims');
const { manifest } = require('../lib/checker');
const { validateManifest } = require('../scripts/build-manifest');

let ipCounter = 0;
function req(body, headers = {}) {
  return { method: 'POST', body, headers: { 'x-forwarded-for': `10.0.0.${++ipCounter}`, ...headers } };
}

async function call(handler, r) {
  const res = fakeRes();
  const headers = {};
  res.setHeader = (k, v) => { headers[k.toLowerCase()] = v; return res; };
  await handler(r, res);
  return { status: res.statusCode, body: res.body, headers };
}

// A BRC-100 wallet (the SDK's reference implementation). Each piece sits on its own derived key,
// as in Yours: protocol [0, 'onesat'], keyID per output.
function wallet() {
  return new ProtoWallet(PrivateKey.fromRandom());
}
const derivation = origin => ({ protocolID: [0, 'onesat'], keyID: origin, counterparty: 'self' });

async function proofFor(w, origin, message) {
  const args = derivation(origin);
  const { signature } = await w.createSignature({ ...args, data: Utils.toArray(message, 'utf8') });
  const { publicKey } = await w.getPublicKey({ ...args, forSelf: true });
  return { origin, pubKey: publicKey, sig: Utils.toHex(signature) };
}

async function addressFor(w, origin) {
  const { publicKey } = await w.getPublicKey({ ...derivation(origin), forSelf: true });
  return PublicKey.fromString(publicKey).toAddress();
}

async function newChallenge() {
  const c = await call(challenge, req({}));
  assert.strictEqual(c.status, 200);
  return c.body;
}

async function verifyWith(nonce, proofs) {
  return call(verify, req({ nonce, proofs }));
}

const origins = manifest.filter(p => p.origin).map(p => p.origin);
const [o1, o2, o3] = origins;

test('valid proof from the key that holds a piece returns it and sets a session', async () => {
  const w = wallet();
  const holder = await addressFor(w, o1);
  ownerOf = o => (o === o1 ? holder : 'someone-else');
  const c = await newChallenge();
  const r = await verifyWith(c.nonce, [await proofFor(w, o1, c.message)]);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.pieces.map(p => p.origin), [o1]);
  assert.strictEqual(r.body.pieces[0].claim, 'unclaimed');
  assert.match(r.headers['set-cookie'], /^checker_session=.+HttpOnly; Secure; SameSite=Lax/);
});

test('replayed nonce is rejected', async () => {
  const w = wallet();
  const c = await newChallenge();
  const proofs = [await proofFor(w, o1, c.message)];
  assert.strictEqual((await verifyWith(c.nonce, proofs)).status, 200);
  assert.strictEqual((await verifyWith(c.nonce, proofs)).status, 401);
});

test('expired nonce is rejected', async () => {
  const c = await newChallenge();
  tables.checker_nonces.find(n => n.nonce === c.nonce).expires_at = new Date(Date.now() - 1000).toISOString();
  assert.strictEqual((await verifyWith(c.nonce, [])).status, 401);
});

test('unknown nonce is rejected', async () => {
  assert.strictEqual((await verifyWith('f'.repeat(32), [])).status, 401);
});

test('a valid signature from a key that does not hold the piece is not counted', async () => {
  const holder = wallet();
  const attacker = wallet();
  const holderAddr = await addressFor(holder, o1);
  ownerOf = () => holderAddr;
  const c = await newChallenge();
  const r = await verifyWith(c.nonce, [await proofFor(attacker, o1, c.message)]);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.pieces, []);
  assert.strictEqual(r.body.counts.not_held, 1);
});

test('a signature over a different message is rejected', async () => {
  const w = wallet();
  const c = await newChallenge();
  const r = await verifyWith(c.nonce, [await proofFor(w, o1, 'some other message')]);
  assert.strictEqual(r.status, 401);
});

test('wallet holding nothing sees no pieces', async () => {
  const c = await newChallenge();
  const r = await verifyWith(c.nonce, []);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.pieces, []);
});

test('a failed lookup is reported as unknown, not as not held', async () => {
  const w = wallet();
  ownerOf = () => { throw new Error('gorillapool down'); };
  const c = await newChallenge();
  const r = await verifyWith(c.nonce, [await proofFor(w, o1, c.message)]);
  assert.strictEqual(r.body.counts.unknown, 1);
  assert.deepStrictEqual(r.body.unknown, [manifest.find(p => p.origin === o1).piece]);
});

test('claim without a session cookie is refused', async () => {
  const r = await call(claim, req({ origin: o1, handle: 'someone' }));
  assert.strictEqual(r.status, 401);
});

async function sessionFor(w, held) {
  const addrs = {};
  for (const o of held) addrs[o] = await addressFor(w, o);
  ownerOf = o => addrs[o] || 'someone-else';
  const c = await newChallenge();
  const proofs = await Promise.all(held.map(o => proofFor(w, o, c.message)));
  const v = await verifyWith(c.nonce, proofs);
  assert.strictEqual(v.body.counts.held, held.length);
  return { cookie: v.headers['set-cookie'].split(';')[0], addrs };
}

test('a held piece can be claimed once; the second attempt is refused; a later sale does not revoke it', async () => {
  const w = wallet();
  const { cookie, addrs } = await sessionFor(w, [o2]);

  const first = await call(claim, req({ origin: o2, handle: '  @Rainbow_Fan ' }, { cookie }));
  assert.strictEqual(first.status, 200);
  const row = tables.twonk_claims.find(c => c.origin === o2);
  assert.strictEqual(row.twetch_handle, 'Rainbow_Fan');
  assert.strictEqual(row.address, addrs[o2]);

  const second = await call(claim, req({ origin: o2, handle: 'other' }, { cookie }));
  assert.strictEqual(second.status, 409);

  ownerOf = () => 'new-buyer';
  assert.strictEqual(tables.twonk_claims.find(c => c.origin === o2).address, addrs[o2]);
});

test('a session cannot claim a piece it did not prove', async () => {
  const w = wallet();
  const other = wallet();
  const { cookie } = await sessionFor(w, [o3]);
  const otherAddr = await addressFor(other, o1);
  ownerOf = o => (o === o1 ? otherAddr : 'someone-else');
  const r = await call(claim, req({ origin: o1, handle: 'sneaky' }, { cookie }));
  assert.strictEqual(r.status, 403);
});

test('claim with a bad handle is refused', async () => {
  const w = wallet();
  const { cookie } = await sessionFor(w, [o3]);
  const r = await call(claim, req({ origin: o3, handle: '<script>' }, { cookie }));
  assert.strictEqual(r.status, 400);
});

test('tampered session cookie is refused', async () => {
  const r = await call(claim, req({ origin: o1, handle: 'x' }, { cookie: 'checker_session=eyJoIjpbXX0.forged' }));
  assert.strictEqual(r.status, 401);
});

test('non-admin cannot reach admin routes', async () => {
  for (const headers of [{}, { 'x-admin-token': 'wrong' }]) {
    const r = await call(admin, { method: 'GET', query: {}, headers });
    assert.strictEqual(r.status, 401);
  }
});

test('admin can list and mark a claim delivered', async () => {
  const headers = { 'x-admin-token': process.env.ADMIN_TOKEN };
  const list = await call(admin, { method: 'GET', query: { status: 'pending' }, headers });
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.claims.length >= 1);
  const done = await call(admin, { method: 'POST', body: { origin: list.body.claims[0].origin }, headers });
  assert.strictEqual(done.status, 200);
  assert.strictEqual(tables.twonk_claims[0].status, 'delivered');
});

test('rewards claim checks the current holder, not the original minter', async () => {
  const rewardsClaim = require('../api/claim');
  const { buildClaimMessage } = require('../api/_verify-signature');
  const inscriptionId = o1.replace(/_0$/, '');
  const holder = wallet();
  const minter = wallet();
  const holderAddr = await addressFor(holder, o1);
  ownerOf = () => holderAddr; // fake history: [minter (spent), current holder (unspent)]

  async function attempt(w) {
    const ts = Math.floor(Date.now() / 1000);
    const bsvAddress = '1PayoutAddressForTestsXXXXXXXXXXXX';
    const { pubKey, sig } = await proofFor(w, o1, buildClaimMessage(inscriptionId, bsvAddress, ts));
    return call(rewardsClaim, req({ inscriptionId, bsvAddress, pubKey, sig, timestamp: ts }));
  }

  // Holder passes the ownership check and reaches the allocation lookup (none seeded → 404).
  assert.strictEqual((await attempt(holder)).status, 404);
  // A valid signature from a key that is not the current holder is refused.
  assert.strictEqual((await attempt(minter)).status, 403);
});

test('payout deducts only the paid amount from an allocation, never below zero', async () => {
  const { deductClaimable } = require('../api/payout');
  tables.reward_allocations.push({ inscription_id: 'piece-a', bsv_claimable: 5000 }, { inscription_id: 'piece-b', bsv_claimable: 700 });

  // A new allocation landed after the claim (claim was 3000, balance is now 5000): 2000 must survive.
  assert.strictEqual(await deductClaimable('piece-a', 3000), true);
  assert.strictEqual(tables.reward_allocations.find(r => r.inscription_id === 'piece-a').bsv_claimable, 2000);

  assert.strictEqual(await deductClaimable('piece-b', 1000), true);
  assert.strictEqual(tables.reward_allocations.find(r => r.inscription_id === 'piece-b').bsv_claimable, 0);

  assert.strictEqual(await deductClaimable('missing-piece', 100), false);
});

test('manifest has 64 pieces with unique origins and fails on a null origin unless allowlisted', () => {
  assert.strictEqual(manifest.length, 64);
  assert.deepStrictEqual(validateManifest(manifest), []);
  const broken = manifest.map(p => (p.piece === 5 ? { ...p, origin: null } : p));
  assert.match(validateManifest(broken).join(), /piece 5 .* has no origin/);
  const dup = manifest.map(p => (p.piece === 6 ? { ...p, origin: o1 } : p));
  assert.match(validateManifest(dup).join(), /duplicate origin/);
});
