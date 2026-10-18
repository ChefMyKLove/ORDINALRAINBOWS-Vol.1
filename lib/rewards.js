// Shared reward allocation, used by scripts/allocate-sale.js and api/printify-webhook.js.
const fetch = require('node-fetch');

// Adds creatorCutSats × the piece's rarity multiplier to its bsv_claimable and records an audit row.
// Compare-and-set on the current balance so a concurrent payout or allocation is never lost.
// Returns the satoshis added.
async function allocateSale(supabase, inscriptionId, creatorCutSats, epoch = 'default', attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    const { data: alloc, error } = await supabase
      .from('reward_allocations')
      .select('bsv_claimable, bsv_total_earned, rarity_multiplier')
      .eq('inscription_id', inscriptionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!alloc) throw new Error(`allocation row not found for ${inscriptionId}`);

    const added = Math.floor(creatorCutSats * Number(alloc.rarity_multiplier || 0.05));
    if (added <= 0) return 0;

    const { data: updated, error: upErr } = await supabase
      .from('reward_allocations')
      .update({
        bsv_claimable: Number(alloc.bsv_claimable || 0) + added,
        bsv_total_earned: Number(alloc.bsv_total_earned || 0) + added,
      })
      .eq('inscription_id', inscriptionId)
      .eq('bsv_claimable', alloc.bsv_claimable)
      .select('inscription_id');
    if (upErr) throw new Error(upErr.message);
    if (!updated || updated.length === 0) continue; // balance changed underneath us; retry

    // Audit trail (no recipient until someone claims)
    const { error: auditErr } = await supabase
      .from('claims')
      .insert([{ inscription_id: inscriptionId, recipient_address: '', amount: added, epoch, status: 'allocated' }]);
    if (auditErr) console.warn('[rewards] audit insert failed —', auditErr.message);
    return added;
  }
  throw new Error(`could not allocate to ${inscriptionId}: balance kept changing`);
}

// USD cents → satoshis at the current WhatsOnChain BSV/USD rate.
async function usdCentsToSats(cents) {
  const r = await fetch('https://api.whatsonchain.com/v1/bsv/main/exchangerate', { timeout: 8000 });
  if (!r.ok) throw new Error(`exchange rate unavailable (${r.status})`);
  const { rate } = await r.json();
  if (!(Number(rate) > 0)) throw new Error('bad exchange rate');
  return { sats: Math.floor((cents / 100 / Number(rate)) * 1e8), rate: Number(rate) };
}

module.exports = { allocateSale, usdCentsToSats };
