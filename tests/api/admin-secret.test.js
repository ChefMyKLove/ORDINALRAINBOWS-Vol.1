const test = require('node:test');
const assert = require('node:assert');
const { fakeRes } = require('./_helpers');

process.env.ADMIN_SECRET = 'test-secret-value';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';

test('seed-mint rejects requests with no admin secret', async () => {
  const seedMint = require('../../api/seed-mint');
  const req = { method: 'POST', headers: {}, body: { inscription_id: 'x', referenced_ordinals: ['a'] } };
  const res = fakeRes();
  await seedMint(req, res);
  assert.strictEqual(res.statusCode, 401);
});

test('seed-mint rejects requests with the wrong admin secret', async () => {
  const seedMint = require('../../api/seed-mint');
  const req = { method: 'POST', headers: { 'x-admin-secret': 'wrong' }, body: { inscription_id: 'x', referenced_ordinals: ['a'] } };
  const res = fakeRes();
  await seedMint(req, res);
  assert.strictEqual(res.statusCode, 401);
});

test('direct payout endpoint rejects requests with no admin secret', async () => {
  const payout = require('../../api/payout');
  const req = { method: 'POST', headers: {}, body: { claimId: 1 } };
  const res = fakeRes();
  await payout(req, res);
  assert.strictEqual(res.statusCode, 401);
});
