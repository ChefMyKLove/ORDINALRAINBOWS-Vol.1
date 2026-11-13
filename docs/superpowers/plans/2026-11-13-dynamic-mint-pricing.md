# Dynamic Mint Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat per-mint price in the Rainbow Legends mint with a per-card bump-and-decay bonding curve (settled server-side, no price locks), plus a token/OG-holder-gated early-access window, while leaving the existing pooled rarity-weighted holder-reward crediting untouched.

**Architecture:** A pure BigInt price-curve library (`lib/curve.js`, ported from `canon.mjs`) backs a settlement module (`lib/settle-card.js`) that does an optimistic compare-and-set against one Postgres row per card. `api/mint-complete.js` calls settlement before crediting rewards instead of trusting a client-supplied amount. A new read-only `api/quote.js` lets the frontend show a live price and gate the mint button during the early-access window, using a new `lib/eligibility.js` that checks OG-inscription or `$OR`-token holdings by address.

**Tech Stack:** Node.js (CommonJS, matches this repo — no `"type": "module"` in `package.json`), `node:test`, Supabase/Postgres, WhatsOnChain API, existing `@supabase/supabase-js` client.

**Spec:** `docs/superpowers/specs/2026-11-12-dynamic-mint-pricing-design.md`

## Global Constraints

