const test = require('node:test');
const assert = require('node:assert');
const { fakeRes } = require('./_helpers');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';

test('claim rejects a request with no signature or timestamp', async () => {
  const claim = require('../../api/claim');
  const req = { method: 'POST', body: { inscriptionId: 'a'.repeat(64), ordAddress: 'addr1', bsvAddress: 'addr2' } };
  const res = fakeRes();
  await claim(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('claim rejects a malformed inscriptionId', async () => {
  const claim = require('../../api/claim');
  const req = { method: 'POST', body: { inscriptionId: 'not-a-valid-id', ordAddress: 'addr1', bsvAddress: 'addr2', signature: 'x', timestamp: Math.floor(Date.now() / 1000) } };
  const res = fakeRes();
  await claim(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('claim rejects an expired timestamp', async () => {
  const claim = require('../../api/claim');
  const old = Math.floor(Date.now() / 1000) - 9999;
  const req = { method: 'POST', body: { inscriptionId: 'a'.repeat(64), ordAddress: 'addr1', bsvAddress: 'addr2', signature: 'x', timestamp: old } };
  const res = fakeRes();
  await claim(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('claim rejects an invalid signature before touching the network', async () => {
  const claim = require('../../api/claim');
  const req = { method: 'POST', body: { inscriptionId: 'a'.repeat(64), ordAddress: 'addr1', bsvAddress: 'addr2', signature: 'bogus-signature-value', timestamp: Math.floor(Date.now() / 1000) } };
  const res = fakeRes();
  await claim(req, res);
  assert.strictEqual(res.statusCode, 403);
});
