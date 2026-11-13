// api/seed-mint.js
// Admin/backfill endpoint — requires ADMIN_SECRET, server-to-server only (not called from a
// browser). The live mint flow posts to api/mint-complete.js instead, which verifies the
// holder-pool payment on-chain before calling seedMintAllocations() below directly.

const supabase = require('./_db');
const { isValidAdminSecret } = require('../lib/admin-secret');
const { rarityMultiplier } = require('../lib/rarity');
const collection = require('../data/collection.json');

const RARITY_BY_TXID = new Map(
  collection.filter(p => p.origin).map(p => [p.origin.replace(/_\d+$/, ''), p.rarity])
);

// Seeds the new Rainbow Legends inscription, then splits the holder pool across the 8
// referenced ordinals — weighted by each one's own rarity, so an Exotic component earns more
// of the pool than a Common one.
async function seedMintAllocations({
  inscription_id, nft_id, title, rarity, rarity_multiplier,
  holder_pool_sats, referenced_ordinals
}) {
  if (!inscription_id) throw new Error('inscription_id required');
  if (!referenced_ordinals || !referenced_ordinals.length) throw new Error('referenced_ordinals required');

  const { data: existingMint } = await supabase
    .from('reward_allocations').select('id').eq('inscription_id', inscription_id).maybeSingle();

  if (existingMint) {
    // Already seeded by an earlier call for this exact mint (e.g. a retried request) —
    // crediting the pool again would double-pay holders, so stop here.
    return { success: true, already_seeded: true, inscription_id };
  }

  const { error: insertErr } = await supabase.from('reward_allocations').insert([{
    inscription_id,
    nft_id:            nft_id || inscription_id,
    title:             title  || 'Rainbow Legends',
    rarity:            rarity || 'common',
    rarity_multiplier: rarity_multiplier || 1.0,
    bsv_claimable:     0,
    bsv_total_earned:  0,
    mnee_claimable:    0,
  }]);
  if (insertErr) console.error('[seed-mint] new inscription insert error', insertErr);

  // ponytail: floor-based split, a handful of leftover sats from rounding go unallocated —
  // fine at this scale; revisit if the pool ever needs to balance to the sat.
  const poolSats = Number(holder_pool_sats) || 16000000;
  const weights = referenced_ordinals.map(id => rarityMultiplier(RARITY_BY_TXID.get(id)));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || referenced_ordinals.length;
  const results = [];

  for (let i = 0; i < referenced_ordinals.length; i++) {
    const ord_id = referenced_ordinals[i];
    const share = Math.floor(poolSats * weights[i] / totalWeight);

    const { data: existing } = await supabase
      .from('reward_allocations')
      .select('id, bsv_claimable, bsv_total_earned')
      .eq('inscription_id', ord_id)
      .maybeSingle();

    if (existing) {
      const newClaimable = Number(existing.bsv_claimable || 0) + share;
      const newTotal     = Number(existing.bsv_total_earned || 0) + share;
      const { error } = await supabase
        .from('reward_allocations')
        .update({ bsv_claimable: newClaimable, bsv_total_earned: newTotal })
        .eq('inscription_id', ord_id);
      results.push({ ord_id, action: 'updated', share, error: error?.message });
    } else {
      const { error } = await supabase
        .from('reward_allocations')
        .insert([{
          inscription_id:    ord_id,
          nft_id:            ord_id,
          title:             'ORDINAL RAINBOWS Vol.1 — Referenced Artifact',
          rarity:            RARITY_BY_TXID.get(ord_id) || 'legendary',
          rarity_multiplier: weights[i],
          bsv_claimable:     share,
          bsv_total_earned:  share,
          mnee_claimable:    0,
        }]);
      results.push({ ord_id, action: 'created', share, error: error?.message });
    }
  }

  console.log(`[seed-mint] pool ${poolSats} sats across ${referenced_ordinals.length} ordinals (rarity-weighted)`);
  return { success: true, inscription_id, pool_sats: poolSats, allocations: results };
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!isValidAdminSecret(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const result = await seedMintAllocations(req.body || {});
    return res.json(result);
  } catch (err) {
    console.error('[seed-mint] error', err);
    const isBadRequest = /required/.test(err.message || '');
    return res.status(isBadRequest ? 400 : 500).json({ error: isBadRequest ? err.message : 'internal' });
  }
};

module.exports.seedMintAllocations = seedMintAllocations;
