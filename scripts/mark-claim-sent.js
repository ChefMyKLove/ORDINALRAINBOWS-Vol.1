/*
  mark-claim-sent.js
  Admin helper: after paying a BSV claim by hand (outside api/payout.js), record it as sent
  and deduct the paid amount from the piece's bsv_claimable.

  Usage: node --env-file=.env.local scripts/mark-claim-sent.js <claimId> <txid>
  Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY
*/

const supabase = require('../api/_db');
const { deductClaimable } = require('../api/payout');

async function main() {
  const [claimId, txid] = process.argv.slice(2);
  if (!claimId || !/^[0-9a-f]{64}$/i.test(txid || '')) {
    console.error('Usage: node scripts/mark-claim-sent.js <claimId> <64-char txid>'); process.exit(1);
  }

  // Only a pending/failed claim can be marked sent, so a claim can't be marked (and deducted) twice.
  const { data: rows, error } = await supabase
    .from('claims')
    .update({ status: 'sent', txid, claimed_at: new Date().toISOString() })
    .eq('id', claimId)
    .in('status', ['pending', 'failed'])
    .select();
  if (error) { console.error('Failed to update claim:', error.message); process.exit(1); }
  if (!rows || rows.length === 0) { console.error('Claim not found, or already sent/broadcasting:', claimId); process.exit(1); }

  const claim = rows[0];
  if (claim.inscription_id && claim.amount) {
    const ok = await deductClaimable(claim.inscription_id, Number(claim.amount));
    if (!ok) console.error('WARNING: marked sent but could not deduct the allocation — fix bsv_claimable by hand.');
  }
  console.log('Marked claim', claimId, 'as sent (txid:', txid + ')');
}

main().catch(e => { console.error(e); process.exit(1); });
