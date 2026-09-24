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
