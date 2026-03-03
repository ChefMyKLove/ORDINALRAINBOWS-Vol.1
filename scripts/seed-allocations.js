/*
  Seed reward_allocations table from local NFT list (window.nfts data)
  Run locally: node scripts/seed-allocations.js
  Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY env variables
*/

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in env to run this script');

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const marker = 'window.nfts = [';
  const start = indexHtml.indexOf(marker);
  if (start === -1) throw new Error('window.nfts not found in index.html');
  const arrStart = start + marker.length - 1;
  const arrEnd = indexHtml.indexOf('];', arrStart) + 1;
  const jsonText = indexHtml.slice(arrStart, arrEnd);
  const js = 'const _ = ' + jsonText + '; module.exports = _;';
  // Evaluate safely
  const vm = require('vm');
  const script = new vm.Script(js);
  const sandbox = {};
  script.runInNewContext(sandbox);
  const nfts = sandbox._;

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
    console.log('Upserting', row.nft_id, row.inscription_id);
    const { error } = await supabase.from('reward_allocations').upsert(row, { onConflict: 'inscription_id' });
    if (error) console.error('Supabase upsert error', error.message);
  }
  console.log('Done');
}

function getMultiplier(r) {
  switch ((r||'').toLowerCase()) {
    case 'exotic': return 0.5;
    case 'legendary': return 0.4;
    case 'epic': return 0.3;
    case 'rare': return 0.2;
    case 'uncommon': return 0.1;
    default: return 0.05; // common
  }
}

main().catch(e => { console.error(e); process.exit(1); });
