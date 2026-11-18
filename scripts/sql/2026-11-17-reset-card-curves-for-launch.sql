-- Clean reset of mint pricing state before the real launch. Today's testing bumped prices and
-- opened windows at whatever block each card was first queried at — long before the real launch
-- gate (block 1,000,000, see lib/launch-gate.js). Wiping these rows lets api/_pricing-state.js's
-- getOrInitCurve() recreate each card fresh (starting price, 0 editions, window opening at
-- LAUNCH_BLOCK) the next time anyone — including a real buyer — queries its price. No code
-- change needed after running this; it's pure data.
--
-- Does NOT touch reward_allocations/bsv_claimable — those test credits were already decided to
-- stay as-is. This only resets the price-curve/editions bookkeeping.
--
-- Same convention as the other migrations: run by hand in the Supabase SQL editor when you're
-- ready for it (not automatically run by this agent).

truncate table card_editions, card_curves;
