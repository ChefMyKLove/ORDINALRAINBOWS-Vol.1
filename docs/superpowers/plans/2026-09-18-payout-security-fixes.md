# Payout Security & Correctness Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the treasury-drain security holes and money-correctness bugs in the live BSV reward/payout system (`api/claim.js`, `api/payout.js`, `api/seed-mint.js`, `scripts/allocate-sale.js`) before it is ever exercised against a real sale, and prove it works with one real low-value end-to-end test.

**Architecture:** No new services or major dependencies. Add a signed-message ownership check (using the `@bsv/sdk` `BSM` module already in `package.json`) to prove a claimant controls the ordinal's address, add a Postgres partial unique index plus atomic status-transition updates in Supabase to remove the double-payout race, gate the two admin-only endpoints (`seed-mint`, direct `payout`) behind a shared secret header, and retire the broken "pay MNEE dollars as raw BSV satoshis" path in favor of the working `bsv_claimable`/satoshis path everywhere.

**Tech Stack:** Node.js (Vercel serverless functions), `@bsv/sdk` (BSM signing/verification, already a dependency), Supabase (Postgres), Node's built-in `node:test` runner for automated tests (no new dependency).

**Spec:** No separate spec file. This plan implements the findings from a three-agent review (security, payments, devops) conducted in this project's chat session on 2026-09-18, synthesized into the Global Constraints below.

## Global Constraints

- Never log, return, or expose `TREASURY_PAY_PK` in any response, error, or client-visible location.
- All BSV amounts handled by the payout path are integer satoshis. Never send a fractional or dollar-denominated number as `satoshis`.
- MNEE token payouts are out of scope for this plan — there is no BSV21 token-transfer code in this repo. The `mnee_claimable` field is left in the schema for display/back-compat but must never be used to compute a real payout amount again.
- Both admin-only HTTP endpoints (`api/seed-mint.js`, the public handler in `api/payout.js`) must require a matching `x-admin-secret` header checked against `process.env.ADMIN_SECRET`.
- Any status transition on a `claims` row that is about to trigger a real money movement must be done as an atomic conditional `UPDATE ... WHERE status = '<expected>'` (checked via the returned row count), never a plain read-then-write.
- New automated tests use Node's built-in `node:test` + `node:assert` only — no new test framework dependency. Tests that would require mocking Supabase network calls or the BSV broadcast network are explicitly skipped in favor of the manual verification checklist in Task 7 — don't fake those out with brittle mocks.
- Client-facing error responses must never include a stack trace (`e.stack`). Log it server-side only.

---

### Task 1: Database migration — atomic claim locking

This is a **manual prerequisite** — there is no local file that creates this constraint; it must be applied directly to the Supabase project.

