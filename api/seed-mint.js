// api/seed-mint.js
// Called by mint.html after a successful inscription.
// 1. Seeds the new Rainbow Legends inscription into reward_allocations
// 2. Splits the holder pool (25% of mint) equally across the 8 referenced ordinals
//    — adding bsv_claimable to each so holders can claim on the ORDINAL RAINBOWS site

const supabase = require('./_db');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const {
      inscription_id,       // the new Rainbow Legends ordinal TXID
      nft_id,
      title,
      rarity,
      rarity_multiplier,
      holder_pool_sats,     // 16000000 (25% of 0.64 BSV)
      payment_txid,
      referenced_ordinals   // array of 8 ordinal IDs from the GIF
    } = req.body || {};

    if (!inscription_id) return res.status(400).json({ error: 'inscription_id required' });
    if (!referenced_ordinals || !referenced_ordinals.length) {
      return res.status(400).json({ error: 'referenced_ordinals required' });
    }

    // --- 1. Seed the new Rainbow Legends inscription ---
    const { data: existingMint } = await supabase
      .from('reward_allocations')
      .select('id')
      .eq('inscription_id', inscription_id)
      .maybeSingle();

    if (!existingMint) {
      const { error: insertErr } = await supabase
        .from('reward_allocations')
        .insert([{
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
    }

    // --- 2. Split holder pool across referenced ordinals ---
    const poolSats = Number(holder_pool_sats) || 16000000;
    const sharePerOrdinal = Math.floor(poolSats / referenced_ordinals.length);
    const results = [];

    for (const ord_id of referenced_ordinals) {
      const { data: existing } = await supabase
        .from('reward_allocations')
        .select('id, bsv_claimable, bsv_total_earned')
        .eq('inscription_id', ord_id)
        .maybeSingle();

      if (existing) {
        const newClaimable = Number(existing.bsv_claimable || 0) + sharePerOrdinal;
        const newTotal     = Number(existing.bsv_total_earned || 0) + sharePerOrdinal;
        const { error } = await supabase
          .from('reward_allocations')
          .update({ bsv_claimable: newClaimable, bsv_total_earned: newTotal })
          .eq('inscription_id', ord_id);
        results.push({ ord_id, action: 'updated', newClaimable, error: error?.message });
      } else {
        const { error } = await supabase
          .from('reward_allocations')
          .insert([{
            inscription_id:    ord_id,
            nft_id:            ord_id,
            title:             'ORDINAL RAINBOWS Vol.1 — Referenced Artifact',
            rarity:            'legendary',
            rarity_multiplier: 1.0,
            bsv_claimable:     sharePerOrdinal,
            bsv_total_earned:  sharePerOrdinal,
            mnee_claimable:    0,
          }]);
        results.push({ ord_id, action: 'created', sharePerOrdinal, error: error?.message });
      }
    }

    console.log(`[seed-mint] pool ${poolSats} sats / ${referenced_ordinals.length} ordinals = ${sharePerOrdinal} sats each`);
    return res.json({
      success: true,
      inscription_id,
      pool_sats: poolSats,
      share_per_ordinal: sharePerOrdinal,
      allocations: results
    });

  } catch (err) {
    console.error('[seed-mint] error', err);
    return res.status(500).json({ error: 'internal', detail: err.message });
  }
};
