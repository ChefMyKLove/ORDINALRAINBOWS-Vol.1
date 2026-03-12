const supabase = require('./_db');

module.exports = async function (req, res) {
  try {
    const inscriptionId = req.query.inscriptionId || req.body?.inscriptionId;
    if (!inscriptionId) {
      return res.status(400).json({ error: 'inscriptionId required' });
    }

    const { data, error } = await supabase
      .from('reward_allocations')
      .select('inscription_id, nft_id, title, rarity, rarity_multiplier, mnee_claimable, bsv_claimable, bsv_total_earned, total_earned')
      .eq('inscription_id', inscriptionId)
      .limit(1)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'not found' });

    return res.json({ success: true, allocation: data });
  } catch (err) {
    console.error('[api/rewards] error', err);
    res.status(500).json({ error: 'internal' });
  }
};