- Integer/BigInt math only for price and split calculations — never float/double, anywhere (spec, Price engine).
- Real config: P0 = 6,400,000 sats, floor = 640,000 sats, bump ×1.1/buy, decay ×0.9975/block, window = 1,000 blocks, early window = 100 blocks (spec, Decisions).
- Dust-test config: P0 = 2,000 sats, floor = 200 sats, same ratios and windows (spec, Decisions).
- `card_curves.p_num`/`p_den` are stored as `text`, parsed with `BigInt()` — never Postgres `numeric`, which PostgREST serializes as a JSON number and silently collapses above 2^53 (spec, §1 and resolved Risk #2).
- No direct-to-holder-wallet payout, no price-lock/quote reservation, no reserved editions (spec, Non-goals).
- Early-access eligibility: holds ≥ 1 of the 64 Vol.1 OG inscriptions **OR** ≥ 1 `$OR` (token id `b92468588bfce6a43909733ae97eaed8c0fcafe8d2216cd7df7ce9ea9f71a9df_1`) — logical OR (spec, Decisions).
- Settlement never trusts a client-supplied block height; always fetches chain tip server-side at verify time (spec, resolved Risk #4).
- On the existing reward-crediting failure path, the buyer-facing message is plain `"Minted ✓"` with no mention of rewards/registration/fixes — **already fixed** in `ordinal gif/src/main.js` (see git history; not a task in this plan).
- New Supabase schema is proposed as SQL for review, never applied silently (same convention as this session's `used_payments` migration).

## Review Focus

- A mint attempted before a card's `start_block` (window not open yet) must be cleanly rejected, not silently priced or crashed.
- A mint attempted after `start_block + window_blocks` (window closed) must be cleanly rejected even though the payment already landed on-chain.
- A request hitting the API directly during the early window from an ineligible address (bypassing the disabled UI button) must be hard-rejected server-side — the client-side disable is not the enforcement.
- A payment that was sufficient when quoted but falls short of the price by the time settlement runs (another buyer's mint landed first) must be rejected as retryable, not silently accepted at the old price.
- The same `payment_txid` POSTed twice (for the same or a different card/inscription) must be rejected by `card_editions`'s unique constraint, not double-settled or double-credited.

---

### Task 1: Price curve library

**Files:**
- Create: `lib/curve.js`
- Test: `tests/lib/curve.test.js`

**Interfaces:**
- Produces: `REAL_CONFIG`, `DUST_CONFIG` (frozen config objects: `{ p0, floor, bumpNum, bumpDen, decayNum, decayDen, windowBlocks, earlyWindowBlocks }`, all `BigInt`), `openState(startBlock, cfg) -> { pNum, pDen, hLast }`, `priceAt(state, h, cfg) -> BigInt`, `settleBuy(state, h, cfg) -> { price, state }`, `isOpen(startBlock, h, cfg) -> boolean`, `isEarlyWindow(startBlock, h, cfg) -> boolean`.

- [ ] **Step 1: Write the failing tests**

```js
const { openState, priceAt, settleBuy, isOpen, isEarlyWindow, REAL_CONFIG } = require('../../lib/curve');

test('golden vector: two buys in block 1, price decays correctly after', () => {
  let s = openState(1, REAL_CONFIG);
  let r = settleBuy(s, 1, REAL_CONFIG); assert.strictEqual(r.price, 6_400_000n); s = r.state;
  r = settleBuy(s, 1, REAL_CONFIG); assert.strictEqual(r.price, 7_040_000n); s = r.state;
  assert.strictEqual(priceAt(s, 3, REAL_CONFIG), 7_705_329n); // from golden-vectors.json edition 3
});

test('zero buys reaches the floor at exactly block 920 and stays there', () => {
  const s = openState(1, REAL_CONFIG);
  assert.ok(priceAt(s, 1 + 919, REAL_CONFIG) > REAL_CONFIG.floor);
  assert.strictEqual(priceAt(s, 1 + 920, REAL_CONFIG), REAL_CONFIG.floor);
  assert.strictEqual(priceAt(s, 1 + 5000, REAL_CONFIG), REAL_CONFIG.floor);
});

test('window is start-inclusive, 1000 blocks long', () => {
  assert.strictEqual(isOpen(100, 99, REAL_CONFIG), false);
  assert.strictEqual(isOpen(100, 100, REAL_CONFIG), true);
  assert.strictEqual(isOpen(100, 100 + 999, REAL_CONFIG), true);
  assert.strictEqual(isOpen(100, 100 + 1000, REAL_CONFIG), false);
});

test('early window is the first 100 blocks of the window, inclusive-exclusive', () => {
  assert.strictEqual(isEarlyWindow(100, 100, REAL_CONFIG), true);
  assert.strictEqual(isEarlyWindow(100, 100 + 99, REAL_CONFIG), true);
  assert.strictEqual(isEarlyWindow(100, 100 + 100, REAL_CONFIG), false);
});

test('dust config uses the same ratios at 1/3200th scale', () => {
  const { DUST_CONFIG } = require('../../lib/curve');
  const s = openState(1, DUST_CONFIG);
  assert.strictEqual(priceAt(s, 1, DUST_CONFIG), 2_000n);
  assert.strictEqual(priceAt(s, 1 + 920, DUST_CONFIG), 200n);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/lib/curve.test.js`
Expected: FAIL — `Cannot find module '../../lib/curve'`

- [ ] **Step 3: Implement `lib/curve.js`**

Port `canon.mjs`'s `priceAt`/`settleBuy`/`openState`/`isOpen` to CommonJS unchanged except `windowBlocks: 1000n` (not `1008n`) and dropping `splitPayout`/`holdersPct`/`platformPct`/`holderCount` entirely (split math lives in Task 4, pooled not per-holder). Add `earlyWindowBlocks: 100n` to both configs and a new `isEarlyWindow(startBlock, h, cfg)` returning `h >= startBlock && h < startBlock + cfg.earlyWindowBlocks`. `DUST_CONFIG` keeps `bumpNum/bumpDen/decayNum/decayDen/windowBlocks/earlyWindowBlocks` identical to `REAL_CONFIG`, only `p0: 2_000n` and `floor: 200n` differ.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lib/curve.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/curve.js tests/lib/curve.test.js
git commit -m "feat: add bonding-curve price engine (ported from canon.mjs)"
```

---

### Task 2: Chain-tip helper and schema migration

**Files:**
- Create: `lib/chain-tip.js`
- Create: `scripts/sql/2026-11-13-card-curves.sql`
- Create: `scripts/seed-card-curve.js`

**Interfaces:**
- Produces: `getChainTipHeight() -> Promise<number>` (current BSV block height from WhatsOnChain).
- Consumes: none from earlier tasks.

- [ ] **Step 1: Implement `getChainTipHeight()` in `lib/chain-tip.js`**

`GET https://api.whatsonchain.com/v1/bsv/main/chain/info`, reuse the `fetchWithTimeout` pattern already in `api/mint-complete.js` (3s timeout), return `json.blocks` as a `Number`. Throw on a non-OK response or timeout — callers decide how to treat a chain-tip failure (Task 4 treats it as non-retryable-pending, same as an on-chain payment lookup failure does today).

- [ ] **Step 2: Smoke-check it against the real API**

Run: `node -e "require('./lib/chain-tip').getChainTipHeight().then(h => console.log('tip height:', h))"`
Expected: prints a plausible current BSV mainnet block height (> 800,000 as of this plan).

- [ ] **Step 3: Write the schema migration**

```sql
-- scripts/sql/2026-11-13-card-curves.sql — run once in Supabase SQL editor, enable RLS, no policies.
create table if not exists card_curves (
  card_id text primary key,
  p_num text not null,
  p_den text not null,
  h_last bigint not null,
  start_block bigint not null,
  window_blocks bigint not null default 1000,
  early_window_blocks bigint not null default 100,
  edition_count bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists card_editions (
  id uuid primary key default gen_random_uuid(),
  card_id text not null references card_curves(card_id),
  edition_number bigint not null,
  price_sats bigint not null,
  settle_block bigint not null,
  payment_txid text not null,
  inscription_id text,
  early_access boolean not null default false,
  created_at timestamptz not null default now(),
  unique (card_id, edition_number),
  unique (payment_txid)
);
```

- [ ] **Step 4: Write the admin seed script**

`scripts/seed-card-curve.js`, mirroring `scripts/seed-allocations.js`'s plain-Node-script style (no HTTP endpoint — run by hand at launch). Takes `cardId` and `startBlock` as CLI args, inserts one `card_curves` row via `openState(startBlock, REAL_CONFIG or DUST_CONFIG)` (config picked by a `--dust` flag), failing if the row already exists (`insert`, not `upsert` — opening the same card twice is almost certainly a mistake, not something to silently allow).

- [ ] **Step 5: Commit**

```bash
git add lib/chain-tip.js scripts/sql/2026-11-13-card-curves.sql scripts/seed-card-curve.js
git commit -m "feat: add chain-tip helper and card-curve schema/seed script"
```

---

### Task 3: Settlement core (pure compute + split, no DB)

**Files:**
- Create: `lib/settle-card.js` (the `computeSettlement` export only — the DB-wrapping `settleCardMint` export is Task 5)
- Test: `tests/lib/settle-card.test.js`

**Interfaces:**
- Consumes: `priceAt`, `settleBuy` from `lib/curve.js` (Task 1).
- Produces: `computeSettlement({ state, blockHeight, paidSats, cfg }) -> { ok: true, price, creatorSats, platformSats, holderPoolSats, newState } | { ok: false, requiredPrice }`.

- [ ] **Step 1: Write the failing tests**

```js
const { computeSettlement } = require('../../lib/settle-card');
const { openState, REAL_CONFIG } = require('../../lib/curve');

test('sufficient payment settles and splits 40/50/10 with creator taking the remainder', () => {
  const state = openState(1, REAL_CONFIG);
  const r = computeSettlement({ state, blockHeight: 1, paidSats: 6_400_000n, cfg: REAL_CONFIG });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.price, 6_400_000n);
  assert.strictEqual(r.holderPoolSats, 3_200_000n);
  assert.strictEqual(r.platformSats, 640_000n);
  assert.strictEqual(r.creatorSats + r.holderPoolSats + r.platformSats, r.price);
  assert.strictEqual(r.newState.pNum / r.newState.pDen, 7_040_000n); // bumped ×1.1
});

test('insufficient payment reports the required price without mutating state', () => {
  const state = openState(1, REAL_CONFIG);
  const r = computeSettlement({ state, blockHeight: 1, paidSats: 1_000_000n, cfg: REAL_CONFIG });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.requiredPrice, 6_400_000n);
});

test('split always sums to price across a range of prices', () => {
  for (const paid of [640_000n, 7_705_329n, 93_001_403n]) {
    const r = computeSettlement({ state: { pNum: paid, pDen: 1n, hLast: 1n }, blockHeight: 1, paidSats: paid, cfg: REAL_CONFIG });
    assert.strictEqual(r.creatorSats + r.holderPoolSats + r.platformSats, paid);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/lib/settle-card.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `computeSettlement` in `lib/settle-card.js`**

Compute `price = priceAt(state, blockHeight, cfg)`. If `paidSats < price`, return `{ ok: false, requiredPrice: price }`. Otherwise compute `holderPoolSats = (price * 50n) / 100n`, `platformSats = (price * 10n) / 100n`, `creatorSats = price - holderPoolSats - platformSats` (floor division, remainder to creator — same shape as `canon.mjs`'s `splitPayout`, just pooled instead of divided across 8 holders), and `newState = settleBuy(state, blockHeight, cfg).state`. Return `{ ok: true, price, creatorSats, platformSats, holderPoolSats, newState }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lib/settle-card.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/settle-card.js tests/lib/settle-card.test.js
git commit -m "feat: add pure settlement compute (price check + pooled 40/50/10 split)"
```

---

### Task 4: Settlement DB wrapper (optimistic compare-and-set)

**Files:**
- Modify: `lib/settle-card.js` (add `settleCardMint`)
- Test: `tests/lib/settle-card.test.js` (add cases)

**Interfaces:**
- Consumes: `computeSettlement` (Task 3), `getChainTipHeight` (Task 2), `isOpen`/`isEarlyWindow` (Task 1), a Supabase client (same shape as `require('../api/_db')`).
- Produces: `settleCardMint({ supabase, cardId, blockHeight, paidSats, cfg, paymentTxid, inscriptionId, earlyAccess, maxAttempts = 5 }) -> Promise<{ status: 'settled', price, edition, creatorSats, platformSats, holderPoolSats } | { status: 'insufficient', requiredPrice } | { status: 'window_not_open' } | { status: 'window_closed' } | { status: 'retry' }>`.

This is the one function with real production behavior that's awkward to unit test against a live Supabase instance. Test it with a hand-rolled fake `supabase` object implementing only the `.from(...).select(...)`/`.update(...).eq(...).eq(...).select()`/`.insert(...)` chain shapes this function actually calls — same spirit as this codebase's existing tests, which avoid hitting real Supabase by short-circuiting on validation rather than mocking, but a CAS loop can't be tested without simulating a conflicting concurrent write, so a fake here is the pragmatic choice.

- [ ] **Step 1: Write the failing tests**

```js
test('window not yet open rejects before touching price logic', async () => {
  const fakeSupabase = fakeCardCurvesClient({ card_id: 'A', p_num: '6400000', p_den: '1', h_last: 100, start_block: 100, edition_count: 0 });
  const r = await settleCardMint({ supabase: fakeSupabase, cardId: 'A', blockHeight: 99, paidSats: 6_400_000n, cfg: REAL_CONFIG, paymentTxid: 'x'.repeat(64) });
  assert.strictEqual(r.status, 'window_not_open');
});

test('window closed (past start_block + window_blocks) rejects', async () => {
  const fakeSupabase = fakeCardCurvesClient({ card_id: 'A', p_num: '6400000', p_den: '1', h_last: 100, start_block: 100, edition_count: 0 });
  const r = await settleCardMint({ supabase: fakeSupabase, cardId: 'A', blockHeight: 100 + 1000, paidSats: 999_999_999n, cfg: REAL_CONFIG, paymentTxid: 'x'.repeat(64) });
  assert.strictEqual(r.status, 'window_closed');
});

test('a conflicting concurrent write is retried and the second settlement sees the bumped price', async () => {
  const fakeSupabase = fakeCardCurvesClient({ card_id: 'A', p_num: '6400000', p_den: '1', h_last: 100, start_block: 100, edition_count: 0 }, { conflictOnFirstAttempt: true });
  const r = await settleCardMint({ supabase: fakeSupabase, cardId: 'A', blockHeight: 100, paidSats: 7_040_000n, cfg: REAL_CONFIG, paymentTxid: 'x'.repeat(64) });
  assert.strictEqual(r.status, 'settled');
  assert.strictEqual(r.edition, 2); // first slot was taken by the simulated concurrent writer
});

test('CAS exhausting all attempts returns retry, not a thrown error', async () => {
  const fakeSupabase = fakeCardCurvesClient({ card_id: 'A', p_num: '6400000', p_den: '1', h_last: 100, start_block: 100, edition_count: 0 }, { alwaysConflict: true });
  const r = await settleCardMint({ supabase: fakeSupabase, cardId: 'A', blockHeight: 100, paidSats: 99_999_999n, cfg: REAL_CONFIG, paymentTxid: 'x'.repeat(64), maxAttempts: 3 });
  assert.strictEqual(r.status, 'retry');
});

test('duplicate payment_txid is rejected by the unique constraint, not double-settled', async () => {
  const fakeSupabase = fakeCardCurvesClient({ card_id: 'A', p_num: '6400000', p_den: '1', h_last: 100, start_block: 100, edition_count: 0 }, { duplicatePaymentTxid: true });
  const r = await settleCardMint({ supabase: fakeSupabase, cardId: 'A', blockHeight: 100, paidSats: 6_400_000n, cfg: REAL_CONFIG, paymentTxid: 'x'.repeat(64) });
  assert.strictEqual(r.status, 'retry'); // surfaces the same way a lost CAS race does — caller/client just retries
});
```

`fakeCardCurvesClient(row, behavior)` is a small test helper (define it in the test file) returning an object shaped like the real Supabase client, driving the above behaviors deterministically.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/lib/settle-card.test.js`
Expected: FAIL — `settleCardMint` not exported

- [ ] **Step 3: Implement `settleCardMint` in `lib/settle-card.js`**

Read the `card_curves` row for `cardId`. If missing, return `{ status: 'window_not_open' }` (no row means never opened). Check `isOpen(row.start_block, blockHeight, cfg)`; if `blockHeight < start_block`, `window_not_open`; if past the window, `window_closed`. Parse `pNum`/`pDen` with `BigInt()`, call `computeSettlement`; on `ok: false`, return `{ status: 'insufficient', requiredPrice }`. On `ok: true`, loop up to `maxAttempts`: attempt a conditional `update` on `card_curves` (`.eq('card_id', cardId).eq('p_num', row.p_num).eq('p_den', row.p_den)`, matching `deductClaimable`'s compare-and-set shape in `api/payout.js`) setting the new state and `edition_count: row.edition_count + 1`; if it affects zero rows, re-read and recompute from fresh state (another writer won), retrying `computeSettlement` against the same `paidSats`; if it now reports `ok:false`, return `insufficient` early. On a successful update, insert the `card_editions` row (`payment_txid`, `edition_number: row.edition_count + 1`, `price`, `settle_block: blockHeight`, `inscriptionId`, `earlyAccess`); if that insert fails with Postgres code `23505` (reusing the exact pattern already in `api/claim.js:47`), return `{ status: 'retry' }` (same contract as CAS exhaustion — nothing to distinguish for the caller). On success, return `{ status: 'settled', price, edition: row.edition_count + 1, creatorSats, platformSats, holderPoolSats }`. If the loop exhausts without a successful update, return `{ status: 'retry' }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lib/settle-card.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/settle-card.js tests/lib/settle-card.test.js
git commit -m "feat: add settlement compare-and-set against card_curves"
```

---

### Task 5: Early-access eligibility — prove the lookups, then build the check

**Files:**
- Create: `lib/eligibility.js`
- Test: `tests/lib/eligibility.test.js`

**Interfaces:**
- Produces: `isEligibleForEarlyAccess(address) -> Promise<boolean>`, `OR_TOKEN_ID`, `OR_MIN_BALANCE`.

This is the one area the spec flags as genuinely unverified (Risk #1) — prove both lookups against real data before writing the real implementation, same discipline the reference handoff recommended and this session already followed for `used_payments`.

- [ ] **Step 1: Prove the `$OR` balance-by-address lookup against a real address**

Run (against `1K95UPbLnFTU5UtJGFpZcCyBoCMoYcixV8`, the token's own fund address from the deploy inscription, which is known to hold `$OR`):

```powershell
Invoke-RestMethod "https://ordinals.gorillapool.io/api/bsv20/1K95UPbLnFTU5UtJGFpZcCyBoCMoYcixV8/balance" | ConvertTo-Json -Depth 5
```

Record the actual response shape (field name for balance, whether it's per-token or needs filtering by `b92468588bfce6a43909733ae97eaed8c0fcafe8d2216cd7df7ce9ea9f71a9df_1`) as a comment at the top of `lib/eligibility.js`. If this exact path 404s, try the GorillaPool or 1Sat docs for the current balance-by-address route before writing Step 3 — do not guess at a shape you haven't seen.

- [ ] **Step 2: Prove the OG-inscription-holdings-by-address lookup against a real address**

Use any address known to hold one of the 64 Vol.1 pieces (e.g. query the current owner of inscription `704a7653a4d8c4d7bf356e1d2aeb0f0349b91c7a34c6b7eee4b4b0f5ae054a33`, "AlchemyBow", via GorillaPool's inscription-by-id endpoint first to get an address, then query that address's holdings). Record the response shape as a comment alongside Step 1's.

- [ ] **Step 3: Write the failing tests** (using the real shapes recorded above, with `fetch` mocked via dependency injection or Node's `--experimental-test-mock` module mocking, not a live network call in the test)

```js
test('eligible when address holds enough $OR, regardless of OG inscriptions', async () => { /* mock OR lookup -> balance >= 1n, mock OG lookup -> empty; assert true */ });
test('eligible when address holds an OG inscription, regardless of $OR balance', async () => { /* mock OR lookup -> 0n, mock OG lookup -> one of the 64 ids; assert true */ });
test('ineligible when address holds neither', async () => { /* both lookups empty/zero; assert false */ });
test('a lookup failure (network error, unexpected shape) does not crash — treated as not-eligible for that check', async () => { /* one lookup throws; other is empty; assert false, no unhandled rejection */ });
```

- [ ] **Step 4: Run tests to verify they fail, then implement, then verify they pass**

Run: `node --test tests/lib/eligibility.test.js` (fails, then passes after implementation)

Implement `isEligibleForEarlyAccess(address)` using the proven endpoint shapes from Steps 1–2, checking `$OR` balance against `data/collection.json`'s 64 inscription ids for the OG check, returning `true` on the first check that passes (OR, not AND, per spec) and `false` if a lookup throws rather than propagating.

- [ ] **Step 5: Commit**

```bash
git add lib/eligibility.js tests/lib/eligibility.test.js
git commit -m "feat: add early-access eligibility check (OG inscription OR \$OR balance)"
```

---

### Task 6: Quote endpoint

**Files:**
- Create: `api/quote.js`
- Test: `tests/api/quote.test.js`

**Interfaces:**
- Consumes: `priceAt`, `isOpen`, `isEarlyWindow`, `REAL_CONFIG`/`DUST_CONFIG` (Task 1), `getChainTipHeight` (Task 2), `isEligibleForEarlyAccess` (Task 5).
- Produces: `GET /api/quote?card=<card_id>&address=<buyer_address optional>` → `{ card_id, price_sats, block_height, window_open, early_window_active, eligible_now, edition_next }`.

- [ ] **Step 1: Write the failing tests**

```js
test('quote rejects a request with no card id', async () => { /* 400 */ });
test('quote for an unknown card_id returns window_open: false rather than a 500', async () => { /* card_curves row missing */ });
```

(Deeper cases — real price/eligibility reflected correctly — are covered by Tasks 1–5's unit tests on the functions this endpoint calls; this endpoint's own tests cover its HTTP-layer guards, matching this codebase's existing convention of keeping endpoint tests to validation and leaving logic-heavy assertions to the modules underneath.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/api/quote.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `api/quote.js`**

`GET` only. Validate `card` query param present. Fetch chain tip, read the `card_curves` row; if missing, respond `{ card_id, window_open: false }`. Otherwise compute `price_sats` via `priceAt`, `window_open` via `isOpen`, `early_window_active` via `isEarlyWindow`; if `early_window_active` and an `address` query param is present, set `eligible_now` via `isEligibleForEarlyAccess(address)` (omit the field if no address given — the frontend only has an address once a wallet is connected). `edition_next = row.edition_count + 1`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/api/quote.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/quote.js tests/api/quote.test.js
git commit -m "feat: add read-only /api/quote endpoint for live card pricing"
```

---

### Task 7: Wire settlement and eligibility into `api/mint-complete.js`

**Files:**
- Modify: `api/mint-complete.js`
- Test: `tests/api/mint-complete.test.js` (extend existing file)

**Interfaces:**
- Consumes: `settleCardMint` (Task 4), `isEarlyWindow` (Task 1), `isEligibleForEarlyAccess` (Task 5), `getChainTipHeight` (Task 2), `sendAlert` (existing, `lib/alert.js`).
- Changes the request contract: body now requires `card_id` instead of `holder_pool_sats` (the backend computes the required amount itself — never trusts a client-supplied split again); adds `buyer_address` (required only when the early window is active) and `is_final_attempt` (boolean, set by the frontend on its last poll attempt — see Task 8).

- [ ] **Step 1: Write the failing tests**

```js
test('mint-complete rejects a request with no card_id', async () => { /* 400, replaces the old holder_pool_sats-required test */ });
test('mint-complete rejects an early-window mint from an address that fails eligibility', async () => { /* mock isEligibleForEarlyAccess -> false during an active early window; 403 */ });
test('mint-complete fires an admin alert only when settlement returns retry AND is_final_attempt is true', async () => { /* spy on sendAlert; assert not called on a mid-stream retry, called once when is_final_attempt */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/api/mint-complete.test.js`
Expected: FAIL on the new cases; the no-`payment_txid`/no-`holder_pool_sats` guard tests from this session are updated to assert on `card_id` instead and should be adjusted in this same step.

- [ ] **Step 3: Implement the changes in `api/mint-complete.js`**

After the existing `checkHolderPoolPayment`-style on-chain presence check is replaced by settlement (settlement itself now establishes whether the payment is sufficient — the old flat `holder_pool_sats` threshold check is removed entirely, not run alongside the new logic): fetch chain tip; if `isEarlyWindow(row.start_block, tipHeight, cfg)` is true, require `buyer_address` in the body and call `isEligibleForEarlyAccess`; if ineligible, respond 403 with a message that explicitly mentions OG/`$OR` holders can mint now (per spec's Decisions table — this is the one piece of response copy the spec pins, so use its wording as the basis). Otherwise call `settleCardMint(...)`; branch on `status`: `'settled'` → proceed into the existing `seedMintAllocations()` call using `holderPoolSats` from the settlement result (not a client value) and return 200 with the edition number and price; `'insufficient'` → 402 with `requiredPrice`; `'window_not_open'`/`'window_closed'` → 400, not retryable; `'retry'` → 202 `{ retry: true }`, and if `req.body.is_final_attempt` is true, call `sendAlert(...)` first (reusing the exact pattern in `api/payout.js`'s own CRITICAL-failure call) before responding, since this is the one point an admin needs to know something needs manual attention.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/api/mint-complete.test.js`
Expected: PASS

- [ ] **Step 5: Run the full backend suite to confirm no regressions**

Run: `node --test tests/api/*.test.js tests/lib/*.test.js`
Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add api/mint-complete.js tests/api/mint-complete.test.js
git commit -m "feat: settle dynamic price and enforce early-access gate in mint-complete"
```

---

### Task 8: Frontend — live quote, eligibility gating, dynamic payment

**Files:**
- Modify: `ordinal gif/src/main.js`
- Modify: `ordinal gif/src/wallet.js` (only if `pay3way`'s signature needs to change — it already takes an arbitrary outputs array, so it likely does not)

**Interfaces:**
- Consumes: `GET /api/quote` (Task 6), the changed `POST /api/mint-complete` contract (Task 7).

This repo has no frontend test runner; verification here is a manual dust-mode mint walkthrough, the same kind already performed earlier this session for the existing flow.

- [ ] **Step 1: Replace the hardcoded `MINT_PRICE_BSV`/`MINT_PRICE_SATS` constants with a live quote fetch**

When a card is selected (and again right before the mint button is clicked, since price may have moved), call `GET /api/quote?card=<id>&address=<connected address or omitted>`. Use the returned `price_sats` to compute `CREATOR_SATS`/`HOLDER_SATS`/`PLATFORM_SATS` (same 40/50/10 split math already in `main.js`, now applied to a dynamic price instead of the flat constant).

- [ ] **Step 2: Gate the mint button during an active, ineligible early window**

If the quote response has `early_window_active: true` and `eligible_now: false`, disable the mint button and show the spec's required messaging (OG/`$OR` holders can mint now — same copy decided in Task 7). Re-enable once `early_window_active` is `false` or `eligible_now` is `true`.

- [ ] **Step 3: Update the `mint-complete` request body and final-attempt flag**

Replace the `holder_pool_sats` field in the POST body with `card_id` and `buyer_address`. In the existing `MAX_SEED_ATTEMPTS` poll loop, set `is_final_attempt: attempt === MAX_SEED_ATTEMPTS` on every request (true only on the last one).

- [ ] **Step 4: Manual dust-mode verification**

Using `DUST_CONFIG`-seeded card curve (`scripts/seed-card-curve.js --dust`), run a real dust mint through the full flow: confirm the displayed price matches `priceAt` for the card's current state, confirm payment amount matches, confirm `card_editions` gets a new row with the correct edition number, confirm `reward_allocations` for the card's 8 components increases by the correct rarity-weighted share of the settled price's 50%, and confirm a second mint on the same card shows a bumped price.

- [ ] **Step 5: Commit**

```bash
git add "../ordinal gif/src/main.js"
git commit -m "feat: drive mint price and early-access gate from the live quote endpoint"
```

---

## Self-review notes

- **Spec coverage:** price engine (Task 1), schema + seeding (Task 2), settlement + concurrency (Tasks 3–4), early-access eligibility (Task 5), quote endpoint (Task 6), mint-complete integration including the admin-alert decision (Task 7), frontend (Task 8). The already-applied buyer-facing-message fix is noted under Global Constraints rather than re-planned as a task, since it's already done.
- **Review Focus coverage:** window-not-open and window-closed are tested in Task 4; ineligible-during-early-window is tested in Task 7; the price-moved/insufficient race is tested in Tasks 3–4; the duplicate-`payment_txid` replay is tested in Task 4.
- **`used_payments` note:** the table added earlier this session protected the old flat-price flow's replay case. The dynamic flow's replay protection is `card_editions.payment_txid UNIQUE` instead (Task 4) — `used_payments` is not written to by the new path and can be left in place unused or dropped later; no task in this plan touches it.
