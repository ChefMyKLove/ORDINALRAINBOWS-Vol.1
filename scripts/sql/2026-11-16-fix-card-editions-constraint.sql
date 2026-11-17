-- card_editions originally assumed one payment_txid = one edition (true for single mints).
-- Batch mints (api/mint-complete-batch.js) pay for up to 10 DISTINCT cards in ONE transaction,
-- so the same payment_txid legitimately covers multiple rows — one per card. The old
-- unique(payment_txid) constraint silently rejected every row after the first one in a batch
-- (see the repeating "card_editions insert failed (non-fatal)" log line). Replace it with
-- unique(payment_txid, card_id) — still blocks a true duplicate (same payment reused for the
-- same card) but allows one payment to legitimately cover several distinct cards.
--
-- Same convention as the other migrations: show before applying, run by hand in the Supabase
-- SQL editor, not executed automatically by this agent.

alter table card_editions drop constraint if exists card_editions_payment_txid_key;
alter table card_editions add constraint card_editions_payment_txid_card_id_key unique (payment_txid, card_id);
