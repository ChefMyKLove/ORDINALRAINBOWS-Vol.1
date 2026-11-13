// Constant-time compare of the x-admin-secret header against ADMIN_SECRET (hashing first hides the length).
// Mirrors the pattern already established in lib/session.js for the twonk admin token.
const crypto = require('crypto');

function isValidAdminSecret(req) {
  const expected = process.env.ADMIN_SECRET;
  const given = req.headers && req.headers['x-admin-secret'];
  if (!expected || typeof given !== 'string') return false;
  const h = x => crypto.createHash('sha256').update(x).digest();
  return crypto.timingSafeEqual(h(given), h(expected));
}

module.exports = { isValidAdminSecret };
