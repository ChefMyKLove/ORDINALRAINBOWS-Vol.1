const test = require('node:test');
const assert = require('node:assert');
const { fakeRes } = require('./_helpers');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';

test('mint-complete rejects a request with no payment_txid', async () => {
  const mintComplete = require('../../api/mint-complete');
  const req = { method: 'POST', body: { holder_pool_sats: 1000 } };
  const res = fakeRes();
  await mintComplete(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('mint-complete rejects a request with no holder_pool_sats', async () => {
  const mintComplete = require('../../api/mint-complete');
  const req = { method: 'POST', body: { payment_txid: 'a'.repeat(64) } };
  const res = fakeRes();
  await mintComplete(req, res);
  assert.strictEqual(res.statusCode, 400);
});