**Files:**
- Modify: `README_REWARDS.md:9-29` (append the migration next to the existing schema so it isn't lost)

**Interfaces:**
- Produces: a Postgres partial unique index that makes it impossible for two `claims` rows for the same `inscription_id` to be simultaneously `pending` or `broadcasting`. Task 4 and Task 5 rely on this existing before their atomic-insert / atomic-lock logic is actually race-safe (the application code alone cannot prevent two concurrent inserts without this DB-level constraint).

- [ ] **Step 1: Run this migration in the Supabase SQL editor for this project**

```sql
create unique index if not exists claims_inscription_active_idx
  on claims (inscription_id)
  where status in ('pending', 'broadcasting');
```

- [ ] **Step 2: Verify the index was created**

Run in the same SQL editor:

```sql
select indexname, indexdef from pg_indexes where tablename = 'claims';
```

Expected: a row with `indexname = 'claims_inscription_active_idx'` appears.

- [ ] **Step 3: Document the migration in README_REWARDS.md**

Open `README_REWARDS.md` and add this immediately after the existing `claims` table `create table` statement (after line 29, before the blank line and `2) Set environment variables` section):

```markdown

Run this migration once, after creating the tables above, to prevent double-payouts:

```sql
create unique index if not exists claims_inscription_active_idx
  on claims (inscription_id)
  where status in ('pending', 'broadcasting');
```
```

- [ ] **Step 4: Commit**

```bash
git add README_REWARDS.md
git commit -m "docs: document claims unique-active-index migration"
```

---

### Task 2: Admin-secret gate on seed-mint and direct payout endpoints

**Files:**
- Modify: `api/seed-mint.js:9-15`
- Modify: `api/payout.js:111-118`
- Create: `tests/api/_helpers.js`
- Create: `tests/api/admin-secret.test.js`
- Modify: `package.json:5-7` (add `test` script)

**Interfaces:**
- Produces: `tests/api/_helpers.js` exports `fakeRes()` — a fake Vercel response object `{ statusCode, body, status(code), json(payload), end(), setHeader() }` — reused by Task 4's tests.
- Consumes: new env var `process.env.ADMIN_SECRET`, set in Vercel and locally for tests.

- [ ] **Step 1: Generate a real admin secret and set it in Vercel (manual, do this yourself — don't let anyone else pick or see this value)**

```bash
openssl rand -hex 32
```

Then, for each environment, run and paste the generated value when prompted:

```bash
vercel env add ADMIN_SECRET production
vercel env add ADMIN_SECRET preview
vercel env add ADMIN_SECRET development
```

- [ ] **Step 2: Add the `test` script to package.json**

Modify `package.json`:

```json
{
  "name": "ordinalrainbows-rewards",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node api/claim.js",
    "test": "node --test tests/"
  },
  "dependencies": {
    "@bsv/sdk": "^1.4.11",
    "@supabase/supabase-js": "^2.0.0",
    "node-fetch": "^2.6.7"
  }
}
```

- [ ] **Step 3: Create the shared test helper `tests/api/_helpers.js`**

```js
function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
    setHeader() { return this; },
  };
}

module.exports = { fakeRes };
```

- [ ] **Step 4: Write the failing tests — `tests/api/admin-secret.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { fakeRes } = require('./_helpers');

process.env.ADMIN_SECRET = 'test-secret-value';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';

test('seed-mint rejects requests with no admin secret', async () => {
  const seedMint = require('../../api/seed-mint');
  const req = { method: 'POST', headers: {}, body: { inscription_id: 'x', referenced_ordinals: ['a'] } };
  const res = fakeRes();
  await seedMint(req, res);
  assert.strictEqual(res.statusCode, 401);
});

test('seed-mint rejects requests with the wrong admin secret', async () => {
  const seedMint = require('../../api/seed-mint');
  const req = { method: 'POST', headers: { 'x-admin-secret': 'wrong' }, body: { inscription_id: 'x', referenced_ordinals: ['a'] } };
  const res = fakeRes();
  await seedMint(req, res);
  assert.strictEqual(res.statusCode, 401);
});

test('direct payout endpoint rejects requests with no admin secret', async () => {
  const payout = require('../../api/payout');
  const req = { method: 'POST', headers: {}, body: { claimId: 1 } };
  const res = fakeRes();
  await payout(req, res);
  assert.strictEqual(res.statusCode, 401);
});
```

- [ ] **Step 5: Run the tests and confirm they fail**

Run: `node --test tests/api/admin-secret.test.js`
Expected: FAIL — the endpoints don't check the header yet, so responses won't be 401.

- [ ] **Step 6: Implement the gate in `api/seed-mint.js`**

Replace lines 9-15 (the top of the exported handler):

```js
module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
```

with:

```js
module.exports = async function (req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const adminSecret = req.headers['x-admin-secret'];
  if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
```

(The wildcard CORS headers are removed — this is now an admin/server-to-server-only endpoint, not one a browser should call directly.)

- [ ] **Step 7: Implement the gate in `api/payout.js`**

Replace lines 111-115:

```js
module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { claimId, inscriptionId } = req.body || {};
```

with:

```js
module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const adminSecret = req.headers['x-admin-secret'];
    if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { claimId, inscriptionId } = req.body || {};
```

(Leave `processClaimPayout` and its export untouched — `api/claim.js` calls it directly as a function, not over HTTP, so it doesn't need the header check.)

- [ ] **Step 8: Run the tests again and confirm they pass**

Run: `node --test tests/api/admin-secret.test.js`
Expected: PASS (3/3)

- [ ] **Step 9: Commit**

```bash
git add api/seed-mint.js api/payout.js tests/api/_helpers.js tests/api/admin-secret.test.js package.json
git commit -m "security: require admin secret on seed-mint and direct payout endpoints"
```

---

### Task 3: Signed-ownership verification module

**Files:**
- Create: `api/_verify-signature.js`
- Create: `tests/api/verify-signature.test.js`

**Interfaces:**
- Produces: `module.exports = { verifySignedOwnership(message, signatureB64, expectedAddress) => boolean, buildClaimMessage(inscriptionId, bsvAddress, timestamp) => string, isTimestampFresh(timestamp) => boolean, MAX_SIGNATURE_AGE_SECONDS }`. Consumed by Task 4's rewrite of `api/claim.js`.

This uses `@bsv/sdk`'s `BSM` module (already a project dependency) to verify a standard Bitcoin-signed-message compact signature by recovering the public key and comparing the derived address — proven to round-trip correctly against `@bsv/sdk`'s own `BSM.sign` during plan research.

- [ ] **Step 1: Write the failing tests — `tests/api/verify-signature.test.js`**

```js
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/api/verify-signature.test.js`
Expected: FAIL with "Cannot find module '../../api/_verify-signature'"

- [ ] **Step 3: Implement `api/_verify-signature.js`**

```js
const { BSM, Signature, BigNumber } = require('@bsv/sdk');

const MAX_SIGNATURE_AGE_SECONDS = 300;

function verifySignedOwnership(message, signatureB64, expectedAddress) {
  let sig;
  try {
    sig = Signature.fromCompact(signatureB64, 'base64');
  } catch (e) {
    return false;
  }

  const hashBuf = BSM.magicHash(message);
  const h = new BigNumber(hashBuf);

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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/api/verify-signature.test.js`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add api/_verify-signature.js tests/api/verify-signature.test.js
git commit -m "security: add BSM signed-message ownership verification"
```

---

### Task 4: Rewrite `api/claim.js` — signature check, atomic insert, BSV-only amount

**Files:**
- Modify: `api/claim.js` (full-file replacement — the changes touch most of the handler)
- Modify: `js/rewards-integration.js:1926-1930` (`claimOrdinalReward`, add wallet-signing step before the fetch)
- Create: `tests/api/claim.test.js`

**Interfaces:**
- Consumes: `verifySignedOwnership`, `buildClaimMessage`, `isTimestampFresh` from Task 3's `api/_verify-signature.js`; the unique partial index from Task 1; `fakeRes` from Task 2's `tests/api/_helpers.js`.
- Consumes: `window.walletManager.signMessage(message)` from the existing `BSVWalletManager` class (`js/rewards-integration.js:20,573`) — already implemented, calls into whichever wallet provider (Yours/HandCash/RelayX) is connected.
- Produces: request body now requires `signature` and `timestamp` fields in addition to the existing `inscriptionId`, `ordAddress`, `bsvAddress`.

- [ ] **Step 1: Write the failing tests — `tests/api/claim.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert');
const { fakeRes } = require('./_helpers');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';

test('claim rejects a request with no signature or timestamp', async () => {
  const claim = require('../../api/claim');
  const req = { method: 'POST', body: { inscriptionId: 'a'.repeat(64), ordAddress: 'addr1', bsvAddress: 'addr2' } };
  const res = fakeRes();
  await claim(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('claim rejects a malformed inscriptionId', async () => {
  const claim = require('../../api/claim');
  const req = { method: 'POST', body: { inscriptionId: 'not-a-valid-id', ordAddress: 'addr1', bsvAddress: 'addr2', signature: 'x', timestamp: Math.floor(Date.now() / 1000) } };
  const res = fakeRes();
  await claim(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('claim rejects an expired timestamp', async () => {
  const claim = require('../../api/claim');
  const old = Math.floor(Date.now() / 1000) - 9999;
  const req = { method: 'POST', body: { inscriptionId: 'a'.repeat(64), ordAddress: 'addr1', bsvAddress: 'addr2', signature: 'x', timestamp: old } };
  const res = fakeRes();
  await claim(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('claim rejects an invalid signature before touching the network', async () => {
  const claim = require('../../api/claim');
  const req = { method: 'POST', body: { inscriptionId: 'a'.repeat(64), ordAddress: 'addr1', bsvAddress: 'addr2', signature: 'bogus-signature-value', timestamp: Math.floor(Date.now() / 1000) } };
  const res = fakeRes();
  await claim(req, res);
  assert.strictEqual(res.statusCode, 403);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/api/claim.test.js`
Expected: FAIL — the current handler doesn't require/validate `signature`, `timestamp`, or `inscriptionId` format, so these requests currently proceed further than they should (likely erroring differently or hanging on a real network call).

- [ ] **Step 3: Replace `api/claim.js` in full**

```js
const supabase = require('./_db');
const fetch = require('node-fetch');
const { verifySignedOwnership, buildClaimMessage, isTimestampFresh } = require('./_verify-signature');

const INSCRIPTION_ID_RE = /^[0-9a-fA-F]{64}$/;

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { inscriptionId, ordAddress, bsvAddress, epoch, signature, timestamp } = req.body || {};
    if (!inscriptionId || !ordAddress) return res.status(400).json({ error: 'inscriptionId and ordAddress required' });
    if (!bsvAddress) return res.status(400).json({ error: 'bsvAddress (BSV payment address) required' });
    if (!signature || !timestamp) return res.status(400).json({ error: 'signature and timestamp required' });
    if (!INSCRIPTION_ID_RE.test(inscriptionId)) return res.status(400).json({ error: 'invalid inscriptionId format' });
    if (!isTimestampFresh(timestamp)) return res.status(400).json({ error: 'signature expired, please retry' });

    const expectedMessage = buildClaimMessage(inscriptionId, bsvAddress, timestamp);
    if (!verifySignedOwnership(expectedMessage, signature, ordAddress)) {
      return res.status(403).json({ error: 'invalid signature — could not verify wallet ownership' });
    }

    // Re-verify current on-chain ownership via GorillaPool (defense in depth — catches
    // the case where the ordinal was transferred after the signature's timestamp).
    const apiUrl = `https://ordinals.gorillapool.io/api/inscriptions/${inscriptionId}_0`;
    const r = await fetch(apiUrl);
    if (!r.ok) return res.status(502).json({ error: 'upstream failure' });
    const item = await r.json();
    const owner = item?.owner || null;
    if (!owner || owner.toLowerCase() !== ordAddress.toLowerCase()) {
      return res.status(403).json({ error: 'ownership mismatch' });
    }

    // BSV only — MNEE dollar amounts are never sent as satoshis. See Task 6 notes.
    const { data: alloc } = await supabase.from('reward_allocations').select('*').eq('inscription_id', inscriptionId).maybeSingle();
    if (!alloc) return res.status(404).json({ error: 'allocation not found' });
    const claimAmount = Number(alloc.bsv_claimable || 0);
    if (claimAmount <= 0) return res.status(409).json({ error: 'nothing to claim' });

    // Atomic insert — the unique partial index on claims(inscription_id) WHERE status IN
    // ('pending','broadcasting') (see Task 1) rejects a second concurrent claim for the
    // same inscription with a Postgres unique-violation, which we turn into a clean 409.
    const { data: insertedRows, error: insertErr } = await supabase
      .from('claims')
      .insert([{ inscription_id: inscriptionId, recipient_address: bsvAddress, amount: claimAmount, epoch: epoch || 'default', status: 'pending' }])
      .select();

    if (insertErr) {
      if (insertErr.code === '23505') {
        return res.status(409).json({ error: 'already claimed, payout pending' });
      }
      return res.status(500).json({ error: insertErr.message });
    }
    const newClaim = insertedRows && insertedRows[0];

    if (process.env.AUTO_PAYOUT === 'false') {
      return res.json({ success: true, message: 'claim registered. payout pending (AUTO_PAYOUT disabled).' });
    }

    try {
      const { processClaimPayout } = require('./payout');
      const txid = await processClaimPayout(newClaim.id);
      console.log('[api/claim] payout success — claimId:', newClaim.id, 'txid:', txid);
      return res.status(200).json({ success: true, txid: txid, message: 'BSV sent!' });
    } catch (e) {
      console.error('[api/claim] payout failed — claimId:', newClaim.id, 'error:', e.message, e.stack);
      return res.status(200).json({ success: false, message: e.message });
    }
  } catch (err) {
    console.error('[api/claim] error', err);
    res.status(500).json({ error: 'internal' });
  }
};
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/api/claim.test.js`
Expected: PASS (4/4) — all four rejections happen before any Supabase or GorillaPool call, so they run fine offline.

- [ ] **Step 5: Add the wallet-signing step to `js/rewards-integration.js`**

Replace lines 1926-1930:

```js
        const btn = document.getElementById('card-3d-claim-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Claiming...'; }

        const body = { inscriptionId, nftId, ordAddress: window.currentOrdAddress, bsvAddress: window.currentWalletAddress, epoch: 'default' };
        const resp = await fetch('/api/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
```

with:

```js
        const btn = document.getElementById('card-3d-claim-btn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Claiming...'; }

        const timestamp = Math.floor(Date.now() / 1000);
        const message = `ordinalrainbows-claim:${inscriptionId}:${window.currentWalletAddress}:${timestamp}`;
        let signature;
        try {
            const rawSig = await window.walletManager.signMessage(message);
            console.log('[CLAIM] raw signMessage() result:', rawSig);
            // Different wallet providers may return a raw base64 string, or an object
            // like { signature } / { sig }. This normalizes the common shapes — verify
            // against your actual connected wallet in Task 7's manual test and adjust
            // this line if the server rejects a real signature as invalid.
            signature = (typeof rawSig === 'string') ? rawSig : (rawSig?.signature || rawSig?.sig);
        } catch (sigErr) {
            console.error('[CLAIM] signature failed', sigErr);
            alert('Wallet signature required to verify ownership: ' + sigErr.message);
            if (btn) { btn.disabled = false; btn.textContent = '✨ Claim Rewards'; }
            return;
        }

        const body = { inscriptionId, nftId, ordAddress: window.currentOrdAddress, bsvAddress: window.currentWalletAddress, epoch: 'default', signature, timestamp };
        const resp = await fetch('/api/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
```

- [ ] **Step 6: Commit**

```bash
git add api/claim.js js/rewards-integration.js tests/api/claim.test.js
git commit -m "security: verify signed wallet ownership and lock claims atomically"
```

---

### Task 5: Rewrite `api/payout.js` — atomic lock, loud failure handling, fetch timeouts

**Files:**
- Modify: `api/payout.js` (full-file replacement)

**Interfaces:**
- Produces: `processClaimPayout(claimId)` now atomically transitions a claim from `'pending'` to `'broadcasting'` before touching the network, and to `'failed'` if the broadcast throws — closing the double-payout race from the payout side (Task 4 closes it from the claim-creation side; both matter because the public `/api/payout` HTTP handler can also invoke `processClaimPayout` directly).
- No automated test for this task — `processClaimPayout` performs real Supabase and BSV-network calls that aren't worth mocking for a project this size. It's proven correct by the manual concurrency test in Task 7, Step 10.

- [ ] **Step 1: Replace `api/payout.js` in full**

```js
/*
  api/payout.js
  Sends BSV directly from the treasury wallet to the claimant.
  Requires env vars:
    TREASURY_PAY_PK   — WIF private key for address 1r1rJXu5znptbcSKYuFW74eDZ3zJtsAwb
    ARC_API_KEY       — (optional) Taal ARC API key
*/

const { PrivateKey, Transaction, P2PKH, ARC } = require('@bsv/sdk');
const supabase = require('./_db');
const fetch    = require('node-fetch');

const TREASURY_ADDRESS = '1r1rJXu5znptbcSKYuFW74eDZ3zJtsAwb';
const FETCH_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function sendBSVToAddress(toAddress, satoshis) {
  const wif = process.env.TREASURY_PAY_PK;
  console.log('[payout] sendBSVToAddress called — TREASURY_PAY_PK:', wif ? `set (length ${wif.length})` : 'UNDEFINED');
  if (!wif) throw new Error('TREASURY_PAY_PK not set in env');

  const privKey = PrivateKey.fromWif(wif);

  const utxoUrl = `https://api.whatsonchain.com/v1/bsv/main/address/${TREASURY_ADDRESS}/unspent/all`;
  console.log('[payout] fetching UTXOs from:', utxoUrl);
  const utxoResp = await fetchWithTimeout(utxoUrl, {
    headers: { 'Authorization': process.env.WOC_API_KEY || '' },
  });
  if (!utxoResp.ok) throw new Error(`WoC UTXO fetch failed: ${utxoResp.status} ${await utxoResp.text()}`);
  const utxoData = await utxoResp.json();
  console.log('[payout] UTXO response:', utxoResp.status, JSON.stringify(utxoData));
  const utxos = utxoData.result || [];
  if (utxos.length === 0) throw new Error('No UTXOs found for treasury wallet');

  const tx = new Transaction();

  for (const utxo of utxos) {
    const hexResp = await fetchWithTimeout(`https://api.whatsonchain.com/v1/bsv/main/tx/${utxo.tx_hash}/hex`);
    if (!hexResp.ok) throw new Error(`WoC raw-tx fetch failed for ${utxo.tx_hash}: ${hexResp.status}`);
    const rawHex = await hexResp.text();
    const sourceTx = Transaction.fromHex(rawHex);

    tx.addInput({
      sourceTXID: utxo.tx_hash,
      sourceOutputIndex: utxo.tx_pos,
      sourceTransaction: sourceTx,
      unlockingScriptTemplate: new P2PKH().unlock(privKey),
    });
  }

  tx.addOutput({
    lockingScript: new P2PKH().lock(toAddress),
    satoshis,
  });

  tx.addOutput({
    lockingScript: new P2PKH().lock(TREASURY_ADDRESS),
    change: true,
  });

  await tx.fee();
  await tx.sign();

  const result = await tx.broadcast(new ARC('https://arc.taal.com', process.env.TAAL_API_KEY));

  console.log('[payout] broadcast result:', JSON.stringify(result));

  const txid = (typeof result === 'string' && result.length === 64) ? result
    : (typeof result?.txid === 'string' && result.txid.length > 0) ? result.txid
    : (typeof result?.id   === 'string' && result.id.length   > 0) ? result.id
    : (typeof result?.data?.txid === 'string' && result.data.txid.length > 0) ? result.data.txid
    : null;

  if (!txid) throw new Error(`Broadcast returned no valid txid. Raw result: ${JSON.stringify(result)}`);
  return txid;
}

async function processClaimPayout(claimId) {
  if (!claimId) throw new Error('claimId required');

  // Atomically claim the row: only succeeds if it's still 'pending'. This closes the
  // double-payout race — two concurrent callers can never both win this update, because
  // the second one's WHERE clause matches zero rows once the first has flipped the status.
  const { data: lockedRows, error: lockErr } = await supabase
    .from('claims')
    .update({ status: 'broadcasting' })
    .eq('id', claimId)
    .eq('status', 'pending')
    .select();
  if (lockErr) throw new Error(`failed to lock claim: ${lockErr.message}`);
  if (!lockedRows || lockedRows.length === 0) {
    throw new Error('claim not pending (already processed or does not exist)');
  }
  const claim = lockedRows[0];
  if (!claim.recipient_address) throw new Error('no recipient address');

  const satoshis = Number(claim.amount || 0);
  if (satoshis <= 0) throw new Error('invalid claim amount (must be satoshis > 0)');

  let txid;
  try {
    txid = await sendBSVToAddress(claim.recipient_address, satoshis);
  } catch (broadcastErr) {
    await supabase.from('claims').update({ status: 'failed' }).eq('id', claim.id).eq('status', 'broadcasting');
    throw broadcastErr;
  }

  const { error: sentErr } = await supabase
    .from('claims')
    .update({ status: 'sent', txid, claimed_at: new Date().toISOString() })
    .eq('id', claim.id);
  if (sentErr) {
    console.error('[payout] CRITICAL: broadcast succeeded but DB update failed. claimId:', claim.id, 'txid:', txid, 'error:', sentErr.message);
    throw new Error(`payout sent (txid ${txid}) but failed to record — manual reconciliation needed: ${sentErr.message}`);
  }

  if (claim.inscription_id) {
    await supabase.from('reward_allocations')
      .update({ bsv_claimable: 0 })
      .eq('inscription_id', claim.inscription_id);
  }

  return txid;
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const adminSecret = req.headers['x-admin-secret'];
    if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { claimId, inscriptionId } = req.body || {};
    if (!claimId && !inscriptionId)
      return res.status(400).json({ error: 'claimId or inscriptionId required' });

    let claim;
    if (claimId) {
      const { data } = await supabase.from('claims').select('*').eq('id', claimId).maybeSingle();
      claim = data;
    } else {
      const { data } = await supabase.from('claims').select('*')
        .eq('inscription_id', inscriptionId).eq('status', 'pending').limit(1).maybeSingle();
      claim = data;
    }

    if (!claim) return res.status(404).json({ error: 'claim not found' });
    const txid = await processClaimPayout(claim.id);
    return res.json({ success: true, txid });
  } catch (err) {
    console.error('[api/payout] error', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports.processClaimPayout = processClaimPayout;
```

- [ ] **Step 2: Confirm the admin-secret tests from Task 2 still pass (this file was touched again)**

Run: `node --test tests/api/admin-secret.test.js`
Expected: PASS (3/3)

- [ ] **Step 3: Commit**

```bash
git add api/payout.js
git commit -m "fix: atomic claim locking, loud failure handling, and fetch timeouts in payout"
```

---

### Task 6: Fix `scripts/allocate-sale.js` — allocate real satoshis, not MNEE dollars

**Files:**
- Modify: `scripts/allocate-sale.js` (full-file replacement)

**Interfaces:**
- Produces: the script now writes `bsv_claimable`/`bsv_total_earned` (real satoshis) instead of `mnee_claimable`/`total_earned` (a broken dollar-multiplier figure) — consistent with what `api/claim.js` (Task 4) actually pays out.

- [ ] **Step 1: Replace `scripts/allocate-sale.js` in full**

```js
/*
  allocate-sale.js
  Usage: node scripts/allocate-sale.js <inscriptionId> <creator_cut_satoshis> [epoch]
  Example: node scripts/allocate-sale.js 704a7653a4d8c4d7bf356e1d2aeb0f03 500000 "print-2026-02"

  This script adds creator_cut_satoshis * rarity_multiplier (rounded down) to the
  inscription's bsv_claimable balance, in real satoshis.

  NOTE: MNEE token payouts are not implemented anywhere in this project (there is no
  BSV21 token-transfer code) — enter the actual satoshi amount of the creator's cut
  from the print sale here, not a dollar figure.

  Requires SUPABASE_URL and SUPABASE_SERVICE_KEY env variables.
*/

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scripts/allocate-sale.js <inscriptionId> <creator_cut_satoshis> [epoch]');
    process.exit(1);
  }
  const [inscriptionId, satsStr, epoch = 'default'] = args;
  const creatorCutSats = Number(satsStr);
  if (!Number.isFinite(creatorCutSats) || creatorCutSats <= 0) {
    console.error('Invalid amount — must be a positive number of satoshis'); process.exit(1);
  }

  const { data: alloc } = await supabase.from('reward_allocations').select('*').eq('inscription_id', inscriptionId).maybeSingle();
  if (!alloc) {
    console.error('Allocation row not found for', inscriptionId); process.exit(1);
  }

  const multiplier = alloc.rarity_multiplier || 0.05;
  const added = Math.floor(creatorCutSats * Number(multiplier));
  const newClaimable = Number(alloc.bsv_claimable || 0) + added;
  const newTotal = Number(alloc.bsv_total_earned || 0) + added;

  const { error } = await supabase.from('reward_allocations').update({ bsv_claimable: newClaimable, bsv_total_earned: newTotal, updated_at: new Date().toISOString() }).eq('inscription_id', inscriptionId);
  if (error) { console.error('Supabase update error', error.message); process.exit(1); }

  const { error: ie } = await supabase.from('claims').insert([{ inscription_id: inscriptionId, recipient_address: null, amount: added, epoch, status: 'allocated' }]);
  if (ie) console.warn('audit insert error', ie.message);

  console.log(`Allocated ${added} satoshis to ${inscriptionId} (multiplier ${multiplier})`);
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Commit**

```bash
git add scripts/allocate-sale.js
git commit -m "fix: allocate-sale writes real satoshis to bsv_claimable, not MNEE dollars"
```

---

### Task 7: Manual end-to-end verification (the real test)

No new code in this task — this is the checklist that proves Tasks 1-6 actually work together, using a Preview deployment first and your own wallet/funds at negligible amounts before touching production.

**Files:** none (verification only)

- [ ] **Step 1: Deploy everything to a Preview deployment (not production)**

```bash
vercel
```

Note the preview URL it prints.

- [ ] **Step 2: Confirm `ADMIN_SECRET` is set for Preview**

```bash
vercel env ls
```

Expected: `ADMIN_SECRET` listed with `Preview` in its environments column (added in Task 2, Step 1).

- [ ] **Step 3: Admin-secret test against the live preview endpoint**

```bash
curl -i -X POST https://<preview-url>/api/payout -H 'Content-Type: application/json' -d '{"claimId":1}'
```

Expected: HTTP 401, body `{"error":"unauthorized"}` (no `x-admin-secret` header sent).

- [ ] **Step 4: Seed a tiny real allocation for an inscription you personally own**

```bash
SUPABASE_URL=<your-url> SUPABASE_SERVICE_KEY=<your-service-key> node scripts/allocate-sale.js <your-inscriptionId> 2000
```

Then check it landed:

```bash
curl https://<preview-url>/api/rewards?inscriptionId=<your-inscriptionId>
```

Expected: `bsv_claimable` shows roughly `2000 * <your NFT's rarity_multiplier>` (e.g. 100 sats for a Common at 0.05).

- [ ] **Step 5: Claim it for real, using your real connected wallet, on the preview site**

Open the preview URL, connect your wallet, open that NFT's card, click "Claim Rewards". Open the browser devtools console first — you'll see the `[CLAIM] raw signMessage() result:` log added in Task 4. Confirm it's a usable string; if the server rejects it as an invalid signature (403), inspect that logged shape and adjust the extraction line in `js/rewards-integration.js` (added in Task 4, Step 5) to match your wallet's actual return format, then redeploy and retry.

- [ ] **Step 6: Watch the logs live during the claim**

```bash
vercel logs <preview-url> --follow
```

Expected: exactly one `[payout] broadcast result:` log line, and the claim response in the browser includes a real `txid`.

- [ ] **Step 7: Confirm the BSV actually arrived**

Look up the `txid` on WhatsOnChain (or check your wallet's balance/history) and confirm the payment landed at the `bsvAddress` you claimed with.

- [ ] **Step 8: Confirm the balance was zeroed**

```bash
curl https://<preview-url>/api/rewards?inscriptionId=<your-inscriptionId>
```

Expected: `bsv_claimable` is now `0`.

- [ ] **Step 9: Replay test — prove the same claim can't be paid twice**

Using the browser devtools Network tab, copy the exact request body from Step 5's `/api/claim` call, then replay it with curl:

```bash
curl -i -X POST https://<preview-url>/api/claim -H 'Content-Type: application/json' -d '<the copied body>'
```

Expected: HTTP 400 `signature expired` (if enough time has passed) or, if replayed quickly, HTTP 409 `nothing to claim` (since `bsv_claimable` is already 0 from Step 8) — either way, no second payout.

- [ ] **Step 10: Concurrency test — prove two simultaneous claims can't both pay out**

Seed a fresh small allocation (repeat Step 4 with a new amount), get a signed claim body for it the same way as Step 5, then fire it twice at once:

```bash
curl -X POST https://<preview-url>/api/claim -H 'Content-Type: application/json' -d '<body>' &
curl -X POST https://<preview-url>/api/claim -H 'Content-Type: application/json' -d '<body>' &
wait
```

Expected: exactly one response contains a real `txid`; the other returns a 409 or a "claim not pending" failure message. Check the treasury's transaction history if unsure — there must be only one new outgoing payment for this test.

- [ ] **Step 11: Kill-switch test**

```bash
vercel env add AUTO_PAYOUT preview
```

(enter `false` when prompted), then redeploy preview (`vercel`). Seed one more tiny allocation, claim it. Expected: response says `"payout pending (AUTO_PAYOUT disabled)"` and the logs show no `[payout] broadcast result` line. Afterward, remove the flag (or set it back) so production doesn't inherit `AUTO_PAYOUT=false`:

```bash
vercel env rm AUTO_PAYOUT preview
```

- [ ] **Step 12: Only after Steps 3-11 all pass, deploy to production**

```bash
vercel --prod
```

- [ ] **Step 13: Confirm production env vars are correct**

```bash
vercel env ls
```

Expected: `ADMIN_SECRET` present for Production; `AUTO_PAYOUT` either absent or not set to `false` for Production.

- [ ] **Step 14: One final tiny real claim against production itself**

Repeat Steps 4-8 directly against `ordinalrainbows.com` before telling anyone the feature is live — production Supabase and the production treasury address are what actually matter.
