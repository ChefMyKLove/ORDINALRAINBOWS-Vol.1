# ORDINAL•RAINBOWS Dynamic Mint Pricing — Design

**Date:** 2026-11-12
**Status:** Written-spec review complete (builder-check + all follow-ups resolved), awaiting final sign-off
**Scope:** How much a mint costs and how a mint settles, for the 16-card "Rainbow Legends" mint (`ordinal gif/mint.html` + this repo's backend). Does **not** change how holder rewards get split or paid out — that pipeline (`lib/rarity.js`, `api/mint-complete.js`'s crediting step, `api/claim.js`, `api/payout.js`) is proven working end-to-end as of this session and is explicitly kept as-is.

## Why

Today each card mints at one flat price (`TEST_MODE ? 0.00002 : 0.64` BSV, hardcoded in `ordinal gif/src/main.js`). A separate agent drafted a reference design (`canon.mjs`, see `MINT-PRICING-HANDOFF.md`) for a dynamic bump-and-decay price instead: price rises 10% with every buy and decays 0.25% every block, so a quiet card gets cheaper and a popular one gets more expensive, inside a fixed mint window. That reference design also proposed paying the 8 component holders directly in the mint transaction, replacing the pooled/rarity-weighted reward system. **That part is explicitly rejected** — we keep the existing pooled, rarity-weighted, claim-later reward model. Only the price-discovery mechanic is being adopted.

## Goal

Each live card gets its own live, bonding-curve price, discoverable for a 1,000-block (~1 week) window, with unlimited editions during that window and a hard close after. Launch also adds a 100-block early-access window at the start of each card's mint, gated to current OG Vol.1 holders and `$OR` token holders, both to reward them and to incentivize people to go acquire `$OR`.

## Decisions

