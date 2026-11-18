// lib/launch-gate.js
// Hard gate on real minting until a chosen BSV block height — lets the site go public
// (browsing, live prices) ahead of the actual marketing launch, without anyone being able to
// front-run it. Bypassed with the same ADMIN_SECRET already used by api/seed-mint.js and
// api/payout.js (sent as the x-admin-secret header) — share that value with test wallets
// rather than building a separate mechanism.
const { isValidAdminSecret } = require('./admin-secret');

const LAUNCH_BLOCK = 1000000;

module.exports = { LAUNCH_BLOCK, hasAdminBypass: isValidAdminSecret };
