// Admin token check for the twonk claims admin routes.
const crypto = require('crypto');

// Constant-time compare of the x-admin-token header against ADMIN_TOKEN (hashing first hides the length).
function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  const given = req.headers && req.headers['x-admin-token'];
  if (!expected || typeof given !== 'string') return false;
  const h = x => crypto.createHash('sha256').update(x).digest();
  return crypto.timingSafeEqual(h(given), h(expected));
}

module.exports = { isAdmin };
