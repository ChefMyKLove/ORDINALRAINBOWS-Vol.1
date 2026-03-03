/*
  mark-claim-sent.js
  Admin helper: after manually sending MNEE to claimant, run this to mark claim as sent.

  Usage:
    node scripts/mark-claim-sent.js <claimId> <txid>

  Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY in env
*/

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in env');

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scripts/mark-claim-sent.js <claimId> <txid>'); process.exit(1);
  }
  const [claimId, txid] = args;
  const { data: claim } = await supabase.from('claims').select('*').eq('id', claimId).maybeSingle();
  if (!claim) { console.error('Claim not found:', claimId); process.exit(1); }

  // Update claim record
  const { error } = await supabase.from('claims').update({ status: 'sent', txid, claimed_at: new Date().toISOString() }).eq('id', claimId);
  if (error) { console.error('Failed to update claim:', error.message); process.exit(1); }

  // Deduct from allocation
  if (claim.inscription_id && claim.amount) {
    const { data: alloc } = await supabase.from('reward_allocations').select('*').eq('inscription_id', claim.inscription_id).maybeSingle();
    if (alloc) {
      const remaining = Math.max(0, Number(alloc.mnee_claimable || 0) - Number(claim.amount || 0));
      await supabase.from('reward_allocations').update({ mnee_claimable: remaining }).eq('inscription_id', claim.inscription_id);
    }
  }

  console.log('Marked claim', claimId, 'as sent (txid:', txid + ')');
}

main().catch(e => { console.error(e); process.exit(1); });
