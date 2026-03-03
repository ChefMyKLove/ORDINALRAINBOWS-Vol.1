Ordinals Rewards — setup & run
================================

Security first: do NOT commit real private keys, mnemonics, or .env files. Use `.env` locally (which is ignored by .gitignore). Keep treasury keys offline when possible.

1) Create a Supabase project and run the following SQL to create tables:

```sql
create table reward_allocations (
  inscription_id text primary key,
  nft_id text,
  title text,
  rarity text,
  rarity_multiplier numeric,
  mnee_claimable numeric default 0,
  total_earned numeric default 0,
  updated_at timestamptz
);

create table claims (
  id bigint generated always as identity primary key,
  inscription_id text,
  recipient_address text,
  amount numeric,
  epoch text,
  status text,
  txid text,
  claimed_at timestamptz
);
```

2) Set environment variables (locally create `.env` from `.env.example`):

```bash
cp .env.example .env
# Edit .env and fill values
```

3) Seed allocations (one-time):

```bash
# install deps for scripts
npm install @supabase/supabase-js
node scripts/seed-allocations.js
```

4) Allocate a sale (admin runs after a print sale):

```bash
node scripts/allocate-sale.js <inscriptionId> <creator_cut_amount> [epoch]
# Example:
node scripts/allocate-sale.js 704a7653a4d8c4d7bf356e1d2aeb0f03 10.00 "print-2026-02"
```

5) Process claims (admin runs locally to actually send MNEE):

```bash
# implement sendMNEEToAddress() in scripts/process-claims.js using your wallet
node scripts/process-claims.js
```


Manual payout flow (recommended initially):

1. When a claim is registered (`/api/claim`) the claim row is created with `status = 'pending'`.
2. Admin reviews pending claims in Supabase and sends MNEE from the treasury wallet to the `recipient_address` using your wallet (Yours, or any wallet that supports MNEE token transfers).
3. After broadcasting the payout TX, run the helper to mark the claim as paid:

```bash
node scripts/mark-claim-sent.js <claimId> <txid>
```

This will update the `claims` row to `status = 'sent'` and deduct the claimed amount from the `mnee_claimable` balance for the inscription.

Vercel deployment notes:
- `vercel.json` is included. On Vercel you should add the following Environment Variables (Project Settings -> Environment Variables):
  - `SUPABASE_URL` — your Supabase URL
  - `SUPABASE_ANON_KEY` — public anon key (optional for read-only)
  - `SUPABASE_SERVICE_KEY` — service role key (required if your server APIs need to write to Supabase)

Security note: store `SUPABASE_SERVICE_KEY` in Vercel environment variables (it must never be committed). Local admin scripts need `SUPABASE_SERVICE_KEY` set in your local `.env` before running.

Auto-payout setup (server-side):

1. In Vercel Project Settings -> Environment Variables set:
   - `TREASURY_MNEMONIC` — the mnemonic for the treasury wallet (keep this secret)
   - `AUTO_PAYOUT` = `true` (to enable automatic server payouts when claims are submitted)
   - `BSV_NETWORK` = `mainnet` (default)

2. Deploy to Vercel. With `AUTO_PAYOUT=true`, when a user submits a claim the server will verify ownership and immediately attempt to pay out MNEE to the claimant using the treasury mnemonic. The paid claim will be updated with `status='sent'` and the payout `txid`.

Important security and operational notes:
- Storing the mnemonic in Vercel is convenient but means the key exists in a cloud environment. Only do this if you control the Vercel account and are comfortable with that tradeoff.
- If you prefer greater security, set `AUTO_PAYOUT=false` and run `scripts/process-claims.js` locally to process pending claims with a local key.
- Test thoroughly on testnet before enabling `AUTO_PAYOUT` on mainnet.
6) Deploy API to Vercel (optional):

```bash
npm i -g vercel
vercel login
vercel --prod
# set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel project settings
```

Frontend integration: the site calls `/api/rewards?inscriptionId=...` to show claimable amounts and `POST /api/claim` to register a claim (server verifies ownership). Actual payouts are processed with `scripts/process-claims.js` locally.

If you want, I can implement the `sendMNEEToAddress()` function using `@bsv/sdk` WalletClient — tell me whether you'll provide WIF/mnemonic locally or want to sign via a separate hot wallet.