| Area | Decision |
|---|---|
| Price engine | Port `canon.mjs`'s `priceAt()`/`settleBuy()`/`isOpen()` as-is — integer/BigInt only, no floats. The `price` and `pAfter` columns in `golden-vectors.json` are the acceptance test for those. The vectors' `creator`/`platform`/`perHolder` columns come from `canon.mjs`'s `splitPayout()`, which assumes the 8-direct-holder-output model this design explicitly rejects — those columns are not part of the acceptance surface here; the existing `lib/rarity.js` split is unchanged and untested against this file. |
| Pricing parameters (real) | P0 = 6,400,000 sats (0.064 BSV); floor = 640,000 sats (0.0064 BSV); bump ×1.1/buy; decay ×0.9975/block. Verified: with zero buys, price reaches the floor at exactly block 920 and stays there — 80 blocks of margin inside the 1,000-block window. |
| Pricing parameters (dust test) | P0 = 2,000 sats; floor = 200 sats (same 10:1 ratio); same bump/decay/window. Same code path as real pricing, smaller numbers — same relationship `TEST_MODE` has to the flat price today. |
| Window | 1,000 blocks per card, start-inclusive. Unlimited editions during the window. No new mints once closed — enforced both client-side (disable mint button) and server-side (hard reject), same defense-in-depth as every other gate in this backend. |
| Per-card state | Each card has its own independent price curve — bumps and decays off only its own sales, never a shared pool across cards. |
| Editions | Each settled mint is a sequential edition number **for that card** (card A edition #7), not a global counter. |
| Settlement model | **No price lock / quote reservation.** The price (and edition number) a mint actually gets is whatever the curve says at the moment its payment is verified on-chain, not at the moment the buyer clicked mint. If someone else's mint settles first and bumps the price up, a payment that's now short is rejected the same way an underpayment is today (402) — the buyer can retry at the new price. This is deliberate: holding a price for even one block doesn't make sense given decay is per-block, and a rejected-then-retried mint still succeeds, just at a different price. |
| Settlement concurrency | Optimistic compare-and-set on the card's price-state row, same pattern already used in `deductClaimable` (`api/payout.js`): read current state, attempt an update conditioned on it being unchanged, retry a few times on conflict. No new locking primitive. |
| Launch scope | However many cards have real 8-ordinal component sets today (6: sets A–F). The other 10 card slots currently just rotate through those same 6 sets and are not real distinct cards — filling them in is tracked separately (see Launch Blockers, below) and does not block this feature. The engine itself is card-count-agnostic: adding card 7–16 later is a data change, not a code change. |
| Launch-day choreography | Whether all live cards share one start block or are staggered across launch day is **not decided yet** and does not need to be — `start_block` is a per-card value either way, set at launch time, not baked into the engine. |
| Reserved editions | None. All test editions already belong to the owner; no artist-proof carve-out needed. |
| Early-access window | First 100 blocks (~16.7 hours) of each card's window are gated. |
| Early-access eligibility | Wallet holds **at least one of the 64 Vol.1 OG component inscriptions, OR at least 1 `$OR`** (BSV-21, id `b92468588bfce6a43909733ae97eaed8c0fcafe8d2216cd7df7ce9ea9f71a9df_1`, symbol `ORDINAL•RAINBOWS`, 0 decimals). Logical OR, not AND — covers today's reality (every current inscription holder already received `$OR`) and the stated plan to distribute `$OR` more broadly to people who never held a piece. |
| Early-access enforcement | Hard gate: mint button disabled for ineligible wallets, server rejects if forced anyway. The disabled/rejected state explicitly tells the buyer that OG or `$OR` holders can mint now — doubles as an incentive to go acquire `$OR`, not just a dead end. |
| Holder reward payout | **Unchanged.** 50% of whatever price actually settles still goes to the pooled treasury output, still gets credited rarity-weighted across the card's 8 components via the existing `seedMintAllocations()` / `lib/rarity.js` path, still claimed later via `api/claim.js` + `api/payout.js`. The curve only changes what the price number is; it does not touch the payout split or mechanism. |
| Payment outputs | Still 3 outputs per mint (creator / holder-pool / platform), same as today — not 8 direct-to-holder outputs. This also means the dust-limit concerns the reference design raised for 8 small outputs don't apply here. |

## 1. Data model (new; propose migration, do not apply without review)

```sql
-- One row per live card. State mutates on every settled mint.
-- p_num/p_den are text, not numeric: PostgREST serializes numeric/bigint as JSON numbers,
-- which silently collapse to IEEE-754 doubles above 2^53. p_num compounds ×1.1 per buy with
-- no decay between same-block buys, so a hot card with enough rapid mints could cross that
-- threshold and corrupt the price state without erroring. Store as text, parse with BigInt()
-- in code — same "integer-only, no floats, ever" discipline canon.mjs already follows.
create table if not exists card_curves (
  card_id text primary key,              -- e.g. 'A'..'F', matches CARD_SETS keys in ordinal gif/src/main.js
  p_num text not null,                   -- price numerator, BigInt as decimal string
  p_den text not null,                   -- price denominator, BigInt as decimal string
  h_last bigint not null,                -- block height of the last settled buy (or start_block if none yet)
  start_block bigint not null,
  window_blocks bigint not null default 1000,
  early_window_blocks bigint not null default 100,
  edition_count bigint not null default 0,  -- next edition to assign is edition_count + 1
  updated_at timestamptz not null default now()
);

-- One row per settled mint, for audit and for the unique-edition guarantee.
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

RLS: enable on both, no policies (server-only access via the service role key, same as `used_payments`).

Pricing config (P0, floor, bump/decay ratios, window length) lives in code as a shared constant, mirroring `canon.mjs`'s `DEFAULTS` — not per-card DB columns. Nothing in this design calls for per-card-tunable curve shape; if that's ever wanted, it's a schema change at that time, not now.

## 2. Settlement flow

Extends the existing `api/mint-complete.js` verify-then-credit flow rather than replacing it:

1. Buyer's frontend fetches current chain tip (WhatsOnChain `/v1/bsv/main/chain/info`) and the card's current price (new read-only endpoint, computed from `card_curves` + tip height using `priceAt()`) — for **display only**.
2. Frontend checks window state: before `start_block` → not open; past `start_block + window_blocks` → closed, mint disabled either way. Inside the first `early_window_blocks` → checks the connected wallet's eligibility (§3) before enabling mint; past it → open to everyone.
3. Buyer pays via the existing `pay3way()` (3 outputs, same split logic, amount now computed from the live price instead of the flat constant) and inscribes, exactly as today.
4. Frontend calls `mint-complete.js` with `payment_txid` + `card_id`, polling exactly as today (the 202/200 distinction and the fix for the `response.ok`-treats-202-as-success bug both stay).
5. On a `200`-eligible payment, before crediting, the backend settles the card's curve: fetch the chain tip **itself, server-side, fresh, at this moment** — the client-supplied height from step 1 is never trusted for this, exactly like `payment_txid` is independently verified on-chain rather than taken on the client's word. Then read `card_curves` row for `card_id`, compute `priceAt(state, tipHeight)`, verify the payment covers at least that price, then attempt the compare-and-set update (bump price, advance `h_last`, increment `edition_count`) conditioned on the row being unchanged since the read. Retry a few times on conflict (mirrors `deductClaimable`). If the payment doesn't cover the now-current price (someone else settled first and bumped it), reject 402 — same shape as today's "insufficient" response, buyer retries.
6. Once settled, insert the `card_editions` row (gets the edition number and enforces the `payment_txid` uniqueness, reusing the same `used_payments`-style replay protection already in place), then continue into the existing `seedMintAllocations()` crediting path unchanged — 50% of the *actual settled price* becomes `holder_pool_sats`.

## 3. Early-access eligibility (needs proving first — see Risks)

Two independent by-address checks, either one qualifying:

- **OG holder:** the connecting wallet's address holds at least one of the 64 Vol.1 component inscription IDs (`data/collection.json` has the full list).
- **`$OR` holder:** the connecting wallet's address holds ≥ 1 unit of token `b92468588bfce6a43909733ae97eaed8c0fcafe8d2216cd7df7ce9ea9f71a9df_1`.

Both are "what does this address hold" lookups (standard, well-supported by ordinal indexers), not "who currently owns this specific inscription" (the harder, unverified lookup the reference design worried about, which this design never needs — we don't pay holders directly in the mint tx).

## Non-goals (explicitly rejected or out of scope)

- Direct-to-holder-wallet payout in the mint transaction. Rejected — keeping the pooled/rarity-weighted claim model.
- Price-lock / quote reservation with a TTL. Rejected — settle-time pricing with retry-on-conflict instead.
- Reserved/artist-proof editions. Not needed.
- Census publishing, rarity-tier computation after window close, set-bottleneck/Ultimate-GIF mechanics. Out of scope for this feature; may exist already as future ideas elsewhere.
- Building out the other 10 cards' component sets. Separate, parked conversation (Launch Blocker #1).
- Any `$OR` distribution/airdrop mechanics. Only a balance **check** is in scope here.

## Risks / unverified — prove before building on top of them

1. **Address-holdings lookups (§3) are unverified against the real indexer API.** Prove both (an address's inscription holdings, and its `$OR` balance) against a real address before wiring the eligibility gate into the mint flow.
2. **Settlement concurrency is untested under real concurrent load.** The compare-and-set pattern is standard and already used elsewhere in this codebase, but this is its first use under genuine multi-buyer race conditions. Worth a concurrency test (e.g. fire several simultaneous dust-mode settles at the same card) before trusting it at real-money launch.
3. **Chain-tip source is a single provider (WhatsOnChain), same as the rest of this backend today** — not a new risk, just inherited.
4. **CAS-retry exhaustion after a real payment is already broadcast — see "Decided: CAS-retry exhaustion" below.**

## Decided: CAS-retry exhaustion

By the time settlement runs, the buyer's BSV payment is already irreversibly broadcast (`pay3way()` already ran). If many buyers hit the same card at the same instant and the compare-and-set update keeps losing the race over several retries — not because the payment became insufficient, just because another concurrent write won each time — settlement treats it exactly like the existing "pending, retry" (202) response. Nothing about the payment is lost — it's already verified as valid and sufficient at that point — so the frontend's existing poll loop (already retries up to 20× / 3s apart) just tries the settlement step again on the next tick. No new reconciliation machinery, no stuck/stranded state, because nothing gets marked as settled or as a used payment until the compare-and-set actually succeeds.

Mid-stream contention that resolves within the 20 attempts is silent — ordinary operation, not worth surfacing, especially since it's actually a signal a card is popular. If all 20 attempts exhaust, the on-chain payment and inscription already succeeded regardless — only internal bookkeeping (edition assignment, reward crediting) is stuck, and the buyer does not care and should never be told about it. **Correction to the existing flow this inherits from:** today's terminal message on this path (`"Minted ✓ — reward registration failed (manual fix needed)"`) leaks an internal concern to a public buyer screen and should just read **"Minted ✓"** — identical to the success case, same payment/inscription links, no mention of rewards, registration, or anything needing a fix. That's the fix for the new curve flow, and worth back-porting to the existing flat-price mint too, since it has the exact same bug today, independent of this feature. The admin-only side still fires a `sendAlert` (same mechanism `api/payout.js` already uses for its own worst-case failure) — that's where "something needs manual attention" actually belongs.

## Launch blockers (running list, tracked across this whole effort — not just this doc)

1. **16-card content/component-set buildout** (owner: Chef/creative). Separate brainstorm, not started.
2. **Launch-day choreography** — all cards together vs. staggered start blocks. Decide at launch time; doesn't block building this.
3. Everything in `docs/HANDOFF_PAYMENT_REWARDS.md` §6 that's still outstanding (deploy to production, flip `TEST_MODE`/URL, Vulpine wallet test) — unaffected by this feature, still needed regardless.

## What's left to the builder

- Exact Supabase migration execution (shown above, needs to actually be run — same "show before applying" convention as `used_payments` this session).
- The new read-only price-quote endpoint's exact shape/route name.
- Which specific indexer endpoints satisfy the two eligibility lookups in §3 — pick after proving them (Risk #1).
- Exact copy for the early-access disabled/rejected message.
- Whether the frontend shows a plain price number or a short explanation of why it might differ from what was shown a moment ago (e.g. "price may have moved — retry if this is unexpectedly rejected").
