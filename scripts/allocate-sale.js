/*
  allocate-sale.js
  Usage: node scripts/allocate-sale.js <inscriptionId> <creator_cut_amount> <epochTag>
  Example: node scripts/allocate-sale.js 704a... 10.00 "print-2026-02"

  This script adds creator_cut_amount * rarity_multiplier to the inscription's mnee_claimable.
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
    console.error('Usage: node scripts/allocate-sale.js <inscriptionId> <creator_cut_amount> [epoch]');
    process.exit(1);
  }
  const [inscriptionId, amountStr, epoch='default'] = args;
  const amount = Number(amountStr);
  if (isNaN(amount) || amount <= 0) {
    console.error('Invalid amount'); process.exit(1);
  }

  const { data: alloc } = await supabase.from('reward_allocations').select('*').eq('inscription_id', inscriptionId).maybeSingle();
  if (!alloc) {
    console.error('Allocation row not found for', inscriptionId); process.exit(1);
  }

  const multiplier = alloc.rarity_multiplier || 0.05;
  const added = amount * Number(multiplier);
  const newClaimable = Number(alloc.mnee_claimable || 0) + added;
  const newTotal = Number(alloc.total_earned || 0) + added;

  const { error } = await supabase.from('reward_allocations').update({ mnee_claimable: newClaimable, total_earned: newTotal, updated_at: new Date().toISOString() }).eq('inscription_id', inscriptionId);
  if (error) { console.error('Supabase update error', error.message); process.exit(1); }

  // Audit row in claims table as admin allocation (status=allocated)
  const { error: ie } = await supabase.from('claims').insert([{ inscription_id: inscriptionId, recipient_address: null, amount: added, epoch, status: 'allocated' }]);
  if (ie) console.warn('audit insert error', ie.message);

  console.log(`Allocated ${added} MNEE to ${inscriptionId} (multiplier ${multiplier})`);
}

main().catch(e => { console.error(e); process.exit(1); });
