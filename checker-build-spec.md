# Build Spec: ORDINAL🌈RAINBOWS Holder Checker and Claim Gate

For Claude Code. Target: `checker.ordinalrainbows.com`, new Vercel project, existing Supabase.

**Rules for the agent:** do not commit or push; the owner commits. Never author a commit as Claude or Anthropic. Keep `CLAUDE.md` and `.env*` in `.gitignore`.

## Goal

A holder connects a 1sat-capable wallet, signs a one-time challenge, and sees which of the 64 pieces that address holds right now. For each unclaimed piece they can claim the matching Twetch twonk by giving a Twetch handle. The owner airdrops twonks by hand and marks claims delivered in an admin view.

## Assumptions (flag if wrong)

- New Next.js App Router + TypeScript project, deployed on Vercel. Main site's stack is unknown, so this is a standalone app.
- The twonk is a separate asset from the 1sat. Gating keys off 1sat holdership only.
- Delivery is manual until Twetch confirms a transfer API.
- Yours Wallet first. MetaNet wallet support is a later addition.

## Data

**Manifest file** `manifest/collection.json`: 64 entries, each with `piece` (1 to 64), `name`, `tier`, `origin` (txid_vout). Build it from the Zoide listing, but the listing skips piece #19 (EclipseBow #3: Darkness at the Threshold of Light), so the origin for #19 must be added by hand. Do not build the list at runtime from the listing, or you will count 63.

**Supabase tables:**

```sql
create table nonces (
  nonce text primary key,
  address text,
  expires_at timestamptz not null,
  used boolean not null default false
);

create table claims (
  origin text primary key,
  piece int not null,
  address text not null,
  twetch_handle text not null,
  status text not null default 'pending' check (status in ('pending','delivered')),
  claimed_at timestamptz not null default now(),
  delivered_at timestamptz
);
```

`origin` as the primary key means each 1sat can claim once.

**RLS:** enable on both tables with no public policies. All reads and writes go through server routes using the service role key. The service role key never reaches the client.

## Endpoints

| Route | Does |
|---|---|
| `POST /api/challenge` | Creates a random nonce valid for 10 minutes. Returns the exact message to sign, which includes the nonce and the site name. |
| `POST /api/verify` | Body: address, message, signature. Checks the nonce exists, is unexpired and unused, then verifies the signature against the address, marks the nonce used, and looks up holdings. Returns the manifest pieces held, each with its claim status. |
| `POST /api/claim` | Body: origin, handle, plus a fresh verified session. Re-checks current holdership of that origin, then inserts into `claims`. A duplicate origin returns a clear "already claimed" response. |
| `GET /api/admin/claims` | Lists claims. Admin only. |
| `POST /api/admin/deliver` | Marks a claim delivered with a timestamp. Admin only. |

**Session:** after `verify`, issue a short-lived signed cookie (about 15 minutes) containing the address, so the claim step doesn't need a second signature. Re-check holdership at claim time anyway.

## Verification details to confirm before coding

- **Signing method.** Confirm what Yours returns from its sign-message call (the shape of the response) and which address it signs with. Yours keeps a separate ordinals address from its payment address. The 1sats sit on the ordinals address, so that is the one to verify against.
- **Signature check.** Use `@bsv/sdk` for Bitcoin Signed Message verification. Confirm the exact function and message-hashing convention against its docs and test with a real Yours signature.
- **Holdings lookup.** Use the GorillaPool 1sat ordinals API to list unspent inscriptions for the address, then intersect with manifest origins. Confirm the exact endpoint and the field that carries the origin against GorillaPool's docs. Do not guess the path.
- **Do not store signatures.** Only the nonce is recorded as consumed.

## Rules

- First claim wins per origin. A later sale of the 1sat does not revoke the claim.
- Nonces are single-use and expire in 10 minutes.
- Rate limit `challenge` and `verify` per IP.
- Handle input: trim, strip a leading `@`, length and character check. The handle cannot be verified, so it's only a delivery target.
- All verification and holder lookups run server-side.

## UI

One page. Connect wallet, then sign, then a grid of the holder's pieces, each showing Claim, Pending or Delivered. A handle field appears on claim. Wording must say the twonk is a separate asset from the 1sat. Match the ORDINAL🌈RAINBOWS look.

## Admin

`/admin` behind Supabase Auth, allowlisted to the owner's email only. A table of claims with status filter, piece, handle and address, a Mark Delivered button, and CSV export for batch airdrops.

## Open items

1. **Twetch delivery:** manual airdrop for now. Replace once Twetch answers on transfer.
2. **Piece #19 origin:** needed for the manifest.
3. **MetaNet wallet support:** later.
4. **DNS:** add `checker` as a domain on the new Vercel project, then follow Vercel's DNS instructions at the registrar.

## Build order

1. Scaffold the project, env vars and Supabase tables with RLS.
2. Manifest file and a script that checks it has 64 unique origins.
3. Challenge and verify routes with a real Yours signature test.
4. Holdings lookup with a test wallet.
5. Claim route and the duplicate-claim case.
6. UI.
7. Admin view and CSV export.
8. Deploy, attach the domain, and test end to end.

## Acceptance tests

- Replayed nonce is rejected.
- Expired nonce is rejected.
- Signature from a different address is rejected.
- A wallet holding no pieces sees none.
- A held piece can be claimed once, and the second attempt is refused.
- A piece sold after claiming stays claimed.
- Non-admin cannot reach admin routes.
- Piece #19 appears in results for its holder.
