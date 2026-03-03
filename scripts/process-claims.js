/*
  process-claims.js
  Run locally to process pending claims and send MNEE from treasury.
  This script DOES NOT include private key management for safety. You must
  implement the actual sendMNEEToAddress() using your wallet of choice or
  the @bsv/sdk WalletClient with private keys available locally.

  Usage: node scripts/process-claims.js
  Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY, TREASURY_ADDRESS, and local signing.
*/

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const treasuryAddress = process.env.TREASURY_ADDRESS;
if (!supabaseUrl || !supabaseKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
if (!treasuryAddress) throw new Error('Set TREASURY_ADDRESS in env');

const supabase = createClient(supabaseUrl, supabaseKey);

async function sendMNEEToAddress(toAddress, amount) {
  // Placeholder: implement using your wallet and broadcasting method.
  // Option A: Use @bsv/sdk WalletClient (preferred) and call sendMNEE or createAction
  // Option B: Construct raw TX and sign with local key and broadcast via RPC
  console.log(`[sendMNEE] Simulating send ${amount} MNEE to ${toAddress}`);
  // Return fake txid for now
  return 'SIMULATED_TXID_' + Date.now();
}

async function main() {
  const { data: pending } = await supabase.from('claims').select('*').eq('status', 'pending');
  if (!pending || pending.length === 0) {
    console.log('No pending claims'); return;
  }

  for (const c of pending) {
    try {
      const txid = await sendMNEEToAddress(c.recipient_address, c.amount);
      await supabase.from('claims').update({ status: 'sent', txid, claimed_at: new Date().toISOString() }).eq('id', c.id);
      // deduct from allocation mnee_claimable
      const { data: alloc } = await supabase.from('reward_allocations').select('*').eq('inscription_id', c.inscription_id).maybeSingle();
      if (alloc) {
        const remaining = Number(alloc.mnee_claimable || 0) - Number(c.amount || 0);
        await supabase.from('reward_allocations').update({ mnee_claimable: Math.max(0, remaining) }).eq('inscription_id', c.inscription_id);
      }
      console.log('Processed claim', c.id, 'txid', txid);
    } catch (err) {
      console.error('Failed to process claim', c.id, err);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
