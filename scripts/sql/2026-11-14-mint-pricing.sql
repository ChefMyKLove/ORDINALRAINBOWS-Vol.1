-- Dynamic mint pricing — card_curves + card_editions
-- From docs/superpowers/specs/2026-11-12-dynamic-mint-pricing-design.md §1, adapted:
-- card_id is the real per-card pieceId string used throughout the current code
-- (e.g. 'deal-c540eadcbe-card-01'), not the spec's stale 'A'..'F' placeholder —
-- those lettered sets were replaced with the real 16-card deal before this was written.
--
-- Same convention as 2026-11-11-used-payments.sql: show before applying, run by hand in the
-- Supabase SQL editor (or `supabase db push`), not executed automatically by this agent.

create table if not exists card_curves (
  card_id text primary key,
  p_num text not null,                      -- price numerator, BigInt as decimal string
  p_den text not null,                      -- price denominator, BigInt as decimal string
  h_last bigint not null,                   -- block height of the last settled buy (or start_block if none yet)
  start_block bigint not null,
  window_blocks bigint not null default 1008,
  early_window_blocks bigint not null default 100,
  edition_count bigint not null default 0,  -- next edition to assign is edition_count + 1
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

alter table card_curves enable row level security;
alter table card_editions enable row level security;
-- No policies — server-only access via the service role key, same as used_payments.
