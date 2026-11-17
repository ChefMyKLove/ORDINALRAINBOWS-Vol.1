// api/_pricing-state.js
// Shared card_curves read/init/settle helpers for api/mint-price.js and api/mint-complete.js.
// DB-aware glue around the pure engine in lib/pricing.js (kept pure/DB-free on purpose).
const supabase = require('./_db');
const { openState, CONFIG } = require('../lib/pricing');

function rowToState(row) {
  return { pNum: BigInt(row.p_num), pDen: BigInt(row.p_den), hLast: BigInt(row.h_last) };
}

// Reads a card's curve row, creating it (opened at the given tip) on first-ever query.
// A card's mint window starts the moment someone first asks about its price — there's no
// separate launch-day "open the mint" step yet (early access / staggered starts are explicitly
// deferred, see the spec's own "Risks" + "Launch-day choreography: not decided yet").
async function getOrInitCurve(cardId, tip) {
  const { data: existing, error } = await supabase
    .from('card_curves').select('*').eq('card_id', cardId).maybeSingle();
  if (error) throw new Error(`card_curves read failed: ${error.message}`);
  if (existing) return existing;

  const state = openState(tip);
  const { data: inserted, error: insertErr } = await supabase
    .from('card_curves')
    .insert([{
      card_id: cardId,
      p_num: state.pNum.toString(), p_den: state.pDen.toString(), h_last: Number(state.hLast),
      start_block: tip, window_blocks: Number(CONFIG.windowBlocks),
      early_window_blocks: 100, edition_count: 0,
    }])
    .select().maybeSingle();
  if (!insertErr) return inserted;
  // Another request initialized this card_id between our read and our insert — not an error.
  if (insertErr.code === '23505') {
    const { data: raced } = await supabase.from('card_curves').select('*').eq('card_id', cardId).maybeSingle();
    if (raced) return raced;
  }
  throw new Error(`card_curves init failed: ${insertErr.message}`);
}

module.exports = { getOrInitCurve, rowToState };
