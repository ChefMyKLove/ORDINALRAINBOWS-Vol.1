/*
  process-claims.js
  Pays every pending BSV claim from the treasury, using the same code as api/payout.js
  (atomic lock per claim, real broadcast, deducts the paid amount from the allocation).
  Use this when AUTO_PAYOUT=false, or to retry claims after funding the treasury.

  Usage: node --env-file=.env.local scripts/process-claims.js
  Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY, TREASURY_PAY_PK, TAAL_API_KEY (WOC_API_KEY optional)
*/

const supabase = require('../api/_db');
const { processClaimPayout } = require('../api/payout');

async function main() {
  const { data: pending, error } = await supabase.from('claims').select('id, inscription_id, amount, recipient_address').eq('status', 'pending');
  if (error) throw new Error(error.message);
  if (!pending || pending.length === 0) { console.log('No pending claims'); return; }

  for (const c of pending) {
    try {
      const txid = await processClaimPayout(c.id);
      console.log(`Paid claim ${c.id}: ${c.amount} sats → ${c.recipient_address} (txid ${txid})`);
    } catch (err) {
      console.error(`Claim ${c.id} not paid: ${err.message}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
