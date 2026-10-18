/*
  allocate-sale.js
  Usage: node --env-file=.env.local scripts/allocate-sale.js <inscriptionId> <creator_cut_satoshis> [epoch]
  Example: node --env-file=.env.local scripts/allocate-sale.js 704a7653a4d8c4d7bf356e1d2aeb0f03... 500000 "print-2026-02"

  Adds creator_cut_satoshis × the piece's rarity multiplier (rounded down) to its bsv_claimable,
  in real satoshis. Print sales from the Printify store do this automatically (api/printify-webhook.js);
  use this for manual or off-store sales.

  Requires SUPABASE_URL and SUPABASE_SERVICE_KEY.
*/

const supabase = require('../api/_db');
const { allocateSale } = require('../lib/rewards');

async function main() {
  const [inscriptionId, satsStr, epoch = 'default'] = process.argv.slice(2);
  const creatorCutSats = Number(satsStr);
  if (!inscriptionId || !Number.isFinite(creatorCutSats) || creatorCutSats <= 0) {
    console.error('Usage: node scripts/allocate-sale.js <inscriptionId> <creator_cut_satoshis> [epoch]');
    process.exit(1);
  }
  const added = await allocateSale(supabase, inscriptionId, creatorCutSats, epoch);
  console.log(`Allocated ${added} satoshis to ${inscriptionId}`);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
