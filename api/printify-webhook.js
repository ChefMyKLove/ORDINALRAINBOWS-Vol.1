/*
  api/printify-webhook.js
  Printify calls this on order events (registered by scripts/register-printify-webhook.js).
  For every line item that has SHIPPED and is an ORDINAL RAINBOWS print, the creator cut
  (retail price − production cost) is converted to BSV and allocated to that piece's holder
  (× rarity multiplier, via lib/rewards.allocateSale).

  Security: the URL carries ?key=PRINTIFY_WEBHOOK_KEY, and the notification body is never trusted —
  the order is re-fetched from Printify with our token, so a forged call can at most re-process a
  real order, which is idempotent per line item (print_rewards primary key).
*/

const crypto = require('crypto');
const fetch = require('node-fetch');
const supabase = require('./_db');
const manifest = require('../data/collection.json');
const { allocateSale, usdCentsToSats } = require('../lib/rewards');
const { sendAlert } = require('../lib/alert');

const SHOP_ID = 25429970; // ORDINALRAINBOWS Pop-Up Store
const API = 'https://api.printify.com/v1';

function keyOk(req) {
  const expected = process.env.PRINTIFY_WEBHOOK_KEY;
  const given = req.query && req.query.key;
  if (!expected || typeof given !== 'string') return false;
  const h = x => crypto.createHash('sha256').update(x).digest();
  return crypto.timingSafeEqual(h(given), h(expected));
}

async function printify(path) {
  const r = await fetch(API + path, {
    headers: { Authorization: `Bearer ${process.env.PRINTIFY_API_TOKEN}`, 'User-Agent': 'ordinalrainbows-site' },
    timeout: 10000,
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`printify ${path} → ${r.status}`);
  return r.json();
}

const isShipped = li => Boolean(li.fulfilled_at) || ['fulfilled', 'shipped', 'delivered'].includes(li.status);

async function processOrder(orderId) {
  const order = await printify(`/shops/${SHOP_ID}/orders/${encodeURIComponent(orderId)}.json`);
  if (!order) return { skipped: 'order not found in shop' };

  const results = [];
  let rate = null;
  for (const [i, li] of (order.line_items || []).entries()) {
    if (!isShipped(li)) { results.push({ line: i, skipped: 'not shipped yet' }); continue; }

    const product = await printify(`/shops/${SHOP_ID}/products/${encodeURIComponent(li.product_id)}.json`);
    const externalId = product && product.external && String(product.external.id);
    const piece = externalId && manifest.find(p => p.printifyId === externalId && p.origin);
    if (!piece) { results.push({ line: i, skipped: 'not an ORDINAL RAINBOWS piece' }); continue; }

    // ponytail: profit ignores shipping (the customer pays Printify's shipping); refunds after shipping are not clawed back.
    const profitCents = (Number(li.metadata && li.metadata.price) - Number(li.cost)) * Number(li.quantity || 1);
    if (!(profitCents > 0)) { results.push({ line: i, piece: piece.name, skipped: 'no profit' }); continue; }

    const conv = await usdCentsToSats(profitCents);
    rate = conv.rate;
    const inscriptionId = piece.origin.replace(/_0$/, '');
    const key = { order_id: String(order.id), line_key: `${li.product_id}:${li.variant_id}:${i}` };

    // Claim the line first: the primary key stops a repeated or concurrent notification allocating it twice.
    const { error: claimErr } = await supabase.from('print_rewards').insert([{
      ...key, inscription_id: inscriptionId, profit_cents: profitCents, usd_per_bsv: conv.rate, sats_allocated: 0,
    }]);
    if (claimErr) {
      if (claimErr.code === '23505') { results.push({ line: i, piece: piece.name, skipped: 'already rewarded' }); continue; }
      throw new Error(claimErr.message);
    }

    try {
      const added = await allocateSale(supabase, inscriptionId, conv.sats, `printify:${order.id}`);
      await supabase.from('print_rewards').update({ sats_allocated: added }).eq('order_id', key.order_id).eq('line_key', key.line_key);
      results.push({ line: i, piece: piece.name, profit_cents: profitCents, sats_added: added });
      sendAlert(
        `ORDINAL RAINBOWS: ${piece.name} shipped — ${added} sats owed`,
        `Order ${order.id} shipped. ${piece.name} holder is now owed ${added} sats. Check treasury is funded before they claim.`
      );
    } catch (e) {
      // Release the line so Printify's retry can allocate it.
      await supabase.from('print_rewards').delete().eq('order_id', key.order_id).eq('line_key', key.line_key);
      throw e;
    }
  }
  return { order_id: String(order.id), usd_per_bsv: rate, results };
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    if (!keyOk(req)) return res.status(401).json({ error: 'unauthorized' });

    const resource = (req.body && req.body.resource) || {};
    if (resource.type && resource.type !== 'order') return res.json({ ok: true, ignored: resource.type });
    const orderId = resource.id;
    if (typeof orderId !== 'string' && typeof orderId !== 'number') return res.json({ ok: true, ignored: 'no order id' });

    const out = await processOrder(String(orderId));
    console.log('[printify-webhook]', req.body && req.body.type, JSON.stringify(out));
    return res.json({ ok: true, ...out });
  } catch (err) {
    console.error('[printify-webhook] error', err.message);
    return res.status(500).json({ error: 'internal error' }); // non-2xx → Printify retries
  }
};

module.exports.processOrder = processOrder;
