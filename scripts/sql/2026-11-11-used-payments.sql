-- Run once in the Supabase SQL editor before the next real mint.
-- Closes the payment-replay gap in api/mint-complete.js: without this, one real
-- on-chain payment could be POSTed to mint-complete across multiple fake
-- inscription_ids, crediting the holder pool repeatedly for a single payment.
create table if not exists used_payments (
  payment_txid text primary key,
  inscription_id text,
  used_at timestamptz not null default now()
);
