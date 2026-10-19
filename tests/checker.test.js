const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { ProtoWallet, PrivateKey, PublicKey, Utils } = require('@bsv/sdk');
const { fakeRes } = require('./api/_helpers');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
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

// ---- GorillaPool fake. /latest answers with the current owner; the bare origin record answers with the minter,
// so a route that reads the wrong endpoint sees the mint owner. ownerOf may throw to simulate a failed lookup.
let ownerOf = () => 'nobody';
const MINTER = '17ZcPksBtq24RAC7DX1zw6ktowxXpSYvuv';
async function fakeFetch(url) {
  const m = url.match(/inscriptions\/([^/]+)(\/latest)?$/);
  if (!m[2]) return { ok: true, json: async () => ({ owner: MINTER, spend: '' }) };
  const owner = ownerOf(m[1]);
  return { ok: true, json: async () => ({ owner, spend: '' }) };
}

function stub(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
stub(path.join(__dirname, '..', 'api', '_db'), fakeDb);
stub('node-fetch', fakeFetch);

const challenge = require('../api/checker-challenge');
const claim = require('../api/checker-claim');
const status = require('../api/checker-status');
const admin = require('../api/admin-claims');
const { manifest, proofAddress } = require('../lib/checker');
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
// as with ORWallet: protocol [0, 'p 1sat'], keyID per output.
function wallet() {
  return new ProtoWallet(PrivateKey.fromRandom());
}
const derivation = origin => ({ protocolID: [0, 'p 1sat'], keyID: origin, counterparty: 'self' });

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

async function newChallenge(handle, origins) {
  const c = await call(challenge, req({ handle, origins }));
  assert.strictEqual(c.status, 200);
  return c.body;
}

// Challenge, sign each piece's message, submit. Options tamper with what gets signed or submitted.
async function claimWith(w, origins, handle = 'rainbow_fan', { submitHandle, signOrigin = o => o } = {}) {
  const c = await newChallenge(handle, origins);
  const claims = await Promise.all(origins.map(async o => ({ ...(await proofFor(w, o, c.messages[signOrigin(o)])), origin: o })));
  return call(claim, req({ nonce: c.nonce, handle: submitHandle || handle, claims }));
}
const resultOf = (r, origin) => r.body.results.find(x => x.origin === origin).result;

async function ownedBy(w, held) {
  const addrs = {};
  for (const o of held) addrs[o] = await addressFor(w, o);
  ownerOf = o => addrs[o] || 'someone-else';
  return addrs;
}

const origins = manifest.filter(p => p.claimable).map(p => p.origin);
const [o1, o2, o3, o4, o5, o6, o7] = origins;

test('spec fixture: a real ORWallet signature verifies and derives the holder address', () => {
  const pubKey = '022ce80a0ccc4c58beb9cc3abea71a0262a5fb259408745fde99128722b10041dc';
  const sig = '3045022100af6521a53855c272b4daae2fbdbce4ab77ad5e93dbe4d5423e380dd4dc630ad40220033f03dc274d427779096e8fa37793b9c3d9d09b5a9deaeb72b3bab09bb04aed';
  assert.strictEqual(proofAddress('ordinal-rainbows-test 1792386466010', pubKey, sig), '1MsEs2fzcTQagoxSSnd5Ym6P7DnfR7LgW5');
  assert.strictEqual(proofAddress('ordinal-rainbows-test 1792386466011', pubKey, sig), null);
});

test('the current holder claims a piece once; the second attempt is refused; a later sale does not revoke it', async () => {
  const w = wallet();
  const addrs = await ownedBy(w, [o1]);
  const first = await claimWith(w, [o1], '  @Rainbow_Fan ');
  assert.strictEqual(first.status, 200);
  assert.strictEqual(resultOf(first, o1), 'claimed');
  const row = tables.twonk_claims.find(c => c.origin === o1);
  assert.strictEqual(row.twetch_handle, 'Rainbow_Fan');
  assert.strictEqual(row.address, addrs[o1]);
  assert.ok(!('sig' in row) && !('pubKey' in row));

  const second = await claimWith(w, [o1], 'other');
  assert.strictEqual(resultOf(second, o1), 'already_claimed');

  ownerOf = () => 'new-buyer';
  assert.strictEqual(tables.twonk_claims.find(c => c.origin === o1).twetch_handle, 'Rainbow_Fan');
});

test('a moved piece is checked against its current owner, not the mint owner', async () => {
  const holder = wallet();
  await ownedBy(holder, [o2]);
  // The origin record says MINTER; only the /latest owner can match the holder's key.
  assert.strictEqual(resultOf(await claimWith(holder, [o2]), o2), 'claimed');
});

test('a valid signature from a key that does not own the piece is not_owner', async () => {
  const holder = wallet();
  const attacker = wallet();
  await ownedBy(holder, [o3]);
  assert.strictEqual(resultOf(await claimWith(attacker, [o3]), o3), 'not_owner');
});

test('a signature for one origin cannot claim a different origin', async () => {
  const w = wallet();
  await ownedBy(w, [o3, o4]);
  const r = await claimWith(w, [o3, o4], 'rainbow_fan', { signOrigin: o => (o === o4 ? o3 : o) });
  assert.strictEqual(resultOf(r, o4), 'invalid_signature');
});

test('a tampered handle (signed for one, submitted with another) is rejected', async () => {
  const w = wallet();
  await ownedBy(w, [o4]);
  const r = await claimWith(w, [o4], 'real_handle', { submitHandle: 'thief_handle' });
  assert.strictEqual(resultOf(r, o4), 'invalid_signature');
  assert.ok(!tables.twonk_claims.some(c => c.origin === o4));
});

test('a failed lookup is reported as unknown, not as not_owner', async () => {
  const w = wallet();
  ownerOf = () => { throw new Error('gorillapool down'); };
  assert.strictEqual(resultOf(await claimWith(w, [o5]), o5), 'unknown');
});

test('replayed, expired and unknown nonces are rejected', async () => {
  const w = wallet();
  await ownedBy(w, [o6, o7]);
  const c = await newChallenge('fan', [o6]);
  const claims = [await proofFor(w, o6, c.messages[o6])];
  assert.strictEqual((await call(claim, req({ nonce: c.nonce, handle: 'fan', claims }))).status, 200);
  assert.strictEqual((await call(claim, req({ nonce: c.nonce, handle: 'fan', claims }))).status, 401);

  const c2 = await newChallenge('fan', [o7]);
  tables.checker_nonces.find(n => n.nonce === c2.nonce).expires_at = new Date(Date.now() - 1000).toISOString();
  const claims2 = [await proofFor(w, o7, c2.messages[o7])];
  assert.strictEqual((await call(claim, req({ nonce: c2.nonce, handle: 'fan', claims: claims2 }))).status, 401);

  assert.strictEqual((await call(claim, req({ nonce: 'f'.repeat(32), handle: 'fan', claims: claims2 }))).status, 401);
});

test('piece #19 cannot be claimed and is the only piece without an origin', async () => {
  const p19 = manifest.find(p => p.piece === 19);
  assert.strictEqual(p19.origin, null);
  assert.strictEqual(p19.claimable, false);
  assert.strictEqual(origins.length, 63);
  assert.strictEqual((await call(challenge, req({ handle: 'fan', origins: [null] }))).status, 400);
});

test('a bad handle is refused before anything is signed', async () => {
  assert.strictEqual((await call(challenge, req({ handle: '<script>', origins: [o1] }))).status, 400);
});

test('status lists every claimable piece and exposes no addresses or handles', async () => {
  const r = await call(status, { method: 'GET', headers: {} });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(Object.keys(r.body).length, 63);
  assert.strictEqual(r.body[o1], 'pending');
  assert.strictEqual(r.body[o7], 'unclaimed');
  assert.ok(Object.values(r.body).every(v => ['unclaimed', 'pending', 'delivered'].includes(v)));
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
