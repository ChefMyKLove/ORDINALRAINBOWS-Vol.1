// HMAC-signed session cookie for the holder checker, plus the admin token check.
// The session holds short hashes of the addresses the holder proved control of (one per piece),
// so a whale with 64 pieces still fits in one cookie.
const crypto = require('crypto');

const COOKIE = 'checker_session';
const TTL_SECONDS = 15 * 60;

function secret() {
  const s = process.env.CHECKER_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('CHECKER_SESSION_SECRET must be set (32+ characters)');
  return s;
}

function mac(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function addressHash(address) {
  return crypto.createHash('sha256').update(address).digest('hex').slice(0, 16);
}

function createSessionCookie(addresses, now = Date.now()) {
  const h = [...new Set(addresses.map(addressHash))];
  const payload = Buffer.from(JSON.stringify({ h, exp: Math.floor(now / 1000) + TTL_SECONDS })).toString('base64url');
  return `${COOKIE}=${payload}.${mac(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}`;
}

// Returns the session's address hashes, or null if missing, tampered with or expired.
function readSession(req, now = Date.now()) {
  const m = String((req.headers && req.headers.cookie) || '').match(/(?:^|;\s*)checker_session=([^;]+)/);
  if (!m) return null;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return null;
  const given = Buffer.from(sig);
  const expected = Buffer.from(mac(payload));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const { h, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return exp > now / 1000 && Array.isArray(h) ? h : null;
  } catch (e) {
    return null;
  }
}

// Constant-time compare of the x-admin-token header against ADMIN_TOKEN (hashing first hides the length).
function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  const given = req.headers && req.headers['x-admin-token'];
  if (!expected || typeof given !== 'string') return false;
  const h = x => crypto.createHash('sha256').update(x).digest();
  return crypto.timingSafeEqual(h(given), h(expected));
}

module.exports = { createSessionCookie, readSession, addressHash, isAdmin, TTL_SECONDS };
