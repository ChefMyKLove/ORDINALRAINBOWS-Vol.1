# HANDOFF: Payment flow + reward crediting — what's verified, what isn't

Written 2026-11-11, updated same day (second pass, after finding the real root cause of the reward-crediting failures — the first pass's "two contributing causes" theory in Section 3 was wrong/incomplete; read this version, not a cached copy). Two repos involved:
- `ORDINALRAINBOWS-Vol.1` (this repo) — backend, `api/*.js`, Vercel serverless, Supabase.
- `C:\Users\micha\ordinal gif` — the minter frontend, `mint.html` + `src/wallet.js` (Vite project).

**For the next agent:** this is scoped specifically to payment correctness and reward crediting — NOT the UI/background-translucency issue (separate handoff: `ordinal gif/HANDOFF_BACKGROUND_UI.md`, unrelated, don't mix them up). The headline: **minting and payment are proven working end-to-end on-chain. Reward crediting is still not proven** — every real test mint today failed to credit holder rewards. The actual root cause turned out to be simple and dumb (the frontend was calling the live production URL instead of the local dev backend, so none of the backend code being debugged was ever actually reached) — found, fixed, and the retry architecture was redesigned around a second finding (WhatsOnChain indexing can take over a minute, not seconds). **Neither fix has been exercised by a successful mint yet** — the next real test mint, run after this document was last updated, is still outstanding. That's the first thing to do.

---

## 1. The revenue-share mechanic (current, user-confirmed)

| Recipient | % of mint price | Wallet |
|---|---|---|
| Creator | 40% | `1EzJ8LuUN3EGUkw5RxiKDyazEkpNVkY26S` |
| Holder pool (split across the 8 referenced component pieces) | 50% | `1r1rJXu5znptbcSKYuFW74eDZ3zJtsAwb` (== `TREASURY_ADDRESS` in `api/payout.js`) |
| Platform | 10% | `16wcgzMqnRW5gF8nizaRBZzjMBmQR7rsZQ` |

Resale royalty: 2.5% total, split 50/50 between creator and holder pool (1.25% each) — set as two entries in the inscription's `royalties` metadata field (`ordinal gif/src/main.js`, inside the `inscription.map.royalties` JSON string).

Holder-pool shares across the 8 referenced pieces are **rarity-weighted**, not flat-equal: `exotic 0.5, legendary 0.4, epic 0.3, rare 0.2, uncommon 0.1, common 0.05` (relative weights, normalized to the pool) — implemented in `lib/rarity.js`, consumed by `api/seed-mint.js`. This reuses a scale that already existed in `scripts/seed-allocations.js`; `lib/rarity.js` is now the single source of truth for both.

**Verified on-chain, this session:** a real test mint at the dust `TEST_MODE` price (2000 sats total) produced outputs of exactly 800 / 1000 / 200 sats to creator/holder/platform — confirmed via an independent WhatsOnChain lookup of the actual broadcast transaction, not just application logs. The math is correct and exact-to-the-satoshi (no fiat-conversion drift) — see Section 4 for why that matters.

## 2. Payment + inscription: PROVEN WORKING END TO END

The mint flow in `ordinal gif/src/wallet.js` + `src/main.js`:

1. `pay3way()` — pays the 3-way split in one transaction. Two code paths:
   - **Yours Wallet** (if `window.yours` is injected): uses its native `sendBsv()`.
   - **Any other BRC-100 wallet** (via `@1sat/connect`'s `connectWallet()` race): builds P2PKH locking scripts and submits via the wallet's standard `createAction` call.
   - *(HandCash was built and then fully removed per explicit user decision — not part of the current flow. If it resurfaces: `Connect.pay()` needs `denominationCurrencyCode` omitted, not set to `'BSV'`, to get exact-satoshi amounts instead of fiat-rounded ones — that was the one real bug found before removal.)*

2. `inscribeCard()` — inscribes the card. Two code paths:
   - **Yours Wallet**: native `inscribe()`.
   - **Any BRC-100 wallet**: real, spec-compliant inscription built client-side using `js-1sat-ord`'s `OrdP2PKH.lock()` template (implements BRC-160's ord envelope + BRC-147's `"1sat"` basket/tags), submitted via `createAction`. This works because **Yours Wallet's currently-installed version (5.1.1) no longer exposes the legacy `window.yours` API at all** — it connects exclusively via BRC-100's `window.CWI` now — so this BRC-100 inscribe path is not a fallback for *other* wallets, it's now also how Yours itself gets inscribed through in practice.

**Verified, this session, independently (not just "the UI said success"):**
- Decoded the actual on-chain inscription script byte-for-byte: `OP_FALSE OP_IF "ord" OP_1 "text/html" OP_0 <the real card HTML>` — a correct, spec-compliant envelope, confirmed via a direct WhatsOnChain API call, not the wallet's own report.
- The minted ordinal appeared natively in **Yours Wallet's own "My Ordinals" tab**, with a verified checkmark, correctly thumbnailed — confirmed by the user via screenshot. This is independent confirmation from a second system (the wallet's own indexer), not just "the transaction broadcast."

**Not yet tested:** this same BRC-100/`createAction` inscribe path has never been tried against Vulpine Wallet (a second real BRC-100 wallet with native 1Sat support, confirmed to exist via its own docs) or any wallet other than Yours. The code should work generically per the open BRC-147/BRC-160 standards, but "should work" per spec ≠ tested.

## 3. Reward crediting: NOT YET PROVEN — this is the open item

`api/mint-complete.js` is the public endpoint `mint.html` calls after a successful payment+inscribe. It:
1. Checks whether the holder-pool payment has landed on-chain (queries WhatsOnChain for the `payment_txid`, checks for an output to the treasury address of at least `holder_pool_sats`) — this is what stops a stranger from POSTing fake rewards for free; forging it costs a real on-chain payment.
2. If paid, calls `seedMintAllocations()` (shared with the admin-only `api/seed-mint.js`) to credit the 8 referenced pieces' `bsv_claimable` balances in Supabase, rarity-weighted.

**Confirmed by direct query against the live database** (not inference — a read-only Supabase query, and separately cross-checked against the live site's own public `/api/rewards` endpoint), every one of today's real test mints shows the 8 referenced pieces still at `bsv_claimable: 0, bsv_total_earned: 0`. **No holder reward has actually been credited from any test mint today, despite real payments landing in the treasury wallet each time.**

### The actual root cause (found after a lot of wasted debugging): wrong URL, not a backend bug

The first debugging pass diagnosed two *real but secondary* issues (see below) and applied fixes to `api/mint-complete.js` — a local dev-server crash workaround, then a retry loop. **Neither fix changed anything, because the frontend was never calling the local backend at all.** `ordinal gif/src/main.js` had this hardcoded (line ~585, leftover from before any of today's local backend work existed):

```js
const seedResp = await fetch('https://ordinalrainbows-vol-1.vercel.app/api/mint-complete', { ... });
```

That's the **real, deployed production URL** — which has never had today's `api/mint-complete.js` deployed to it (nothing has been pushed all session). Every test mint's reward-crediting call was hitting production, not the local server being debugged, which is why the local `vercel-dev.log` showed *zero trace* of these requests even after adding detailed per-attempt logging — the requests never arrived locally at all. This was caught by checking the log, finding total silence even with logging added, and then actually grepping the frontend source for the URL instead of continuing to assume the local backend code was at fault.

**Fixed**: the fetch URL now points to `http://localhost:3000/api/mint-complete` (local dev only — there's a `TODO` comment at the call site to point it back at the production URL before real launch; don't ship it pointed at localhost).

### A second real finding, surfaced once requests actually started arriving locally

With the URL fixed, real per-attempt logs appeared for the first time, and a fresh test mint's `payment_txid` genuinely wasn't found by WhatsOnChain across 4 retry attempts (~5 seconds) — but checking that same txid a minute or two later returned `200 OK`. **WhatsOnChain can take over a minute to index a freshly-broadcast transaction, not a few seconds.** That's far too long to hold open inside one Vercel serverless function call without risking the platform's execution-time limit (`vercel.json` sets no `maxDuration`, so this defaults to 10s).

**Redesigned accordingly:**
- `api/mint-complete.js` now does a **single** on-chain check per call (`checkHolderPoolPayment()`), returning one of three outcomes: `'paid'` (credits and returns 200), `'insufficient'` (a real mismatch — returns 402, not retryable), or `'pending'` (not indexed yet — returns 202 with `{retry: true}`).
- `ordinal gif/src/main.js` now polls that endpoint itself (up to 20 attempts, 3s apart = ~60s), updating the visible "Registering rewards... (n/20)" status text, since the browser has no serverless execution-time ceiling to worry about.

### Two earlier, secondary findings (still true, just not the actual cause of the failures)

1. **The local `vercel dev` backend process crashes repeatedly** — a native Node/libuv assertion (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76`), confirmed in `vercel-dev.log`. This is a real local-dev-only annoyance (it would not exist in real deployed Vercel infrastructure) but turned out to be unrelated to why rewards weren't crediting — it was coincidental noise found while debugging the real (URL) issue. An auto-restart-loop workaround was tried and then abandoned after it caused its own problem: multiple orphaned loop processes accumulated across this session's many resumes, fighting each other for port 3000 (cascading onto 3001/3002/3003...). All of those were eventually found and killed. **If you restart the local backend, just run `npx vercel dev --listen 3000 --yes` directly and restart it manually if it crashes — don't wrap it in a restart loop, or you'll recreate the same zombie-process mess.**
2. The original single-immediate-check (no retry at all) was a genuine bug too, just not sufficient on its own given the finding above — superseded by the client-side poll described above.

**Still not verified with an actual successful mint.** The next concrete step, unchanged in spirit from the first pass of this document but now against the *correct* fix: run one more real test mint, watch the "Registering rewards... (n/20)" counter, and directly query `reward_allocations` for the 8 referenced pieces afterward to confirm `bsv_claimable` actually increased by the rarity-weighted correct amount. Don't assume this fix worked just because the diagnosis finally makes sense — it hasn't been watched succeed yet either.

## 4. Known, documented, un-fixed gaps (flagged, not blocking, worth knowing)

- **`api/mint-complete.js` has no payment-replay protection.** It confirms a `payment_txid` pays the pool, but doesn't track which `payment_txid`s have already been consumed. In theory, one real payment could be replayed across multiple fake `inscription_id`s to drain the pool repeatedly. Marked with a `ponytail:` comment in the code. Not fixed — the judgment call was that exploiting it still costs a real on-chain payment each time, which is a meaningful deterrent, but it is not watertight. Add a `used_payments` table/column if this is ever seen in practice, or before any real (non-dust) mint goes live.
- **`api/payout.js` and `api/seed-mint.js` compare `ADMIN_SECRET` with plain `!==`**, not constant-time `crypto.timingSafeEqual` — this predates this session (flagged in a prior security audit, see persistent memory note `bsv-secure-payout-reference`), inconsistent with the correct pattern already used in `lib/session.js`. Low real-world exploitability (network jitter swamps the timing signal) but should be brought in line before launch.
- **Local dev writes hit the live production Supabase database.** `vercel dev` pulls `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` from this project's real, cloud-linked "Development" environment scope — there is no sandboxed test database. This was originally an inference; it's now **independently confirmed**, not assumed: querying `https://ordinalrainbows.com/api/rewards?inscriptionId=<AlchemyBow's id>` directly (the live site's own public endpoint, not my local credentials) returned the exact same `bsv_claimable: 2000` as the local query. Every successful test mint (even at dust `TEST_MODE` prices) creates real rows in the same `reward_allocations` table that `ordinalrainbows.com`'s live checker/claim pages read from. Two such rows already exist from today's testing (`nft_id: "test-001"`, title `"Rainbow Legends #1"`). **Reassuring side-finding:** AlchemyBow's own real holder data (2000 sats claimable, from before this session) is confirmed completely intact and untouched — today's testing hasn't corrupted or lost any real holder's existing balance; it's additive rows only (new `test-00N` pieces), on pieces never referenced by today's test mints. Still worth deciding whether continuing to test against live data is acceptable, or whether a separate Supabase project/table prefix is wanted before more testing.
- **`TEST_MODE = true` in `ordinal gif/src/main.js`** sets the mint price to dust (0.00002 BSV) instead of the real 0.64 BSV. This must be flipped to `false` before any real launch — not yet done, and nothing currently reminds future-you to do it.

## 5. What's actually been run and passed

- Full existing backend test suite: 15/15 passing (`node --test tests/api/*.test.js`) — covers the admin-secret gate on `seed-mint`/`payout`, and `claim.js`'s signature verification.
- 3 new tests for the rarity-weighting math (`tests/lib/rarity.test.js`) — passing, but these test the formula in isolation, not the full `seed-mint`/`mint-complete` pipeline against real Supabase writes.
- Multiple real end-to-end mints (payment + inscription) on BSV mainnet, dust price. Payment+inscription independently verified on-chain and in Yours Wallet's own UI each time. **Reward crediting: every single one failed**, for the reasons unpacked in Section 3 (wrong URL the whole time; a second, real indexing-delay issue found only after fixing the URL). The URL fix and the client-side polling redesign are both in place now but **have not yet been exercised by a mint run after they landed** — the test that would confirm this got interrupted by an unrelated question (verifying AlchemyBow's data integrity, Section 4) before a fresh mint was attempted.

## 6. Open questions / next steps, in priority order

1. **Run one more real test mint against the current code and confirm reward crediting actually works now** — still the single most important unverified claim in this document, just against a different (hopefully actually correct this time) fix.
2. Decide whether to add payment-replay protection to `mint-complete.js` before any real (non-dust) launch.
3. Decide whether continued local testing against the live Supabase database is acceptable, or whether a separate test environment is wanted first.
4. Fix the `ADMIN_SECRET` timing-safe comparison to match `lib/session.js`'s established pattern.
5. Flip `TEST_MODE` to `false` in `ordinal gif/src/main.js`, **and** point the `mint-complete` fetch URL in the same file back to `https://ordinalrainbows-vol-1.vercel.app/api/mint-complete` (it's currently hardcoded to `localhost:3000` for local testing — both of these are launch blockers, not just one).
6. Deploy today's backend changes (`api/mint-complete.js`, `api/seed-mint.js`, `lib/rarity.js`) to the real Vercel project — nothing has been pushed all session, so none of this exists in production yet regardless of how well it tests locally.
7. Test the BRC-100 inscribe path against a second real wallet (Vulpine) to confirm it's genuinely wallet-agnostic and not just "worked once with Yours."

---

## Paste this first

```text
Read docs/HANDOFF_PAYMENT_REWARDS.md in this repo (ORDINALRAINBOWS-Vol.1) in full before doing anything — it was updated mid-session after the first diagnosis turned out to be wrong, so don't trust a cached/earlier read of it. Payment and inscription are proven working end-to-end on real BSV mainnet transactions, independently verified on-chain and in Yours Wallet's own UI — don't re-litigate that part. Reward crediting is NOT yet proven: every real test mint failed to credit holder rewards, and the real cause was that ordinal gif/src/main.js was calling the live production URL instead of the local backend (fixed), plus a second finding that WhatsOnChain can take over a minute to index a transaction, which drove a redesign from backend-retry to client-side polling (also done). Neither fix has been exercised by an actual successful mint yet. Your first job is to run one more real test mint through the full flow, watch the "Registering rewards... (n/20)" counter, and directly query the reward_allocations table afterward to confirm bsv_claimable actually increased for the 8 referenced pieces. Section 4 lists known, documented, deliberately-unfixed gaps, and Section 6 has the full prioritized list of what's left before a real (non-dust) launch — read both before deciding what to do next.
```
