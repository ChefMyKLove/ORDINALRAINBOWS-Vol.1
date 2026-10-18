const supabase = require('./_db');

module.exports = async function (req, res) {
  try {
    const inscriptionId = req.query.inscriptionId || req.body?.inscriptionId;

    // No id: list every piece with BSV waiting (drives the gallery's reward badges).
    if (!inscriptionId) {
      const { data, error } = await supabase
        .from('reward_allocations')
        .select('inscription_id, bsv_claimable')
        .gt('bsv_claimable', 0);
      if (error) {
        console.error('[api/rewards] list failed —', error.message);
        return res.status(500).json({ error: 'internal error' });
      }
      return res.json({ success: true, rewards: data || [] });
    }

    const { data, error } = await supabase
      .from('reward_allocations')
      .select('inscription_id, nft_id, title, rarity, rarity_multiplier, mnee_claimable, bsv_claimable, bsv_total_earned, total_earned')
      .eq('inscription_id', inscriptionId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[api/rewards] lookup failed —', error.message);
      return res.status(500).json({ error: 'internal error' });
    }
    if (!data) return res.status(404).json({ error: 'not found' });

    return res.json({ success: true, allocation: data });
  } catch (err) {
    console.error('[api/rewards] error', err);
    res.status(500).json({ error: 'internal' });
  }
};
