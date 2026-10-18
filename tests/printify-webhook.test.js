const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { fakeRes } = require('./api/_helpers');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
process.env.PRINTIFY_API_TOKEN = 'test-token';
process.env.PRINTIFY_WEBHOOK_KEY = 'webhook-key-for-tests';

const manifest = require('../data/collection.json');
const piece = manifest.find(p => p.origin && p.printifyId && p.rarity === 'Uncommon'); // ×0.1
const inscriptionId = piece.origin.replace(/_0$/, '');

// ---- In-memory Supabase fake ----
const PK = { print_rewards: r => `${r.order_id}|${r.line_key}`, reward_allocations: r => r.inscription_id, claims: () => Math.random() };
const tables = { print_rewards: [], reward_allocations: [], claims: [] };
function query(table) {
  const filters = [];
  let op = 'select';
  let values = null;
  const match = r => filters.every(f => f(r));
  const b = {
    select() { return b; },
    insert(rows) { op = 'insert'; values = rows; return b; },
    update(v) { op = 'update'; values = v; return b; },
    delete() { op = 'delete'; return b; },
    eq(c, v) { filters.push(r => r[c] === v); return b; },
    maybeSingle() { return Promise.resolve({ data: tables[table].filter(match)[0] || null, error: null }); },
    then(resolve) {
      const rows = tables[table];
      if (op === 'insert') {
        for (const row of values) {
          if (rows.some(r => PK[table](r) === PK[table](row))) return resolve({ error: { code: '23505', message: 'duplicate' } });
          rows.push({ ...row });
        }
        return resolve({ data: values, error: null });
      }
      const hit = rows.filter(match);
      if (op === 'update') hit.forEach(r => Object.assign(r, values));
      if (op === 'delete') tables[table] = rows.filter(r => !match(r));
      return resolve({ data: hit.map(r => ({ ...r })), error: null });
    },
  };
  return b;
}

// ---- Printify + WhatsOnChain fake ----
const orders = {};
const products = {
  'api-prod-rainbow': { id: 'api-prod-rainbow', external: { id: piece.printifyId } },
  'api-prod-stickers': { id: 'api-prod-stickers', external: { id: '99999999' } },
};
async function fakeFetch(url) {
  const json = body => ({ ok: true, status: 200, json: async () => body });
  if (url.includes('exchangerate')) return json({ rate: 20, currency: 'USD' });
  const o = url.match(/orders\/([^/]+)\.json/);
  if (o) return orders[o[1]] ? json(orders[o[1]]) : { ok: false, status: 404, json: async () => ({}) };
  const p = url.match(/products\/([^/]+)\.json/);
  if (p) return products[p[1]] ? json(products[p[1]]) : { ok: false, status: 404, json: async () => ({}) };
  throw new Error('unexpected fetch ' + url);
}

function stub(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
stub(path.join(__dirname, '..', 'api', '_db'), { from: query });
stub('node-fetch', fakeFetch);
const webhook = require('../api/printify-webhook');

function reset() {
  tables.print_rewards = [];
  tables.claims = [];
  tables.reward_allocations = [{ inscription_id: inscriptionId, bsv_claimable: 0, bsv_total_earned: 0, rarity_multiplier: 0.1 }];
}
async function notify(orderId, key = process.env.PRINTIFY_WEBHOOK_KEY) {
  const res = fakeRes();
  await webhook({ method: 'POST', query: { key }, body: { type: 'order:shipment:created', resource: { id: orderId, type: 'order' } } }, res);
  return res;
}
const line = (over = {}) => ({ product_id: 'api-prod-rainbow', variant_id: 1, quantity: 1, cost: 1713, metadata: { price: 4099 }, status: 'fulfilled', fulfilled_at: '2026-10-17 10:00:00+00:00', ...over });
const claimable = () => tables.reward_allocations[0].bsv_claimable;

// $40.99 − $17.13 = $23.86 profit → at $20/BSV = 1.193 BSV = 119,300,000 sats creator cut → ×0.1 (Uncommon) = 11,930,000 sats
const EXPECTED = 11930000;

test('a shipped ORDINAL RAINBOWS print credits its piece: profit → BSV × rarity multiplier', async () => {
  reset();
  orders.o1 = { id: 'o1', line_items: [line()] };
  const res = await notify('o1');
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(claimable(), EXPECTED);
  assert.strictEqual(tables.print_rewards[0].sats_allocated, EXPECTED);
  assert.strictEqual(tables.claims.filter(c => c.status === 'allocated').length, 1);
});

test('the same notification twice does not pay twice', async () => {
  reset();
  orders.o2 = { id: 'o2', line_items: [line()] };
  await notify('o2');
  const again = await notify('o2');
  assert.strictEqual(again.statusCode, 200);
  assert.strictEqual(claimable(), EXPECTED);
  assert.strictEqual(again.body.results[0].skipped, 'already rewarded');
});

test('quantity multiplies the profit', async () => {
  reset();
  orders.o3 = { id: 'o3', line_items: [line({ quantity: 2 })] };
  await notify('o3');
  assert.strictEqual(claimable(), EXPECTED * 2);
});

test('unshipped items and non-rainbow products are skipped; a later shipment of the same order pays only the new item', async () => {
  reset();
  orders.o4 = { id: 'o4', line_items: [
    line({ status: 'in-production', fulfilled_at: null }),
    line({ product_id: 'api-prod-stickers', variant_id: 2 }),
  ] };
  const first = await notify('o4');
  assert.strictEqual(claimable(), 0);
  assert.deepStrictEqual(first.body.results.map(r => r.skipped), ['not shipped yet', 'not an ORDINAL RAINBOWS piece']);

  orders.o4.line_items[0] = line(); // second shipment: the rainbow print now ships
  await notify('o4');
  assert.strictEqual(claimable(), EXPECTED);
});

test('a wrong or missing webhook key is refused and nothing is credited', async () => {
  reset();
  orders.o5 = { id: 'o5', line_items: [line()] };
  assert.strictEqual((await notify('o5', 'wrong')).statusCode, 401);
  assert.strictEqual((await notify('o5', null)).statusCode, 401);
  assert.strictEqual(claimable(), 0);
});

test('an order that is not in our shop is ignored', async () => {
  reset();
  const res = await notify('not-our-order');
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.skipped, 'order not found in shop');
});

test('if crediting fails, the item is released so Printify’s retry can credit it', async () => {
  reset();
  tables.reward_allocations = []; // allocation row missing → allocateSale throws
  orders.o6 = { id: 'o6', line_items: [line()] };
  const res = await notify('o6');
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(tables.print_rewards.length, 0);

  tables.reward_allocations = [{ inscription_id: inscriptionId, bsv_claimable: 0, bsv_total_earned: 0, rarity_multiplier: 0.1 }];
  await notify('o6');
  assert.strictEqual(claimable(), EXPECTED);
});
