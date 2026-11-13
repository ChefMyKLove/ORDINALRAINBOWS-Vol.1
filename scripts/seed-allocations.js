/*
  Seed reward_allocations table from local NFT list (window.nfts data)
  Run locally: node scripts/seed-allocations.js
  Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY env variables
*/

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { parseNfts } = require('./build-manifest');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in env to run this script');

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const nfts = parseNfts(indexHtml);

  for (const n of nfts) {
    const row = {
      inscription_id: n.inscriptionId || null,
      nft_id: n.id,
      title: n.title,
      rarity: n.rarity || 'Common',
      rarity_multiplier: getMultiplier(n.rarity),
      mnee_claimable: 0,
      total_earned: 0
    };
    if (!row.inscription_id) continue;
    // Insert-only: existing rows keep their balances (a plain upsert would reset mnee_claimable/total_earned).
    console.log('Seeding (if missing)', row.nft_id, row.inscription_id);
    const { error } = await supabase.from('reward_allocations').upsert(row, { onConflict: 'inscription_id', ignoreDuplicates: true });
    if (error) console.error('Supabase upsert error', error.message);
  }
  console.log('Done');
}

const { rarityMultiplier: getMultiplier } = require('../lib/rarity');

main().catch(e => { console.error(e); process.exit(1); });
